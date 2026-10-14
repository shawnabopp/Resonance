import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Creature, emptySignals, type Shape, type Signals } from './lib/creature'
import { Mic, Tracker } from './lib/tracking'

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const THEMES = [
  { name: 'Red', ui: '#B86B6B', p: '#E58A8A' },
  { name: 'Yellow', ui: '#C5AD68', p: '#E8CE82' },
  { name: 'Green', ui: '#819B83', p: '#A2D3AB' },
  { name: 'Blue', ui: '#7895B5', p: '#94BFE8' },
  { name: 'Purple', ui: '#9985B2', p: '#BBA0E0' },
  { name: 'Pink', ui: '#C18FA5', p: '#E9ACC9' },
  { name: 'White', ui: '#E4E4DE', p: '#F5F5EF' },
  { name: 'Orange', ui: '#C18B65', p: '#E9AD7E' },
]
const deep = (ui: string) => {
  if (ui === '#819B83') return '#304B3D'
  const [r, g, b] = hex(ui)
  return `rgb(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)})`
}
const SHAPES: { id: Shape; name: string; note: string }[] = [
  { id: 'seed', name: 'Seed', note: 'Compact and quiet' },
  { id: 'cloud', name: 'Cloud', note: 'Soft and drifting' },
  { id: 'bloom', name: 'Bloom', note: 'Open and curious' },
]
type Stage = 'welcome' | 'prep' | 'loading' | 'denied' | 'error' | 'live' | 'demo'
type Panel = 'shape' | 'theme' | 'help' | null

const isMobile = () => window.matchMedia('(max-width: 767px), (pointer: coarse)').matches

