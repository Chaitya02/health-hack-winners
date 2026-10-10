import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type Metrics } from '../lib/api'
import { computeImpact, DEFAULT_INPUTS, HOSPITAL_BEDS, type ImpactInputs } from '../lib/impact'
import { CATEGORIES, DEPARTMENT_LABELS, DEPARTMENTS, type Category } from '../types/ticket'

const CATEGORY_LABELS: Record<Category, string> = {
  URGENT_CLINICAL: 'Urgent clinical',
  NON_URGENT_CLINICAL: 'Routine clinical',
  UNCLEAR: 'Unclear → nurse',
  ENVIRONMENT_CLEANING: 'Room & cleaning',
  COMFORT_SUPPLIES: 'Comfort supplies',
  DIETARY: 'Food & drink',
  TECH_AMENITIES: 'TV & tech',
  EMOTIONAL_SUPPORT: 'Emotional support',
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function seconds(v: number | null | undefined) {
  if (v == null) return '–'
  return v < 90 ? `${Math.round(v)} s` : `${(v / 60).toFixed(1)} min`
}

const TOKEN_KEY = 'tingting.admin'

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // session storage unavailable: token lives in memory only
  }
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(readToken)
  useEffect(() => {
    document.documentElement.lang = 'en'
    document.title = 'Admin · Ting-ting'
  }, [])
  const signIn = useCallback((t: string | null) => {
    storeToken(t)
    setToken(t)
  }, [])
  const signOut = useCallback(() => signIn(null), [signIn])
  if (!token) return <AdminLogin onToken={signIn} />
  return <Impact token={token} onSignOut={signOut} />
}

function AdminLogin({ onToken }: { onToken: (t: string) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onToken((await api.loginAdmin(pin)).token)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That PIN is not correct.' : 'Cannot reach the server. Try again.')
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border-2 border-line bg-paper p-8">
        <h1 className="text-2xl font-bold">Unit Operations &amp; Impact</h1>
        <p className="mt-1 text-pine-soft">Admin sign-in</p>
        <label htmlFor="admin-pin" className="mt-6 block font-bold">
          Admin PIN
        </label>
        <input
          id="admin-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mt-2 min-h-14 w-full rounded-xl border-2 border-pine px-4 text-2xl tracking-widest"
        />
        {error && (
          <p role="alert" className="mt-3 font-bold text-bell">
            {error}
          </p>
        )}
        <button type="submit" className="mt-6 min-h-14 w-full rounded-xl bg-care font-bold text-white hover:bg-care-deep">
          Sign in
        </button>
        <p className="mt-4 text-sm text-pine-soft">Demo admin PIN: 1357</p>
      </form>
    </main>
  )
}

function Impact({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [m, setM] = useState<Metrics | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .metrics(token)
        .then((x) => alive && (setM(x), setErr(false)))
        .catch((e) => {
          if (!alive) return
          if (e instanceof ApiError && e.status === 401) onSignOut()
          else setErr(true)
        })
    void load()
    const id = setInterval(load, 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [token, onSignOut])

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line bg-paper px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold">Unit Operations &amp; Impact</h1>
          <p className="text-pine-soft">4 West Med-Surg · today · refreshes every 3 s</p>
        </div>
        <button type="button" onClick={onSignOut} className="min-h-12 rounded-xl border-2 border-line px-4 hover:border-pine">
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-6xl space-y-10 px-5 py-6">
        {err && <p role="alert" className="font-bold text-bell">Cannot reach the API. Showing the last data received.</p>}
        <section aria-labelledby="today">
          <h2 id="today" className="sr-only">Today</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Requests today" value={m ? nf.format(m.total) : '–'} />
            <Stat
              label="Kept off the nurse’s pager"
              value={m ? `${m.diverted_pct}%` : '–'}
              note={m ? `${m.diverted_from_nursing} routed straight to support teams` : undefined}
              emphasis
            />
            <Stat
              label="Urgent alerts"
              value={m ? nf.format(m.urgent_count) : '–'}
              note={m ? `avg time to acknowledge ${seconds(m.urgent_avg_ack_seconds)}` : undefined}
            />
            <Stat
              label="Fail-safe to nurse"
              value={m ? nf.format(m.fallback_count) : '–'}
              note="classifier unavailable or unsure"
            />
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="by-cat" className="rounded-3xl border-2 border-line bg-paper p-5">
            <h2 id="by-cat" className="text-xl font-bold">Requests by category</h2>
            <Bars
              rows={CATEGORIES.map((c) => ({ label: CATEGORY_LABELS[c], value: m?.by_category[c] ?? 0 }))}
              format={(v) => nf.format(v)}
            />
          </section>
          <section aria-labelledby="ack" className="rounded-3xl border-2 border-line bg-paper p-5">
            <h2 id="ack" className="text-xl font-bold">Average time to acknowledge</h2>
            <Bars
              rows={DEPARTMENTS.map((d) => ({ label: DEPARTMENT_LABELS[d], value: m?.avg_ack_seconds[d] ?? null }))}
              format={seconds}
            />
            <h3 className="mt-6 font-bold">Average time to resolve</h3>
            <Bars
              rows={DEPARTMENTS.map((d) => ({ label: DEPARTMENT_LABELS[d], value: m?.avg_resolve_seconds[d] ?? null }))}
              format={seconds}
            />
          </section>
        </div>

        <ImpactCalculator />
      </main>
    </div>
  )
}

