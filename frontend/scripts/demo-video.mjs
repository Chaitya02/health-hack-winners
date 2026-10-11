// Records a captioned demo of every Ting-ting case with sample inputs (Playwright video).
//   docker compose up -d && docker compose restart dynamodb backend
//   uv run --project backend python scripts/seed.py
//   uv run --project backend python scripts/demo_history.py   # a week of past requests for admin
//   curl -X DELETE localhost:8000/api/rooms/400/intake      # start on the Welcome form
//   node frontend/scripts/demo-video.mjs <out-dir>
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = process.env.DEMO_URL ?? 'http://localhost:5173'
const OUT = process.argv[2] ?? 'demo-video'
const REPO = fileURLToPath(new URL('../../', import.meta.url))
const W = 1280
const H = 800

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
})
await context.clock.install() // real time, but lets the screensaver scene skip 3 idle minutes
const page = await context.newPage()
const pause = (s) => page.waitForTimeout(s * 1000)

/** A caption bar at the bottom of the frame; a small chapter label sits above it. */
async function caption(text, chapter) {
  await page.evaluate(
    ([t, c]) => {
      const make = (id, style) => {
        let el = document.getElementById(id)
        if (!el) {
          el = document.createElement('div')
          el.id = id
          Object.assign(el.style, { position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, pointerEvents: 'none', textAlign: 'center' }, style)
          document.body.appendChild(el)
        }
        return el
      }
      const cap = make('demo-caption', {
        bottom: '18px', background: 'rgba(10,30,27,.93)', color: '#fff', font: '600 21px system-ui, sans-serif',
        padding: '12px 22px', borderRadius: '14px', maxWidth: '92%', boxShadow: '0 10px 30px rgba(0,0,0,.3)',
      })
      cap.textContent = t
      if (c) {
        const chip = make('demo-chapter', {
          top: '14px', left: 'auto', right: '14px', transform: 'none', background: '#0f6e66', color: '#fff', font: '700 13px system-ui, sans-serif',
          letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: '999px',
        })
        chip.textContent = c
        window.__demoChapter = c
      }
    },
    [text, chapter ?? null],
  )
}

let chapter = ''
async function go(path, text, ch) {
  await page.goto(BASE + path)
  await page.waitForLoadState('networkidle')
  if (ch) chapter = ch
  await caption(text, chapter)
}
const say = (text, ch) => {
  if (ch) chapter = ch
  return caption(text, chapter)
}

/** Types into the request box (any language) and sends; returns the created tickets, if any. */
async function typeRequest(text) {
  const box = page.locator('#request-text')
  await box.click()
  await box.fill('')
  await box.pressSequentially(text, { delay: 50 })
  await pause(0.5)
  const res = page.waitForResponse((r) => r.url().endsWith('/api/requests') && r.request().method() === 'POST')
  await page.locator('form button[type=submit]').click()
  const body = await (await res).json()
  return body.tickets ?? []
}
const another = () => page.getByTestId('confirmation').getByRole('button').click()
const card = () => page.getByTestId('ticket')

async function setUp(name, text) {
  await page.locator('#demo-sidebar').getByRole('button', { name: new RegExp(name) }).click()
  await say(text)
  await pause(3)
  await page.getByRole('button', { name: 'Set up my screen' }).click()
  await page.getByTestId('patient-identity').waitFor()
}
async function startOver() {
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('heading', { name: 'Welcome' }).waitFor()
}

// ── 1. Rosa: notes → audio dashboard, procedures, Emergency, fall risk ──────────────────────
await go('/', 'The bedside tablet starts with a short form: name, age, gender, clinical notes', '1 · Bedside setup')
await pause(3)
await setUp('Rosa', 'Rosa, 82: macular degeneration, bathroom often at night, unsteady')
await say('Low vision → the audio dashboard: big buttons, voice bubble, everything read aloud', '2 · Rosa · audio dashboard')
await pause(4)
await say('Her procedures are announced (spoken + banner) and listed under “Coming up”')
await pause(4)
await page.getByRole('button', { name: /^emergency$/i }).click()
await say('Emergency needs two taps: the first only asks “tap again”')
await pause(3)
await page.getByRole('button', { name: /^emergency$/i }).click()
await page.getByTestId('confirmation').waitFor()
await say('Second tap: the nurse is called, URGENT')
await pause(3.5)
await another()
await page.getByTestId('top-tiles').getByRole('button', { name: 'Bathroom' }).click()
await page.getByTestId('confirmation').waitFor()
await say('Bathroom help for a fall-risk patient: “Marked higher priority”, female staff preferred')
await pause(4)
await another()