function CreatureCanvas({ shape, theme, count, interactive, familiarity, signals, onReady, className, sizeFactor }: {
  shape: Shape; theme: string; count: number; interactive?: boolean; familiarity?: number
  signals?: Signals; onReady?: (c: Creature) => void; className?: string; sizeFactor?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cRef = useRef<Creature | null>(null)
  useEffect(() => {
    const c = new Creature(ref.current!, { count, shape, theme: hex(theme), interactive, familiarity, sizeFactor })
    if (signals) c.s = signals
    cRef.current = c
    onReady?.(c)
    return () => c.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { cRef.current?.setShape(shape) }, [shape])
  useEffect(() => { cRef.current?.setTheme(hex(theme)) }, [theme])
  return <canvas ref={ref} className={className} />
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const I = {
  camera: 'M4 8h3l2-2.5h6L17 8h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  shape: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
  theme: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.2-1.6-.5-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z M7.5 11.5h.01 M10 7.5h.01 M15 7.5h.01',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21',
  micOff: 'M4 4l16 16 M9 9v3a3 3 0 0 0 5 2.2 M15 10V6a3 3 0 0 0-5.8-1 M5.5 11a6.5 6.5 0 0 0 10.6 5 M18.5 11a6.4 6.4 0 0 1-.6 2.7 M12 17.5V21',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01',
  exit: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeOff: 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8 M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sliders: 'M4 6h10 M18 6h2 M16 4v4 M4 12h4 M12 12h8 M10 10v4 M4 18h12 M20 18h0 M18 16v4',
  close: 'M6 6l12 12 M18 6L6 18',
}

function CtrlBtn({ label, icon, onClick, active, accent }: { label: string; icon: string; onClick: () => void; active?: boolean; accent: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="group flex flex-1 flex-col items-center gap-1 rounded-full px-2 py-2 text-white/70 transition-colors duration-300 hover:text-white md:flex-none md:px-3"
      style={active ? { color: accent } : undefined}>
      <Icon d={icon} />
      <span className="text-[10px] tracking-wide">{label}</span>
    </button>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-30 md:hidden" onClick={onClose} />
      <div className="fade-in fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-white/10 bg-black/90 px-6 pb-8 pt-4 backdrop-blur-xl md:absolute md:inset-x-auto md:bottom-24 md:left-1/2 md:w-[360px] md:-translate-x-1/2 md:rounded-2xl md:border md:pb-5">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 md:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-white/50">{title}</span>
          <button onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white"><Icon d={I.close} /></button>
        </div>
        {children}
      </div>
    </>
  )
}

function ThemePicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {THEMES.map((t, i) => (
        <button key={t.name} onClick={() => onChange(i)} aria-label={t.name} title={t.name}
          className="relative h-7 w-7 rounded-full transition-transform duration-300 hover:scale-110"
          style={{ background: t.ui, boxShadow: i === value ? `0 0 0 2px #000, 0 0 0 3px ${t.ui}` : undefined }} />
      ))}
    </div>
  )
}

function ShapePicker({ value, onChange, theme, small }: { value: Shape; onChange: (s: Shape) => void; theme: string; small?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SHAPES.map((s) => (
        <button key={s.id} onClick={() => onChange(s.id)}
          className="rounded-2xl border p-2 text-left transition-colors duration-500"
          style={{ borderColor: value === s.id ? theme : 'rgba(255,255,255,0.08)' }}>
          <CreatureCanvas shape={s.id} theme={theme} count={small ? 390 : 625} familiarity={0.65} sizeFactor={0.8} className={`block w-full ${small ? 'h-16' : 'h-24'}`} />
          <div className="mt-1 px-1 text-sm">{s.name}</div>
          {!small && <div className="px-1 text-[11px] text-white/40">{s.note}</div>}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-xs text-white/60">
      <span className="w-16 shrink-0">{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full" />
    </label>
  )
}

export default function App() {
  const [stage, setStage] = useState<Stage>('welcome')
  const [shape, setShape] = useState<Shape>('seed')
  const [themeI, setThemeI] = useState(2)
  const [panel, setPanel] = useState<Panel>(null)
  const [camVisible, setCamVisible] = useState(true)
  const [muted, setMuted] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [mobile] = useState(isMobile)
  const [movement, setMovement] = useState(!isMobile())
  const [movementLoading, setMovementLoading] = useState(false)
  const [ui, setUi] = useState({ face: false, hand: false, body: false, fam: 0, smile: 0, sad: 0, sur: 0, level: 0 })
  const [tipI, setTipI] = useState(0)
  const [demoOpen, setDemoOpen] = useState(true)
  const [demo, setDemo] = useState({ smile: 0, sad: 0, surprise: 0, level: 0, hand: false, open: 0.5, motion: 0 })
  const [flash, setFlash] = useState(false)

  const theme = THEMES[themeI]
  const signals = useRef<Signals>(emptySignals())
  const creature = useRef<Creature | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const tracker = useRef<Tracker | null>(null)
  const mic = useRef<Mic | null>(null)
  const pointer = useRef({ x: 0, y: 0, t: 0 })
  const session = useRef(0)

  const teardown = () => {
    session.current++
    tracker.current?.stop(); tracker.current = null
    mic.current?.close(); mic.current = null
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null
    Object.assign(signals.current, { ...emptySignals(), spike: signals.current.spike })
  }
  useEffect(() => teardown, [])

  const start = async () => {
    teardown()
    const id = session.current
    const live = () => session.current === id
    setStage('loading'); setLoadMsg('Waiting for camera and microphone…')
    let st: MediaStream
    try {
      st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: true })
    } catch (e: any) {
      if (!live()) return
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      setErrMsg(denied ? 'Camera and microphone access was blocked. Allow access in your browser settings, then try again.' : 'No camera or microphone could be found.')
      setStage('denied'); return
    }
    if (!live()) { st.getTracks().forEach((t) => t.stop()); return }
    stream.current = st
    try {
      setLoadMsg('Listening…')
      mic.current = new Mic(st)
      mic.current.muted = muted
      setLoadMsg('Learning to see you…')
      const v = video.current!
      v.srcObject = st
      await v.play().catch(() => {})
      const t = new Tracker(v, signals.current, mic.current)
      await t.load(movement)
      if (!live()) { t.stop(); return }
      tracker.current = t
      t.start()
      setStage('live')
    } catch {
      if (!live()) return
      teardown()
      setErrMsg('Live tracking could not load on this device or connection.')
      setStage('error')
    }
  }

  const startDemo = () => { teardown(); setStage('demo'); setDemoOpen(true) }
  const exit = () => {
    teardown()
    if (video.current) video.current.srcObject = null
    setPanel(null); setStage('welcome')
  }

  const enableMovement = async () => {
    setMovement(true)
    if (!tracker.current) return
    setMovementLoading(true)
    try { await tracker.current.enableMovement() } catch { setMovement(false) }
    setMovementLoading(false)
  }

  useEffect(() => { if (mic.current) mic.current.muted = muted; if (muted) signals.current.level = 0 }, [muted])

  // feed demo values into signals (clearly simulated)
  useEffect(() => {
    if (stage !== 'demo') return
    const s = signals.current
    s.smile = demo.smile; s.sad = demo.sad; s.surprise = demo.surprise; s.level = muted ? 0 : demo.level
    s.facePresent = true; s.handOpen = demo.open; s.bodyPresent = demo.motion > 0.01; s.bodyMotion = demo.motion
    if (!demo.hand) s.handPresent = false
  }, [demo, stage, muted])
  useEffect(() => {
    if (stage !== 'demo' || demo.motion < 0.01) return
    let raf = 0
    const loop = () => { signals.current.bodyX = 0.5 + Math.sin(performance.now() / 700) * 0.25 * demo.motion; raf = requestAnimationFrame(loop) }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [stage, demo.motion])
  useEffect(() => {
    if (stage !== 'demo') return
    const id = setInterval(() => { const s = signals.current; s.handSpeed *= 0.7 }, 100)
    return () => clearInterval(id)
  }, [stage])

  const onPointer = (e: React.PointerEvent) => {
    if (stage !== 'demo' || !demo.hand) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    const now = performance.now(), p = pointer.current
    const dt = Math.max(0.016, (now - p.t) / 1000)
    const sp = Math.hypot(x - p.x, y - p.y) / dt
    const s = signals.current
    s.handSpeed = s.handSpeed * 0.6 + sp * 0.4
    s.handX = x; s.handY = y; s.handPresent = true
    pointer.current = { x, y, t: now }
  }

  // poll for overlay status
  useEffect(() => {
    if (stage !== 'live' && stage !== 'demo') return
    const id = setInterval(() => {
      const s = signals.current
      setUi({ face: s.facePresent, hand: s.handPresent, body: s.bodyPresent, fam: creature.current?.familiarity ?? 0, smile: s.smile, sad: s.sad, sur: s.surprise, level: s.level })
    }, 300)
    const tid = setInterval(() => setTipI((i) => i + 1), 7000)
    return () => { clearInterval(id); clearInterval(tid) }
  }, [stage])

  const screenshot = () => {
    const url = creature.current?.snapshot()
    if (!url) return
    const a = document.createElement('a')
    a.href = url; a.download = `resonance-${Date.now()}.png`; a.click()
    setFlash(true); setTimeout(() => setFlash(false), 500)
  }

  const tips = movement
    ? ['Try humming softly.', 'Raise a hand slowly. It may follow.', 'Open your hand, then close it.', 'Smile and see what happens.', 'Sway a little.']
    : ['Try humming softly.', 'Smile and see what happens.', 'Raise your eyebrows.', 'Speak to it gently.']
  let prompt = tips[tipI % tips.length]
  if (stage === 'live') {
    if (!ui.face) prompt = 'Look toward the camera. It’s looking for you.'
    else if (ui.fam < 0.12) prompt = 'Stay a while. It’s a little shy.'
    else if (mobile && movement && !ui.hand && !ui.body) prompt = 'Place your phone somewhere stable and step back.'
  }
  if (ui.smile > 0.5) prompt = 'It glows warmer when you smile.'
  else if (ui.sad > 0.5) prompt = 'It slows down to stay close.'
  else if (ui.sur > 0.5) prompt = 'It opens up, surprised too.'
  if (stage === 'demo' && !demo.hand && tipI % 3 === 0) prompt = 'Turn on Hand, then move your pointer over the creature.'

  const mood = ui.fam < 0.15 ? 'Cautious' : ui.fam < 0.4 ? 'Curious' : ui.fam < 0.7 ? 'Warming up' : 'Familiar'
  const accent = theme.ui
  const inSession = stage === 'live' || stage === 'demo'

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white" style={{ ['--accent' as string]: accent }}>
      {/* main creature canvas persists across stages */}
      <div className="absolute inset-0" onPointerMove={onPointer} onPointerDown={onPointer}>
        <CreatureCanvas shape={shape} theme={theme.p} count={mobile ? 2100 : 3600} interactive signals={signals.current}
          onReady={(c) => { creature.current = c }} className="block h-full w-full" />
      </div>
      <video ref={video} playsInline muted
        className={`pointer-events-none absolute z-10 -scale-x-100 rounded-xl object-cover transition-opacity duration-500 right-4 top-16 h-24 w-[72px] md:right-6 md:top-6 md:h-[120px] md:w-40 ${stage === 'live' && camVisible ? 'opacity-80' : 'opacity-0'}`} />
      {flash && <div className="pointer-events-none absolute inset-0 z-50 bg-white/10" />}

      {stage === 'welcome' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between px-6 py-14 md:py-16">
          <h1 className="fade-in whitespace-nowrap font-outfit text-[40px] font-thin leading-none tracking-[0.06em] text-white sm:text-6xl md:text-[80px]">RESONANCE</h1>
          <div className="fade-in pointer-events-auto flex flex-col items-center gap-6 text-center">
            <p className="text-base font-light text-white/70 md:text-lg">Meet a little life that responds to you.</p>
            <button onClick={() => setStage('prep')} className="rounded-full px-8 py-3 text-sm tracking-wide transition-all duration-500 hover:brightness-125"
              style={{ background: deep(accent), boxShadow: `0 0 0 1px ${accent}55` }}>
              Meet your creature
            </button>
          </div>
        </div>
      )}

      {stage === 'prep' && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/75 backdrop-blur-sm">
          <div className="fade-in mx-auto flex min-h-full max-w-[460px] flex-col justify-center gap-8 px-6 pb-10 pt-20">
            <div>
              <p className="mb-1 text-xs uppercase tracking-[0.2em]" style={{ color: accent }}>Before you meet</p>
              <h2 className="font-serif text-4xl">Choose its form</h2>
            </div>
            <ShapePicker value={shape} onChange={setShape} theme={theme.p} />
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/40">Colour</p>
              <ThemePicker value={themeI} onChange={setThemeI} />
            </div>
            <p className="text-sm font-light leading-relaxed text-white/60">Enable your camera and microphone to connect through expressions, sound, and movement.</p>
            <div className="flex items-center gap-4">
              <button onClick={start} className="rounded-full px-8 py-3 text-sm transition-all duration-500 hover:brightness-125" style={{ background: deep(accent), boxShadow: `0 0 0 1px ${accent}55` }}>Start</button>
              <button onClick={startDemo} className="text-sm text-white/50 underline-offset-4 hover:text-white hover:underline">Try demo</button>
            </div>
          </div>
        </div>
      )}

      {stage === 'loading' && (
        <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 text-center">
          <div className="h-px w-24 overflow-hidden bg-white/10"><div className="h-full w-1/3 animate-[slide_1.4s_ease-in-out_infinite]" style={{ background: accent }} /></div>
          <p className="text-sm text-white/60">{loadMsg}</p>
          <style>{'@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
        </div>
      )}

      {(stage === 'denied' || stage === 'error') && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-6 md:bottom-12">
          <div className="fade-in w-full max-w-[400px] rounded-2xl border border-white/10 bg-black/80 p-6 backdrop-blur-xl">
            <p className="mb-1 font-serif text-2xl">{stage === 'denied' ? 'It can’t see or hear you' : 'Tracking is unavailable'}</p>
            <p className="mb-6 text-sm font-light text-white/60">{errMsg}</p>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={start} className="rounded-full px-6 py-2.5 text-sm" style={{ background: deep(accent) }}>Retry</button>
              <button onClick={startDemo} className="rounded-full border border-white/15 px-6 py-2.5 text-sm text-white/80 hover:border-white/40">Try demo</button>
              <button onClick={exit} className="ml-auto text-sm text-white/40 hover:text-white">Exit</button>
            </div>
          </div>
        </div>
      )}

      {inSession && (
        <>
          <div className="pointer-events-none absolute left-4 top-[68px] z-20 flex flex-col gap-2 md:left-7 md:top-[84px]">
            <div className="flex items-center gap-3 text-[11px] text-white/50">
              {stage === 'demo' ? (
                <span className="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.15em]" style={{ borderColor: `${accent}88`, color: accent }}>Demo · simulated signals</span>
              ) : (
                <>
                  <Status on label="Camera" accent={accent} />
                  <Status on={!muted} label={muted ? 'Mic off' : 'Mic'} accent={accent} level={muted ? 0 : ui.level} />
                </>
              )}
            </div>
            {stage === 'live' && (
              <div className="flex gap-3 text-[10px] tracking-wide text-white/30">
                <span className={ui.face ? 'text-white/70' : ''}>Face</span>
                {movement && <span className={ui.hand ? 'text-white/70' : ''}>Hand</span>}
                {movement && <span className={ui.body ? 'text-white/70' : ''}>Body</span>}
              </div>
            )}
            <span className="text-[10px] italic text-white/30 transition-all duration-1000">{mood}</span>
          </div>

          {stage === 'live' && (
            <button onClick={() => setCamVisible((v) => !v)} aria-label={camVisible ? 'Hide camera preview' : 'Show camera preview'}
              className={`absolute z-20 rounded-full bg-black/60 p-1.5 text-white/60 hover:text-white ${camVisible ? 'right-5 top-[166px] md:right-7 md:top-[150px]' : 'right-4 top-16 md:right-6 md:top-6'}`}>
              <Icon d={camVisible ? I.eyeOff : I.eye} />
            </button>
          )}

          <p key={prompt} className="fade-in pointer-events-none absolute inset-x-0 bottom-[108px] z-20 px-8 text-center text-sm font-light text-white/60 md:bottom-28">{prompt}</p>

          {stage === 'demo' && (
            <div className="absolute right-4 top-14 z-20 w-[230px] md:right-6 md:top-6 md:w-[260px]">
              {demoOpen ? (
                <div className="fade-in rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Simulate</span>
                    <button onClick={() => setDemoOpen(false)} className="text-white/40 hover:text-white" aria-label="Collapse"><Icon d={I.close} /></button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Slider label="Smile" value={demo.smile} onChange={(v) => setDemo({ ...demo, smile: v, sad: v > 0 ? 0 : demo.sad })} />
                    <Slider label="Sad look" value={demo.sad} onChange={(v) => setDemo({ ...demo, sad: v, smile: v > 0 ? 0 : demo.smile })} />
                    <Slider label="Surprise" value={demo.surprise} onChange={(v) => setDemo({ ...demo, surprise: v })} />
                    <Slider label="Sound" value={demo.level} onChange={(v) => setDemo({ ...demo, level: v })} />
                    <Slider label="Body" value={demo.motion} onChange={(v) => setDemo({ ...demo, motion: v })} />
                    <Slider label="Hand open" value={demo.open} onChange={(v) => setDemo({ ...demo, open: v })} />
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => setDemo({ ...demo, hand: !demo.hand })} className="flex-1 rounded-full border px-3 py-1.5 text-xs transition-colors" style={{ borderColor: demo.hand ? accent : 'rgba(255,255,255,0.15)', color: demo.hand ? accent : undefined }}>Hand {demo.hand ? 'on' : 'off'}</button>
                      <button onClick={() => { signals.current.spike++ }} className="flex-1 rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-white/40">Loud clap</button>
                    </div>
                    <button onClick={() => setDemo({ smile: 0, sad: 0, surprise: 0, level: 0, hand: false, open: 0.5, motion: 0 })} className="text-left text-[11px] text-white/40 hover:text-white">Reset to neutral</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setDemoOpen(true)} className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/70"><Icon d={I.sliders} />Simulate</button>
              )}
            </div>
          )}

          <nav className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:bottom-6 md:pb-0">
            <div className="flex w-full max-w-[460px] items-center justify-between rounded-full border border-white/10 bg-black/60 px-2 backdrop-blur-xl md:w-auto md:gap-1">
              <CtrlBtn label="Capture" icon={I.camera} onClick={screenshot} accent={accent} />
              <CtrlBtn label="Shape" icon={I.shape} onClick={() => setPanel(panel === 'shape' ? null : 'shape')} active={panel === 'shape'} accent={accent} />
              <CtrlBtn label="Theme" icon={I.theme} onClick={() => setPanel(panel === 'theme' ? null : 'theme')} active={panel === 'theme'} accent={accent} />
              <CtrlBtn label={muted ? 'Unmute' : 'Mic'} icon={muted ? I.micOff : I.mic} onClick={() => setMuted((m) => !m)} active={muted} accent={accent} />
              <CtrlBtn label="Help" icon={I.help} onClick={() => setPanel(panel === 'help' ? null : 'help')} active={panel === 'help'} accent={accent} />
              <CtrlBtn label="Exit" icon={I.exit} onClick={exit} accent={accent} />
            </div>
          </nav>

          {panel === 'shape' && <Sheet title="Shape" onClose={() => setPanel(null)}><ShapePicker value={shape} onChange={setShape} theme={theme.p} small /></Sheet>}
          {panel === 'theme' && <Sheet title="Theme" onClose={() => setPanel(null)}><ThemePicker value={themeI} onChange={setThemeI} /></Sheet>}
          {panel === 'help' && (
            <Sheet title="How to connect" onClose={() => setPanel(null)}>
              <ul className="space-y-2.5 text-sm font-light text-white/70">
                <li><span className="text-white">Smile</span> — it warms and comes closer.</li>
                <li><span className="text-white">Look down</span> — it slows and stays near.</li>
                <li><span className="text-white">Look surprised</span> — it opens outward.</li>
                <li><span className="text-white">Hum or speak</span> — it ripples. A sudden loud sound scatters it.</li>
                <li><span className="text-white">Move a hand slowly</span> — it follows. Open to expand, close to gather.</li>
                <li><span className="text-white">Sway</span> — it sways with you.</li>
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-white/40">It reads visible facial movement, not how you truly feel. Be gentle and patient — it grows familiar over time. Nothing is recorded or uploaded.</p>
              {stage === 'live' && !movement && (
                <div className="mt-4 rounded-xl border border-white/10 p-3">
                  <p className="mb-2 text-xs text-white/60">Place your phone somewhere stable and step back.</p>
                  <button onClick={enableMovement} disabled={movementLoading} className="rounded-full px-4 py-1.5 text-xs" style={{ background: deep(accent) }}>{movementLoading ? 'Loading…' : 'Enable hands and body'}</button>
                </div>
              )}
            </Sheet>
          )}
        </>
      )}
      {stage !== 'welcome' && (
        <button onClick={exit} aria-label="Home"
          className="absolute left-3 top-3 z-[60] flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 text-sm text-white/80 backdrop-blur-md transition-colors duration-300 hover:border-white/40 hover:text-white md:left-6 md:top-6">
          <Icon d="M19 12H5 M11 6l-6 6 6 6" />
          Home
        </button>
      )}
    </div>
  )
}

function Status({ on, label, accent, level = 0 }: { on: boolean; label: string; accent: string; level?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full transition-all duration-300" style={{ background: on ? accent : 'rgba(255,255,255,0.25)', boxShadow: on ? `0 0 ${4 + level * 14}px ${accent}` : undefined }} />
      {label}
    </span>
  )
}