function Stat({ label, value, note, emphasis }: { label: string; value: string; note?: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-3xl p-5 ${emphasis ? 'bg-care text-white' : 'border-2 border-line bg-paper'}`}>
      <p className={emphasis ? 'text-care-tint' : 'text-pine-soft'}>{label}</p>
      <p className="mt-1 text-4xl font-bold tabular-nums" data-testid={`stat-${label}`}>
        {value}
      </p>
      {note && <p className={`mt-1 text-sm ${emphasis ? 'text-care-tint' : 'text-pine-soft'}`}>{note}</p>}
    </div>
  )
}

function Bars({
  rows,
  format,
}: {
  rows: { label: string; value: number | null }[]
  format: (v: number) => string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0))
  return (
    <table className="mt-4 w-full border-separate border-spacing-y-1.5 text-left">
      <thead className="sr-only">
        <tr>
          <th>Label</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} title={`${r.label}: ${r.value == null ? 'no data yet' : format(r.value)}`}>
            <th scope="row" className="w-40 pr-3 align-middle text-sm font-normal text-pine-soft">
              {r.label}
            </th>
            <td className="align-middle">
              <div className="flex items-center gap-2">
                <div className="h-4 flex-1 rounded-r bg-curtain">
                  <div
                    className="h-4 rounded-r bg-care"
                    style={{ width: `${r.value ? Math.max(2, (100 * r.value) / max) : 0}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-bold tabular-nums">
                  {r.value == null ? '–' : format(r.value)}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const FIELDS: { key: keyof ImpactInputs; label: string; step: number; suffix?: string }[] = [
  { key: 'beds', label: 'Beds on the unit', step: 1 },
  { key: 'callsPerBedPerDay', label: 'Call bells per bed per day', step: 1 },
  { key: 'pctNonClinical', label: 'Non-clinical share', step: 5, suffix: '%' },
  { key: 'minutesPerInterruption', label: 'Nurse minutes per interruption', step: 0.5 },
  { key: 'nurseHourlyCost', label: 'Nurse cost per hour (loaded)', step: 5, suffix: '$' },
  { key: 'patientsPerNurse', label: 'Patients per nurse', step: 1 },
]

function ImpactCalculator() {
  const [inputs, setInputs] = useState<ImpactInputs>(DEFAULT_INPUTS)
  const unit = computeImpact(inputs)
  const hospital = computeImpact(inputs, HOSPITAL_BEDS)
  return (
    <section aria-labelledby="impact" className="rounded-3xl border-2 border-line bg-paper p-6">
      <h2 id="impact" className="text-2xl font-bold">Nursing time given back</h2>
      <p className="mt-1 max-w-[70ch] text-pine-soft">
        Estimates. Change the assumptions to match your unit. Every non-clinical call bell that goes straight to a
        support team is one less interruption for a nurse.
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm font-bold">
              {f.label}
              <input
                type="number"
                min={0}
                step={f.step}
                value={inputs[f.key]}
                onChange={(e) => setInputs({ ...inputs, [f.key]: Math.max(0, Number(e.target.value) || 0) })}
                className="min-h-12 rounded-xl border-2 border-line px-3 text-lg font-normal tabular-nums focus:border-care"
                data-testid={`impact-${f.key}`}
              />
            </label>
          ))}
        </form>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImpactCard
            title={`This unit (${nf.format(inputs.beds)} beds)`}
            hours={unit.hoursPerYear}
            dollars={unit.dollarsPerYear}
            fte={unit.fte}
            extra={`${unit.interruptionsAvoidedPerNurseShift.toFixed(1)} fewer interruptions per nurse per 12-h shift`}
            testid="impact-unit"
          />
          <ImpactCard
            title={`${HOSPITAL_BEDS}-bed hospital`}
            hours={hospital.hoursPerYear}
            dollars={hospital.dollarsPerYear}
            fte={hospital.fte}
            extra={`${nf.format(hospital.divertedPerDay)} call bells diverted per day`}
            testid="impact-hospital"
          />
        </div>
      </div>
    </section>
  )
}

function ImpactCard(p: { title: string; hours: number; dollars: number; fte: number; extra: string; testid: string }) {
  return (
    <div className="rounded-2xl bg-curtain p-5" data-testid={p.testid}>
      <p className="font-bold">{p.title}</p>
      <p className="mt-3 text-4xl font-bold tabular-nums text-care-deep" data-testid={`${p.testid}-hours`}>
        {nf.format(p.hours)} h
      </p>
      <p className="text-pine-soft">nursing hours per year</p>
      <p className="mt-3 text-2xl font-bold tabular-nums" data-testid={`${p.testid}-dollars`}>
        {usd.format(p.dollars)}
      </p>
      <p className="text-pine-soft">per year · about {p.fte.toFixed(1)} full-time nurses</p>
      <p className="mt-3 text-sm">{p.extra}</p>
    </div>
  )
}
