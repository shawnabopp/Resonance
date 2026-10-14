export type Shape = 'seed' | 'cloud' | 'bloom'

export type Signals = {
  smile: number
  sad: number
  surprise: number
  level: number
  spike: number
  facePresent: boolean
  faceX: number
  handPresent: boolean
  handX: number
  handY: number
  handOpen: number
  handSpeed: number
  bodyPresent: boolean
  bodyX: number
  bodyMotion: number
}

export const emptySignals = (): Signals => ({
  smile: 0, sad: 0, surprise: 0, level: 0, spike: 0,
  facePresent: false, faceX: 0.5,
  handPresent: false, handX: 0.5, handY: 0.5, handOpen: 0.5, handSpeed: 0,
  bodyPresent: false, bodyX: 0.5, bodyMotion: 0,
})

type RGB = [number, number, number]
const WARM: RGB = [242, 202, 112]
const BLUE: RGB = [143, 180, 230]
const PURPLE: RGB = [186, 158, 236]

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const gauss = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const randDir = (): RGB => {
  const z = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  return [r * Math.cos(a), z, r * Math.sin(a)]
}

function generate(shape: Shape, n: number) {
  const pts = new Float32Array(n * 3)
  const lumps: RGB[] = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4
    return [Math.cos(a) * 0.45, (Math.random() - 0.5) * 0.35, Math.sin(a) * 0.45]
  })
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0
    const r = Math.random()
    if (shape === 'seed') {
      if (r < 0.78) {
        const d = randDir()
        const rad = Math.pow(Math.random(), 1.9) * 0.95
        ;[x, y, z] = [d[0] * rad, d[1] * rad * 1.12, d[2] * rad]
      } else {
        const a = Math.random() * Math.PI * 2
        const rr = 0.95 + gauss() * 0.05
        x = Math.cos(a) * rr
        z = Math.sin(a) * rr
        y = gauss() * 0.03 + Math.sin(a * 2) * 0.08
        const tilt = 0.45
        const yy = y * Math.cos(tilt) - z * Math.sin(tilt)
        z = y * Math.sin(tilt) + z * Math.cos(tilt)
        y = yy
      }
    } else if (shape === 'cloud') {
      if (r < 0.2) {
        const d = randDir(); const rad = Math.pow(Math.random(), 1.5) * 0.35
        ;[x, y, z] = [d[0] * rad, d[1] * rad, d[2] * rad]
      } else {
        const l = lumps[i % lumps.length]
        x = l[0] + gauss() * 0.26
        y = l[1] * 0.8 + gauss() * 0.2
        z = l[2] + gauss() * 0.26
      }
    } else {
      if (r < 0.22) {
        const d = randDir(); const rad = Math.pow(Math.random(), 1.6) * 0.28
        ;[x, y, z] = [d[0] * rad, d[1] * rad, d[2] * rad]
      } else {
        const k = i % 6
        const s = Math.pow(Math.random(), 0.8)
        const a = (k / 6) * Math.PI * 2
        const w = Math.sin(s * Math.PI) * 0.32 * (Math.random() - 0.5) * 2
        const len = 0.2 + s * 0.85
        const lx = len, lz = w
        x = lx * Math.cos(a) - lz * Math.sin(a)
        z = lx * Math.sin(a) + lz * Math.cos(a)
        y = -s * s * 0.45 + gauss() * 0.025 + 0.15
      }
    }
    pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z
  }
  return pts
}

type Opts = { count: number; interactive?: boolean; shape: Shape; theme: RGB; familiarity?: number; sizeFactor?: number }

