// US-7 waiting music: a soft, slowly changing chord pad generated with Web Audio (no audio file),
// played while the patient has an open request. Browsers only allow audio after a user gesture,
// so the page calls prime() on taps; start()/stop() can then be called at any time. Speech
// (speak.ts) ducks it so announcements stay clear.

const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 392.0], // G
  [220.0, 261.63, 329.63, 392.0], // Am7
]
const VOLUME = 0.05
const DUCKED = 0.012

let ctx: AudioContext | null = null
let master: GainNode | null = null
let voices: OscillatorNode[] = []
let timer: ReturnType<typeof setInterval> | null = null
let playing = false
let muted = false // while the patient is recording: silent, so the mic doesn't hear it

/** Create/resume the audio context. Call from a tap or key handler. */
export function prime(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!ctx && Ctor) ctx = new Ctor()
    void ctx?.resume()
  } catch {
    ctx = null
  }
}

export function isPlaying(): boolean {
  return playing
}

export function start(): void {
  if (playing || !ctx) return
  playing = true
  master = ctx.createGain()
  master.gain.setValueAtTime(0, ctx.currentTime)
  master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, ctx.currentTime + 2) // fade in
  master.connect(ctx.destination)
  voices = CHORDS[0].map((f) => {
    const osc = ctx!.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f
    osc.connect(master!)
    osc.start()
    return osc
  })
  let i = 0
  timer = setInterval(() => {
    if (!ctx) return
    i = (i + 1) % CHORDS.length
    voices.forEach((osc, v) => osc.frequency.setTargetAtTime(CHORDS[i][v], ctx!.currentTime, 0.8))
  }, 5000)
}

export function stop(): void {
  if (!playing) return
  playing = false
  if (timer) clearInterval(timer)
  timer = null
  const c = ctx
  const g = master
  const vs = voices
  voices = []
  master = null
  if (!c || !g) return
  g.gain.cancelScheduledValues(c.currentTime)
  g.gain.setTargetAtTime(0, c.currentTime, 0.4) // fade out
  setTimeout(() => {
    vs.forEach((o) => o.stop())
    g.disconnect()
  }, 2000)
}

/** Lower the music while something is being read aloud. */
export function duck(on: boolean): void {
  if (!ctx || !master || muted) return
  master.gain.setTargetAtTime(on ? DUCKED : VOLUME, ctx.currentTime, 0.15)
}

/** Silence the music while the microphone is recording; it comes back when recording stops. */
export function mute(on: boolean): void {
  muted = on
  if (!ctx || !master) return
  master.gain.setTargetAtTime(on ? 0 : VOLUME, ctx.currentTime, 0.1)
}
