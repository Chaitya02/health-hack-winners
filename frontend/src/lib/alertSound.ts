// Two-tone alert for HIGH nursing tickets. The AudioContext is unlocked by the sign-in click
// (browsers block audio until the user interacts with the page).

let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!ctx && Ctor) ctx = new Ctor()
    void ctx?.resume()
  } catch {
    ctx = null
  }
}

export function playAlert() {
  if (!ctx) return
  const start = ctx.currentTime
  ;[880, 660, 880].forEach((freq, i) => {
    const osc = ctx!.createOscillator()
    const gain = ctx!.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start + i * 0.22)
    gain.gain.exponentialRampToValueAtTime(0.4, start + i * 0.22 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.22 + 0.2)
    osc.connect(gain).connect(ctx!.destination)
    osc.start(start + i * 0.22)
    osc.stop(start + i * 0.22 + 0.21)
  })
}
