import { useCallback, useState } from 'react'

export interface AudioPrefs {
  voice: boolean
  music: boolean
}

const key = (roomId: string) => `tingting.audio.${roomId}`

// Fallback when storage is unavailable (private mode, blocked site data): remember for the session.
const memory = new Map<string, Partial<AudioPrefs>>()

export function loadAudioPrefs(roomId: string): Partial<AudioPrefs> {
  if (memory.has(roomId)) return memory.get(roomId)!
  try {
    const raw = localStorage.getItem(key(roomId))
    const p = (raw ? JSON.parse(raw) : null) as Record<string, unknown> | null
    return {
      ...(typeof p?.voice === 'boolean' ? { voice: p.voice } : {}),
      ...(typeof p?.music === 'boolean' ? { music: p.music } : {}),
    }
  } catch {
    return {}
  }
}

function saveAudioPrefs(roomId: string, prefs: Partial<AudioPrefs>) {
  try {
    localStorage.setItem(key(roomId), JSON.stringify(prefs))
    memory.delete(roomId)
  } catch {
    memory.set(roomId, prefs) // session copy only
  }
}

/**
 * Voice and music switches (US-7), remembered per room on this tablet. Until the patient picks,
 * voice follows the profile (on for low vision) and music is off.
 */
export function useAudioPrefs(roomId: string, defaultVoice: boolean) {
  const [, rerender] = useState(0)
  const prefs = loadAudioPrefs(roomId)

  const set = useCallback(
    (name: keyof AudioPrefs, value: boolean) => {
      saveAudioPrefs(roomId, { ...loadAudioPrefs(roomId), [name]: value })
      rerender((n) => n + 1)
    },
    [roomId],
  )

  return { voice: prefs.voice ?? defaultVoice, music: prefs.music ?? false, set }
}
