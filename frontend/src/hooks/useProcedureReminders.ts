import { useEffect, useMemo, useRef, useState } from 'react'
import { DASHBOARD } from '../i18n/dashboard'
import { HTML_LANG, STRINGS } from '../i18n/strings'
import { procedureStage, procedureTime, stagesUpTo, type ProcedureStage } from '../lib/procedures'
import { speak } from '../lib/speak'
import type { Language, Procedure } from '../types/ticket'
import { useNow } from './useNow'

export interface ProcedureItem extends Procedure {
  stage: Exclude<ProcedureStage, 'past'>
  minutes: number
  time: string
}

function load(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Tells the patient about their procedures: once when the screen is set up, again 15 minutes
 * before, and when it's time. Each announcement is spoken (when spoken updates are on) and shown.
 * What was already said is remembered per patient, so a reload doesn't repeat it.
 */
export function useProcedureReminders({
  roomId,
  intakeAt,
  procedures,
  lang,
  voice,
}: {
  roomId: string
  intakeAt: string | null
  procedures: Procedure[]
  lang: Language
  voice: boolean
}) {
  const now = useNow(15_000)
  const key = `tingting.procedures.${roomId}.${intakeAt ?? ''}`
  const told = useRef<Set<string> | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const voiceRef = useRef(voice)
  useEffect(() => {
    voiceRef.current = voice
  }, [voice])

  const items = useMemo(
    () =>
      procedures
        .map((p, i) => ({ ...p, i, ...procedureStage(p, now), time: procedureTime(p.at, HTML_LANG[lang], now) }))
        .filter((x): x is typeof x & { stage: ProcedureItem['stage'] } => x.stage !== 'past'),
    [procedures, now, lang],
  )

  // Checked on a timer (and right away), so a reminder fires on time even with no other updates.
  useEffect(() => {
    const check = () => {
      told.current ??= load(key)
      const said = told.current
      const d = DASHBOARD[lang]
      const at = Date.now()
      const messages: string[] = []
      procedures.forEach((p, i) => {
        const { stage, minutes } = procedureStage(p, at)
        if (stage === 'past' || said.has(`${i}:${stage}`)) return
        for (const s of stagesUpTo(stage)) said.add(`${i}:${s}`) // reaching "soon" covers "scheduled"
        const time = procedureTime(p.at, HTML_LANG[lang], at)
        messages.push(
          stage === 'now'
            ? d.procedureStarting(p.name)
            : stage === 'soon'
              ? d.procedureSoon(p.name, time, minutes)
              : d.procedureAt(p.name, time),
        )
      })
      if (messages.length === 0) return
      try {
        localStorage.setItem(key, JSON.stringify([...said]))
      } catch {
        // storage unavailable: reminders may repeat after a reload
      }
      const text = messages.join(' ')
      setNotice(text)
      if (voiceRef.current) speak(text, STRINGS[lang].speechLang)
    }
    const first = setTimeout(check, 0)
    const id = setInterval(check, 15_000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [procedures, key, lang])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 20_000)
    return () => clearTimeout(id)
  }, [notice])

  return { items: items as ProcedureItem[], notice, dismiss: () => setNotice(null) }
}