// ── 2. Sam: NPO → food and drink grayed out ─────────────────────────────────────────────────
await startOver()
await setUp('Sam', 'Sam, 54: post-op, nothing by mouth (NPO) before tomorrow’s surgery')
await say('Food and drink are never in his top buttons', '3 · Sam · nothing by mouth')
await pause(3)
await page.getByRole('button', { name: 'More requests' }).click()
await pause(1)
await page.getByRole('button', { name: 'Thirsty' }).click({ force: true })
await say('Tapping a grayed-out button explains why instead of sending')
await pause(4.5)

// ── 3. Lena: typed requests, languages, invalid input ───────────────────────────────────────
await startOver()
await setUp('Lena', 'Lena, 37: recovering from pneumonia, feels cold, sleeps badly')
await say('Standard dashboard: voice and typing. Voice is tap to record, tap again to send', '4 · Lena · typed requests')
await pause(3.5)

await say('A typo the keywords still understand: “I want to have salade”')
const [salad] = await typeRequest('I want to have salade')
await page.getByTestId('confirmation').waitFor()
await say('→ Food Services, not the nurse')
await pause(3)
await another()

await say('Not a request at all: “asdfgh”')
await typeRequest('asdfgh')
await page.getByRole('alert').waitFor()
await say('Nothing is sent. The patient is asked to try again (spoken for voice input)')
await pause(4)

await say('Two needs in one message')
await typeRequest('extra pillow please and the tv is not working')
await page.getByTestId('confirmation').waitFor()
await say('→ two tickets: Housekeeping and Unit Clerk / IT')
await pause(3.5)
await another()

await say('A symptom: safety rules run before and after the AI')
await typeRequest('my chest hurts')
await page.getByTestId('confirmation').waitFor()
await say('→ Primary Nurse, URGENT, with an alarm on the nurse’s screen')
await pause(3.5)
await another()

await page.getByRole('combobox').selectOption('es')
await say('The whole screen in the patient’s language (7 languages)', '5 · Languages')
await pause(2.5)
await say('In Spanish: “tengo sed y quiero un jugo”')
const [juice] = await typeRequest('tengo sed y quiero un jugo')
await page.getByTestId('confirmation').waitFor()
await say('→ Food Services, and the confirmation comes back in Spanish')
await pause(3.5)
await another()
await page.getByRole('combobox').selectOption('en')
await pause(1)

// ── 4. Patient tracker: still waiting, cancel ───────────────────────────────────────────────
await page.getByTestId('requests-bell').click()
const panel = page.getByTestId('requests-panel')
await panel.waitFor()
await say('The bell opens a live tracker: Sent → Seen → On the way → Done, with an ETA', '6 · Request tracker')
await pause(3.5)
const pillowRow = panel.getByTestId('patient-request').filter({ hasText: 'Comfort' })
await pillowRow.getByRole('button', { name: 'Still waiting?' }).click()
await say('“Still waiting?” nudges the team and raises the request in their queue')
await pause(3)
const tvRow = panel.getByTestId('patient-request').filter({ hasText: /TV|tech/i })
await tvRow.getByRole('button', { name: 'Cancel request' }).click()
await tvRow.getByRole('button', { name: 'Yes, cancel' }).click()
await say('Non-clinical requests can be cancelled. Clinical ones only by the nurse')
await pause(3)
await page.keyboard.press('Escape')

