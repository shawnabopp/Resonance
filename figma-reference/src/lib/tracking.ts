import type { Signals } from './creature'

const VER = '0.10.14'
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`
const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
type P = { x: number; y: number }
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

let visionP: Promise<any> | null = null
function vision() {
  if (!visionP) {
    const url = `${CDN}/vision_bundle.mjs`
    visionP = import(/* @vite-ignore */ url).then(async (v: any) => ({ v, files: await v.FilesetResolver.forVisionTasks(`${CDN}/wasm`) }))
    visionP.catch(() => { visionP = null })
  }
  return visionP
}

async function create(kind: 'face' | 'hand' | 'pose') {
  const { v, files } = await vision()
  const make = async (delegate: 'GPU' | 'CPU') => {
    const baseOptions = { modelAssetPath: MODELS[kind], delegate }
    if (kind === 'face') return v.FaceLandmarker.createFromOptions(files, { baseOptions, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
    if (kind === 'hand') return v.HandLandmarker.createFromOptions(files, { baseOptions, runningMode: 'VIDEO', numHands: 1 })
    return v.PoseLandmarker.createFromOptions(files, { baseOptions, runningMode: 'VIDEO', numPoses: 1 })
  }
  try { return await make('GPU') } catch { return await make('CPU') }
}

export class Mic {
  ctx: AudioContext; an: AnalyserNode; data: Float32Array<ArrayBuffer>
  avg = 0.02; lastSpike = 0; muted = false
  constructor(stream: MediaStream) {
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaStreamSource(stream)
    this.an = this.ctx.createAnalyser()
    this.an.fftSize = 1024
    this.data = new Float32Array(this.an.fftSize)
    src.connect(this.an)
    this.ctx.resume().catch(() => {})
  }
  update(s: Signals) {
    if (this.muted) { s.level = 0; return }
    this.an.getFloatTimeDomainData(this.data)
    let sum = 0
    for (let i = 0; i < this.data.length; i++) sum += this.data[i] * this.data[i]
    const rms = Math.sqrt(sum / this.data.length)
    const now = performance.now()
    if (rms > 0.2 && rms > this.avg * 3.2 && now - this.lastSpike > 1500) { s.spike++; this.lastSpike = now }
    this.avg = this.avg * 0.97 + rms * 0.03
    s.level = clamp((rms - 0.008) * 7)
  }
  close() { this.ctx.close().catch(() => {}) }
}

export class Tracker {
  face: any = null; hand: any = null; pose: any = null
  video: HTMLVideoElement; s: Signals; mic: Mic | null
  raf = 0; frameN = 0; lastVT = -1
  prevHand: P | null = null; prevHandT = 0
  prevPose: P[] | null = null; prevPoseT = 0
  constructor(video: HTMLVideoElement, s: Signals, mic: Mic | null) { this.video = video; this.s = s; this.mic = mic }

  async load(movement: boolean) {
    this.face = await create('face')
    if (movement) await this.enableMovement()
  }
  async enableMovement() {
    if (!this.hand) this.hand = await create('hand')
    if (!this.pose) this.pose = await create('pose')
  }
  start() { const loop = () => { this.raf = requestAnimationFrame(loop); this.tick() }; loop() }
  stop() {
    cancelAnimationFrame(this.raf)
    for (const m of [this.face, this.hand, this.pose]) try { m?.close() } catch {}
  }

  tick() {
    this.mic?.update(this.s)
    const v = this.video
    if (v.readyState < 2 || v.currentTime === this.lastVT) return
    this.lastVT = v.currentTime
    const now = performance.now()
    this.frameN++
    const s = this.s
    try {
      if (this.face) {
        const r = this.face.detectForVideo(v, now)
        const bs = r.faceBlendshapes?.[0]?.categories
        if (bs) {
          const b: Record<string, number> = {}
          for (const c of bs) b[c.categoryName] = c.score
          const smile = clamp(((b.mouthSmileLeft + b.mouthSmileRight) / 2 - 0.3) / 0.4)
          const frown = (b.mouthFrownLeft + b.mouthFrownRight) / 2
          const sad = clamp((frown * 0.8 + b.browInnerUp * 0.6 + (b.mouthPressLeft + b.mouthPressRight) * 0.15 - 0.28) / 0.35) * (1 - smile)
          const brows = (b.browOuterUpLeft + b.browOuterUpRight) / 2
          const eyes = (b.eyeWideLeft + b.eyeWideRight) / 2
          const surprise = clamp((brows * 0.6 + eyes * 0.5 - 0.25) / 0.35) * clamp(0.3 + b.jawOpen * 1.6) * (1 - smile * 0.7)
          s.smile = smile; s.sad = sad * (1 - surprise); s.surprise = surprise
          s.facePresent = true
          const lm = r.faceLandmarks?.[0]
          if (lm) s.faceX = 1 - lm[1].x
        } else {
          s.facePresent = false; s.smile = s.sad = s.surprise = 0
        }
      }
      if (this.hand && this.frameN % 2 === 0) {
        const r = this.hand.detectForVideo(v, now)
        const lm: P[] | undefined = r.landmarks?.[0]
        if (lm) {
          const palm = dist(lm[0], lm[9]) || 0.001
          const tips = [8, 12, 16, 20].reduce((a, i) => a + dist(lm[i], lm[0]), 0) / 4
          s.handOpen = clamp((tips / palm - 1.1) / 0.7)
          const p = { x: 1 - lm[9].x, y: lm[9].y }
          if (this.prevHand) {
            const sp = dist(p, this.prevHand) / Math.max(0.016, (now - this.prevHandT) / 1000)
            s.handSpeed = s.handSpeed * 0.6 + sp * 0.4
          }
          this.prevHand = p; this.prevHandT = now
          s.handX = p.x; s.handY = p.y; s.handPresent = true
        } else { s.handPresent = false; this.prevHand = null; s.handSpeed = 0 }
      }
      if (this.pose && this.frameN % 3 === 0) {
        const r = this.pose.detectForVideo(v, now)
        const lm: P[] | undefined = r.landmarks?.[0]
        if (lm) {
          const ids = [11, 12, 13, 14, 15, 16, 23, 24]
          const pts = ids.map((i) => ({ x: lm[i].x, y: lm[i].y }))
          if (this.prevPose) {
            const dtp = Math.max(0.03, (now - this.prevPoseT) / 1000)
            const vel = pts.reduce((a, p, i) => a + dist(p, this.prevPose![i]), 0) / pts.length / dtp
            s.bodyMotion = s.bodyMotion * 0.8 + clamp((vel - 0.05) / 0.6) * 0.2
          }
          this.prevPose = pts; this.prevPoseT = now
          s.bodyX = 1 - (lm[11].x + lm[12].x) / 2
          s.bodyPresent = true
        } else { s.bodyPresent = false; this.prevPose = null; s.bodyMotion *= 0.9 }
      }
    } catch { /* skip frame */ }
  }
}
