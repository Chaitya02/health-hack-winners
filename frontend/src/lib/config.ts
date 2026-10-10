// Runtime config. Locally it comes from Vite env; in AWS from /config.json written at deploy time.

export interface AppConfig {
  apiUrl: string
  wsUrl: string
}

let cached: AppConfig | null = null

function defaults(): AppConfig {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
  const wsUrl = import.meta.env.VITE_WS_URL ?? apiUrl.replace(/^http/, 'ws') + '/ws'
  return { apiUrl, wsUrl }
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const json = (await res.json()) as Partial<AppConfig>
      if (json.apiUrl) {
        cached = { ...defaults(), ...json } as AppConfig
        return cached
      }
    }
  } catch {
    // fall through to build-time defaults
  }
  cached = defaults()
  return cached
}

export function getConfig(): AppConfig {
  return cached ?? defaults()
}

export function setConfigForTests(cfg: AppConfig | null) {
  cached = cfg
}

/** Room shown on the home page. Each bedside tablet is built or configured for its own room. */
export const DEFAULT_ROOM: string = import.meta.env.VITE_DEFAULT_ROOM ?? '400'

/** Patient screen goes to the screensaver after this much inactivity (US-8: 3 minutes). */
export const IDLE_MS: number = Number(import.meta.env.VITE_IDLE_SECONDS ?? 180) * 1000

/**
 * Demo convenience: department and admin pages sign themselves in with the demo PINs, so their
 * links open straight onto the dashboard. Login and role checks still happen on the server.
 * Anyone who can open the page gets in, so turn it off outside local/hackathon demos:
 * VITE_AUTO_SIGN_IN=false brings back the PIN screen. Off in unit tests unless stubbed on.
 */
export function autoSignIn(): boolean {
  const flag = import.meta.env.VITE_AUTO_SIGN_IN
  return flag ? flag !== 'false' : import.meta.env.MODE !== 'test'
}

export function demoPins(): { staff: string; admin: string } {
  return {
    staff: import.meta.env.VITE_STAFF_PIN ?? '2468',
    admin: import.meta.env.VITE_ADMIN_PIN ?? '1357',
  }
}