export class Creature {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  w = 0; h = 0; dpr = 1
  n: number
  base: Float32Array
  from: Float32Array
  morph = 1
  o: Float32Array; v: Float32Array
  sz: Float32Array; br: Float32Array; ph: Float32Array
  color: RGB; theme: RGB
  cx = 0; cy = 0
  fam: number
  famLocked: boolean
  interactive: boolean
  sizeFactor: number
  s: Signals = emptySignals()
  sm = { smile: 0, sad: 0, sur: 0, level: 0, open: 0.5, motion: 0, expand: 1, scale: 0.84 }
  t = 0; tt = 0; rot = 0; last = 0; raf = 0
  lastSpike = 0; lastStartle = 0
  ro: ResizeObserver

  constructor(canvas: HTMLCanvasElement, o: Opts) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.n = o.count
    this.interactive = !!o.interactive
    this.sizeFactor = o.sizeFactor ?? 1
    this.fam = o.familiarity ?? 0.04
    this.famLocked = o.familiarity !== undefined
    this.base = generate(o.shape, this.n)
    this.from = this.base
    this.o = new Float32Array(this.n * 3)
    this.v = new Float32Array(this.n * 3)
    this.sz = new Float32Array(this.n)
    this.br = new Float32Array(this.n)
    this.ph = new Float32Array(this.n)
    for (let i = 0; i < this.n; i++) {
      this.sz[i] = 0.6 + Math.pow(Math.random(), 3) * 1.6
      this.br[i] = 0.42 + Math.pow(Math.random(), 2) * 0.58
      this.ph[i] = Math.random() * Math.PI * 2
    }
    this.theme = [...o.theme] as RGB
    this.color = [...o.theme] as RGB
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.cx = this.w / 2; this.cy = this.h / 2
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  resize() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = r.width; this.h = r.height
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr))
    this.cx = r.width / 2; this.cy = r.height / 2
  }

  setShape(shape: Shape) {
    const cur = new Float32Array(this.n * 3)
    const k = this.ease(this.morph)
    for (let i = 0; i < cur.length; i++) cur[i] = this.from[i] + (this.base[i] - this.from[i]) * k
    this.from = cur
    this.base = generate(shape, this.n)
    this.morph = 0
  }
  setTheme(c: RGB) { this.theme = [...c] as RGB }
  get familiarity() { return this.fam }
  ease(x: number) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }

  scatter(power: number) {
    for (let i = 0; i < this.n; i++) {
      const bx = this.base[i * 3], by = this.base[i * 3 + 1], bz = this.base[i * 3 + 2]
      const d = Math.hypot(bx, by, bz) || 1
      const f = power * (0.6 + Math.random() * 1.4)
      this.v[i * 3] += (bx / d + gauss() * 0.4) * f
      this.v[i * 3 + 1] += (by / d + gauss() * 0.4) * f
      this.v[i * 3 + 2] += (bz / d + gauss() * 0.4) * f
    }
  }

  snapshot(): string { return this.canvas.toDataURL('image/png') }

  destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect() }

  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const s = this.s, sm = this.sm
    const k3 = 1 - Math.exp(-dt * 3)
    sm.smile += (s.smile - sm.smile) * k3
    sm.sad += (s.sad - sm.sad) * k3
    sm.sur += (s.surprise - sm.sur) * k3
    sm.level += (s.level - sm.level) * (1 - Math.exp(-dt * 10))
    sm.open += ((s.handPresent ? s.handOpen : 0.5) - sm.open) * k3
    sm.motion += ((s.bodyPresent ? s.bodyMotion : 0) - sm.motion) * (1 - Math.exp(-dt * 2))

    if (this.morph < 1) this.morph = Math.min(1, this.morph + dt * 0.7)

    // familiarity grows with gentle, sustained interaction
    const fast = s.handPresent && s.handSpeed > 1.8
    if (!this.famLocked) {
      const engage = (s.facePresent ? 0.35 : 0) + Math.min(sm.level, 0.35) * 1.2 +
        (s.handPresent && !fast ? 0.4 : 0) + sm.smile * 0.3 + Math.min(sm.motion, 0.5) * 0.3
      this.fam = clamp(this.fam + dt * (engage * 0.011 - 0.0015), 0.02, 1)
    }
    const fam = this.fam

    if (s.spike !== this.lastSpike) {
      this.lastSpike = s.spike
      this.scatter(2.6)
      if (!this.famLocked) this.fam = clamp(this.fam - 0.03, 0.02, 1)
    }
    if (fast && now - this.lastStartle > 1500) {
      this.lastStartle = now
      this.scatter(1.2)
      if (!this.famLocked) this.fam = clamp(this.fam - 0.015, 0.02, 1)
    }

    const speed = 1 - 0.5 * sm.sad + 0.35 * sm.smile
    this.t += dt * speed
    this.tt += dt
    const t = this.t

    // colour: expressions tint independently of theme
    const sum = sm.smile + sm.sad + sm.sur
    const mix = clamp(sum * 1.2)
    const tgt: RGB = [0, 0, 0]
    for (let c = 0; c < 3; c++) {
      const e = sum > 0.001 ? (WARM[c] * sm.smile + BLUE[c] * sm.sad + PURPLE[c] * sm.sur) / sum : this.theme[c]
      tgt[c] = this.theme[c] * (1 - mix) + e * mix
      this.color[c] += (tgt[c] - this.color[c]) * (1 - Math.exp(-dt * 1.4))
    }

    const handOpenEff = s.handPresent ? (sm.open - 0.5) * 0.6 : 0
    const expandT = 1 + sm.sur * 0.5 + handOpenEff + sm.level * 0.12 - sm.sad * 0.06
    sm.expand += (expandT - sm.expand) * (1 - Math.exp(-dt * 2.5))
    const scaleT = 0.84 + fam * 0.22 + sm.smile * 0.12 * (0.4 + fam)
    sm.scale += (scaleT - sm.scale) * (1 - Math.exp(-dt * 0.8))

    const W = this.w, H = this.h
    const R = Math.min(W, H) * 0.331 * sm.scale
    let tx = W / 2, ty = H / 2
    if (this.interactive) {
      if (s.facePresent) tx += (s.faceX - 0.5) * W * 0.25 * fam
      if (s.bodyPresent) tx += (s.bodyX - 0.5) * W * 0.25 * (0.3 + fam)
      if (s.handPresent && !fast) {
        const wgt = 0.1 + fam * 0.6
        tx += (s.handX * W - tx) * wgt
        ty += (s.handY * H - ty) * wgt
      }
      if (fast) { tx += (tx - s.handX * W) * 0.4; ty += (ty - s.handY * H) * 0.2 }
      tx += Math.sin(t * 2.6) * R * 0.14 * sm.smile
      ty += Math.abs(Math.sin(t * 3.4)) * -R * 0.1 * sm.smile
      const m = Math.min(W, H) * 0.08
      tx = clamp(tx, R * 0.6 + m, W - R * 0.6 - m)
      ty = clamp(ty, R * 0.6 + m, H - R * 0.6 - m)
    }
    ty += Math.sin(this.tt * 0.7) * R * 0.04
    const follow = 1 - Math.exp(-dt * (0.6 + fam * 1.6))
    this.cx += (tx - this.cx) * follow
    this.cy += (ty - this.cy) * follow

    this.rot += dt * (0.12 + sm.motion * 1.4 + sm.level * 0.25) * speed
    const sway = Math.sin(this.tt * 1.1) * sm.motion * 0.45 + (s.bodyPresent ? (s.bodyX - 0.5) * 0.5 : 0)
    const tiltX = 0.25 + Math.sin(t * 0.3) * 0.1

    const spring = 5 * (0.35 + fam * 0.8)
    const damp = Math.exp(-dt * 2.2)
    const ctx = this.ctx, dpr = this.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'

    const glob = clamp(0.62 + fam * 0.38 + sm.smile * 0.12 + sm.level * 0.12, 0, 1.15)
    const [cr, cg, cb] = this.color.map(Math.round)
    const col = `rgb(${cr},${cg},${cb})`

    const g = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, R * 1.5 * sm.expand)
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.13 * glob})`)
    g.addColorStop(0.35, `rgba(${cr},${cg},${cb},${0.05 * glob})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(this.cx - R * 2, this.cy - R * 2, R * 4, R * 4)

    const breathe0 = 1 + 0.05 * Math.sin(t * 1.25)
    const cR = R * 0.22 * breathe0 * (0.8 + glob * 0.4)
    const g2 = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, cR)
    g2.addColorStop(0, `rgba(255,255,250,${0.5 * glob})`)
    g2.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.3 * glob})`)
    g2.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g2
    ctx.fillRect(this.cx - cR, this.cy - cR, cR * 2, cR * 2)

    ctx.fillStyle = col
    const cosR = Math.cos(this.rot), sinR = Math.sin(this.rot)
    const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX)
    const cosZ = Math.cos(sway), sinZ = Math.sin(sway)
    const mk = this.ease(this.morph)
    const lvl = sm.level
    const sf = this.sizeFactor

    for (let i = 0; i < this.n; i++) {
      const j = i * 3
      let x = this.from[j] + (this.base[j] - this.from[j]) * mk
      let y = this.from[j + 1] + (this.base[j + 1] - this.from[j + 1]) * mk
      let z = this.from[j + 2] + (this.base[j + 2] - this.from[j + 2]) * mk
      const ph = this.ph[i]
      const d = Math.sqrt(x * x + y * y + z * z)
      const breathe = 1 + 0.05 * Math.sin(t * 1.25 - d * 2.2)
      const ripple = lvl * 0.2 * Math.sin(d * 13 - this.tt * 9 + ph * 0.2)
      const m = sm.expand * breathe * (1 + ripple)
      const vib = lvl * 0.035
      x = x * m + Math.sin(t * 0.6 + ph) * 0.025 + Math.sin(this.tt * 37 + ph * 7) * vib
      y = y * m + Math.cos(t * 0.5 + ph * 1.3) * 0.025 + Math.cos(this.tt * 41 + ph * 5) * vib
      z = z * m + Math.sin(t * 0.4 + ph * 0.7) * 0.025

      // scatter offsets with spring regroup
      this.v[j] = (this.v[j] - this.o[j] * spring * dt) * damp
      this.v[j + 1] = (this.v[j + 1] - this.o[j + 1] * spring * dt) * damp
      this.v[j + 2] = (this.v[j + 2] - this.o[j + 2] * spring * dt) * damp
      this.o[j] += this.v[j] * dt; this.o[j + 1] += this.v[j + 1] * dt; this.o[j + 2] += this.v[j + 2] * dt

      let rx = x * cosR + z * sinR
      let rz = -x * sinR + z * cosR
      let ry = y * cosX - rz * sinX
      rz = y * sinX + rz * cosX
      const sx0 = rx * cosZ - ry * sinZ
      ry = rx * sinZ + ry * cosZ
      rx = sx0
      rx += this.o[j]; ry += this.o[j + 1]; rz += this.o[j + 2]

      const p = 2.4 / (2.4 + rz)
      const px = this.cx + rx * R * p
      const py = this.cy + ry * R * p
      const depth = clamp(0.55 + (1 - rz) * 0.35, 0.4, 1)
      const twinkle = 0.82 + 0.18 * Math.sin(this.tt * 1.7 + ph * 3)
      const core = 1 + Math.max(0, 0.5 - d) * 1.2 + Math.max(0, d - 0.3) * 0.9
      const a = clamp(this.br[i] * glob * depth * twinkle * core * 0.95, 0, 1)
      const size = this.sz[i] * p * sf
      ctx.globalAlpha = a
      ctx.fillRect(px - size / 2, py - size / 2, size, size)
      if (i % 11 === 0) {
        const gs = size * 4
        ctx.globalAlpha = a * 0.12
        ctx.fillRect(px - gs / 2, py - gs / 2, gs, gs)
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
