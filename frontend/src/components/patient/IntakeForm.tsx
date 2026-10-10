import { useState, type FormEvent } from 'react'
import { DASHBOARD, DEMO_PATIENTS } from '../../i18n/dashboard'
import { HTML_LANG, STRINGS } from '../../i18n/strings'
import { api } from '../../lib/api'
import { LANGUAGES, type Language, type Room } from '../../types/ticket'

/**
 * Bedside intake (hackathon: the patient fills it in). Name, age and clinical notes; the notes
 * decide the dashboard, the safety profile and the top buttons on the server.
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
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { room } = await api.saveIntake(roomId, {
        name: name.trim(),
        age: Number(age),
        clinical_notes: notes.trim(),
        preferred_language: lang,
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
    <main className="mx-auto max-w-3xl px-5 py-8 text-[22px] sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[40px] font-bold leading-tight">{d.welcome}</h1>
        <label className="flex items-center gap-3 text-[20px]">
          <span>{STRINGS[lang].language}</span>
          <select
            value={lang}
            onChange={(e) => onLangChange(e.target.value as Language)}
            className="min-h-16 rounded-xl border-2 border-pine bg-paper px-4 text-[22px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l} lang={HTML_LANG[l]}>
                {STRINGS[l].languageName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-pine-soft">{d.intakeIntro}</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
          <label className="block font-bold">
            {d.name}
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
        <label className="block font-bold">
          {d.notes}
          <textarea
            rows={4}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={d.notesHint}
            className={`${field} font-normal placeholder:text-pine-soft`}
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

      <section aria-labelledby="demo-patients" className="mt-10 rounded-2xl border-2 border-dashed border-line p-4 text-[18px]">
        <h2 id="demo-patients" className="font-bold text-pine-soft">
          Demo patients (testing)
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_PATIENTS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setName(p.name)
                setAge(String(p.age))
                setNotes(p.clinical_notes)
              }}
              className="min-h-12 rounded-xl border-2 border-line bg-paper px-4 hover:border-pine"
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
