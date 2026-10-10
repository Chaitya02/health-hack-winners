// Soft waiting music (US-7), synthesized with Web Audio so there is no audio file to ship or
// license. A slow, quiet pentatonic pattern on sine tones; loops until stopped.

const NOTES = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46] // C5 E5 G5 E5 D5 F5 A5 F5
const STEP_S = 0.9
const VOLUME = 0.05

let ctx: AudioContext | null = null
let master: GainNode | null = null
let timer: ReturnType<typeof setInterval> | null = null
let step = 0

function context(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!ctx && Ctor) ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

function note(c: AudioContext, out: GainNode, freq: number, at: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(1, at + 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + STEP_S * 1.6)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + STEP_S * 1.7)
}

export function isMusicPlaying(): boolean {
  return timer !== null
}

/** Starts the loop. Safe to call repeatedly; does nothing where Web Audio is unavailable. */
export function startMusic(): void {
  if (timer) return
  const c = context()
  if (!c) return
  try {
    void c.resume()
    master = c.createGain()
    master.gain.value = VOLUME
    master.connect(c.destination)
    const out = master
    step = 0
    const tick = () => {
      note(c, out, NOTES[step % NOTES.length], c.currentTime + 0.05)
      step += 1
    }
    tick()
    timer = setInterval(tick, STEP_S * 1000)
  } catch {
    stopMusic()
  }
}

export function stopMusic(): void {
  if (timer) clearInterval(timer)
  timer = null
  try {
    master?.disconnect()
  } catch {
    // already disconnected
  }
  master = null
}
