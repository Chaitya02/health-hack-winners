import { useCallback, useState } from 'react'

export interface AudioPrefs {
  /** Read request status changes aloud (US-7). */
  voice: boolean
  /** Waiting music while a request is open (US-7). */
  music: boolean
}

const DEFAULTS: AudioPrefs = { voice: true, music: true }
const key = (roomId: string) => `tingting.audio.${roomId}`

function read(roomId: string): AudioPrefs {
  try {
    const raw = localStorage.getItem(key(roomId))
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioPrefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

/** Per-room on/off for spoken updates and waiting music, remembered on this device. */
export function useAudioPrefs(roomId: string) {
  const [prefs, setPrefs] = useState<AudioPrefs>(() => read(roomId))
  const toggle = useCallback(
    (name: keyof AudioPrefs) =>
      setPrefs((p) => {
        const next = { ...p, [name]: !p[name] }
        try {
          localStorage.setItem(key(roomId), JSON.stringify(next))
        } catch {
          // storage unavailable: the choice lasts for this visit only
        }
        return next
      }),
    [roomId],
  )
  return { prefs, toggle }
}
