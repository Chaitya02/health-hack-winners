/** Read text aloud with the browser's speech synthesis; silently does nothing where unsupported. */
export function speak(text: string, lang: string): void {
  try {
    const synth = window.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
    synth.cancel() // newest message wins; never queue a backlog of old ones
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.95
    synth.speak(utterance)
  } catch {
    // Speech is a convenience; the screen still shows everything.
  }
}
