import { useState, type FormEvent } from 'react'
import { DASHBOARD, DEMO_PATIENTS } from '../../i18n/dashboard'
import { api } from '../../lib/api'
import { DEPARTMENT_LABELS, DEPARTMENTS, type Language, type Room } from '../../types/ticket'
import { CalendarIcon, CloseIcon, UsersIcon } from '../icons'
import { LanguageSelect } from './LanguageSelect'

type Gender = 'female' | 'male' | 'unspecified'

/** Demo navigation: every staff and admin screen, one tap from the bedside home page. */
const SCREENS = [
  ...DEPARTMENTS.map((d) => ({ href: `/${d}`, label: DEPARTMENT_LABELS[d] })),
  { href: '/admin', label: 'Admin & insights' },
]

/** Wide screens show the demo sidebar from the start; smaller ones open it on demand. */
function wideScreen(): boolean {
  try {
    return window.matchMedia('(min-width: 1024px)').matches
  } catch {
    return true // no matchMedia (tests): show it
  }
}

/**
 * Bedside intake (hackathon: the patient fills it in). Name, age, gender and clinical notes; the
 * notes decide the dashboard, the safety profile and the top buttons on the server. Demo patients
 * for testing live in a full-height right sidebar.
 */
export function IntakeForm({
  roomId,
  lang,
  onLangChange,
  onDone,
}: {
  roomId: string
  lang: Language
  onLangChange: (l: Language) => void
  onDone: (room: Room) => void
}) {
  const d = DASHBOARD[lang]
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<Gender>('unspecified')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demosOpen, setDemosOpen] = useState(wideScreen)
  // The demo patient filled in, while the name still matches it.
  const demo = DEMO_PATIENTS.find((p) => p.name === name)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { room } = await api.saveIntake(roomId, {
        name: name.trim(),
        age: Number(age),
        gender,
        // Not asked on the form; demo patients bring one so US-6 can still be shown.
        attendant_preference: demo?.attendant_preference ?? 'any',
        clinical_notes: notes.trim(),
        preferred_language: lang,
        // Demo patients come with procedures, timed from now so reminders happen during the demo.
        procedures: (demo?.procedures ?? []).map((p) => ({
          name: p.name,
          at: new Date(Date.now() + p.inMinutes * 60_000).toISOString(),
        })),
      })
      onDone(room)
    } catch {
      setError(d.intakeFailed)
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-2 w-full rounded-2xl border-2 border-pine bg-paper p-4 text-[24px]'
  return (
    <div className="flex min-h-screen text-[22px]">
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[40px] font-bold leading-tight">{d.welcome}</h1>
          <div className="flex items-center gap-3">
            <LanguageSelect lang={lang} onChange={onLangChange} />
            {!demosOpen && (
              <button
                type="button"
                aria-expanded={false}
                aria-controls="demo-sidebar"
                onClick={() => setDemosOpen(true)}
                className="flex h-16 items-center gap-2 rounded-2xl border-2 border-pine bg-paper px-4 text-[20px] font-bold text-pine hover:bg-curtain"
              >
                <UsersIcon />
                Demo patients
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[18px] text-pine-soft">
          <span aria-hidden="true" className="font-bold text-bell">* </span>
          {d.required}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
            <label className="block font-bold">
              {d.name}
              <Required label={d.required} />
              <input
                required
                maxLength={40}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
              />
            </label>
            <label className="block font-bold">
              {d.age}
              <Required label={d.required} />
              <input
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <fieldset>
            <legend className="font-bold">{d.gender}</legend>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {(['female', 'male', 'unspecified'] as const).map((g) => (
                <label
                  key={g}
                  className={`flex min-h-16 items-center justify-center rounded-2xl border-2 px-3 text-center text-[20px] font-bold ${
                    gender === g ? 'border-pine bg-pine text-white' : 'border-pine bg-paper text-pine'
                  }`}
                >
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={gender === g}
                    onChange={() => setGender(g)}
                    className="sr-only"
                  />
                  {g === 'female' ? d.female : g === 'male' ? d.male : d.preferNot}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block font-bold">
            {d.notes}
            <textarea
              rows={4}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${field} font-normal`}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-2xl bg-bell-tint p-4 font-bold text-bell-deep">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="min-h-20 w-full rounded-2xl bg-care px-6 text-[26px] font-bold text-white hover:bg-care-deep disabled:bg-curtain-deep"
          >
            {busy ? d.settingUp : d.setUp}
          </button>
        </form>
      </main>

      {demosOpen && (
        <aside
          id="demo-sidebar"
          aria-labelledby="demo-patients"
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l-2 border-line bg-paper p-6 text-[18px] shadow-2xl lg:sticky lg:top-0 lg:h-screen lg:shadow-none"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="demo-patients" className="flex items-center gap-2 text-[22px] font-bold">
              <UsersIcon />
              Demo patients
            </h2>
            <button
              type="button"
              aria-label="Close demo patients"
              aria-expanded={true}
              aria-controls="demo-sidebar"
              onClick={() => setDemosOpen(false)}
              className="grid size-12 place-items-center rounded-xl border-2 border-line text-pine hover:border-pine"
            >
              <CloseIcon />
            </button>
          </div>
          <p className="text-pine-soft">For testing: tap one to fill in the form.</p>
          {DEMO_PATIENTS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setName(p.name)
                setAge(String(p.age))
                setGender(p.gender)
                setNotes(p.clinical_notes)
                if (!wideScreen()) setDemosOpen(false)
              }}
              className={`rounded-2xl border-2 p-4 text-left hover:border-pine ${name === p.name ? 'border-pine bg-care-tint' : 'border-line bg-paper'}`}
            >
              <span className="block font-bold">{p.label}</span>
              <span className="mt-1 line-clamp-3 block text-[16px] text-pine-soft">{p.clinical_notes}</span>
              <span className="mt-2 flex items-start gap-2 text-[16px] font-bold text-care-deep">
                <CalendarIcon className="size-5 shrink-0" />
                {p.procedures.map((x) => `${x.name} in ${fromNow(x.inMinutes)}`).join(' · ')}
              </span>
            </button>
          ))}

          <h2 className="mt-4 text-[22px] font-bold">Open a screen</h2>
          <p className="-mt-2 text-pine-soft">Opens in a new tab, so this bedside screen stays open.</p>
          <nav aria-label="Staff and admin screens" className="flex flex-col gap-2">
            {SCREENS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-2xl border-2 border-line bg-paper px-4 py-3 font-bold hover:border-pine"
              >
                {s.label}
                <span aria-hidden="true" className="text-pine-soft">
                  ↗
                </span>
              </a>
            ))}
          </nav>
        </aside>
      )}
    </div>
  )
}

/** "10 min", "3 h", "20 h" for the demo cards. */
function fromNow(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
}

/** Asterisk for sighted users, "(required)" for screen readers. */
function Required({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-bell">
        {' *'}
      </span>
      <span className="sr-only"> ({label})</span>
    </>
  )
}