// ── 5. Staff dashboards ─────────────────────────────────────────────────────────────────────
await go('/nursing', 'Unacknowledged urgent requests flash a banner and sound an alarm', '7 · Primary Nurse')
await card().first().waitFor()
await pause(4)
await say('Each card: request icon, room and unit, patient, deadline, assignee, one next step')
await pause(4)
await say('Rosa’s bathroom request went to Nurse Priya: an available female nurse')
await pause(3.5)
for (let i = 0; i < 3; i++) {
  const ack = card().getByRole('button', { name: 'Acknowledge' }).first()
  if (await ack.count()) await ack.click()
  await pause(0.8)
}
await say('Acknowledged: the alarm stops and each patient’s screen updates live')
await pause(3)
await page.getByText('Today’s schedule').click()
await say('Today’s schedule: random 12-hour shifts with breaks. New requests go to whoever is available and least busy')
await pause(4.5)
await page.getByRole('button', { name: /^Nurse Priya \(/ }).click()
await say('Filter by person, or see what is waiting for someone available')
await pause(3)

await go('/housekeeping', 'The pillow card shows “Patient still waiting”', '8 · Housekeeping')
await card().first().waitFor()
await pause(3.5)
await card().first().getByRole('button', { name: 'Acknowledge' }).click()
await pause(1.5)
await card().first().getByRole('button', { name: 'On my way' }).click()
await say('“On my way”: the patient hears it, with when someone will be there')
await pause(3)
await card().first().getByRole('button', { name: 'Done' }).click()
await say('Done: it leaves the queue and the patient’s bell')
await pause(3)

await go('/food', 'Food Services: the salad and the Spanish juice request', '9 · Food Services')
await card().first().waitFor()
await pause(3)
const saladCard = page.locator(`[data-ticket-id="${salad.ticket_id}"]`)
await saladCard.getByRole('button', { name: 'Clinical? Send to nurse' }).click()
await say('Anything that looks clinical goes to the nurse with one tap')
await pause(3)
execFileSync('uv', ['run', '--project', 'backend', 'python', 'scripts/demo_backdate.py', juice.ticket_id], { cwd: REPO, stdio: 'ignore' })
await say('Nobody acknowledged the juice in time (5 min for normal priority)…')
await pause(2)
await page.reload()
await page.waitForLoadState('networkidle')
// Say what actually happened: a backup if anyone else is free, otherwise it stays put.
const hasBackup = await page.locator(`[data-ticket-id="${juice.ticket_id}"]`).getByTestId('backup').count()
await say(
  hasBackup
    ? '…so it goes to a backup person, priority rises to HIGH, and the patient is told'
    : '…nobody else on Food is free (break), so it stays assigned, priority rises to HIGH, and the patient is told',
  '10 · Missed deadline',
)
await pause(5)

await go('/it', 'Unit Clerk / IT: the TV request was cancelled by the patient', '11 · Unit Clerk / IT')
await pause(2)
await page.getByText(/Done today/).click()
await pause(3)

// ── 6. Back at the bedside ──────────────────────────────────────────────────────────────────
await go('/', 'Back at the bedside', '12 · Patient sees it all')
await page.getByTestId('requests-bell').click()
await page.getByTestId('requests-panel').waitFor()
await say('The juice shows “We’re still looking for someone to help you” (also spoken)')
await pause(5)
await page.keyboard.press('Escape')
await pause(1)
await say('After 3 minutes untouched, the screensaver comes on', '13 · Screensaver')
await page.clock.fastForward('03:05')
await page.getByTestId('screensaver').waitFor()
await caption('Screensaver: her nurse, how long each request has waited, and a working Emergency button', chapter)
await pause(5)

await go('/admin', 'Admin: today’s requests and how much of the nurse’s pager was saved', '14 · Admin')
await pause(4)
await page.getByRole('button', { name: '7 days', exact: true }).first().click()
await say('Last 7 days: requests by category, by hour, and time to acknowledge and resolve per team')
await pause(5)
await page.mouse.wheel(0, 520)
await say('Escalations, nudges, cancellations, busiest rooms, and every staff member’s workload')
await pause(5)
await page.mouse.wheel(0, 700)
await pause(4)
await say('Ting-ting: the right team, safely, in the patient’s language')
await pause(3)

await context.close() // writes the video
await browser.close()
console.log(`video saved in ${OUT}`)
