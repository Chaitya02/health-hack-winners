import { expect, type Browser, type Page } from '@playwright/test'

export const PIN = process.env.STAFF_PIN ?? '2468'
export const MAX_LATENCY_MS = Number(process.env.MAX_LATENCY_MS ?? 1000)
export const SHOTS = process.env.SCREENSHOTS ? '../docs/screenshots' : null

export async function staffPage(browser: Browser, dept: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage()
  await page.goto(`/${dept}`)
  await page.getByLabel('Department PIN').fill(PIN)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'live')
  return page
}

export async function patientPage(browser: Browser, room: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 768, height: 1024 } })).newPage()
  await openPatient(page, room)
  return page
}

/** Opens a room's patient screen on an existing page and switches it to English. */
export async function openPatient(page: Page, room: string) {
  const roomLoaded = page.waitForResponse((r) => r.url().endsWith(`/api/rooms/${room}`) && r.ok())
  await page.goto(`/patient/${room}`)
  // The heading renders before the room arrives, and the room then switches the UI to the
  // patient's preferred language. Wait for that switch, or it can undo selectOption('en') below
  // (seen on a cold backend: room 405 flipped to Chinese and "Ice" was never found).
  const { preferred_language } = (await (await roomLoaded).json()) as { preferred_language: string }
  await expect(page.getByRole('combobox')).toHaveValue(preferred_language)
  // Rooms have synthetic preferred languages; tests drive the English UI unless stated.
  await page.getByRole('combobox').selectOption('en')
  await expect(page.getByRole('combobox')).toHaveValue('en')
}

/** Waits for POST /api/requests and returns the created tickets. */
export async function submitAndCapture(page: Page, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/requests') && r.request().method() === 'POST'),
    action(),
  ])
  expect(response.status()).toBe(201)
  const body = await response.json()
  return body as { tickets: { ticket_id: string; department: string; priority: string }[]; confirmation: string }
}

export const ticketCard = (page: Page, id: string) => page.locator(`[data-ticket-id="${id}"]`)

/**
 * Tap a request button wherever it lives: in the patient's top 3, or under "More requests" in its
 * group (US-6), e.g. Comfort → Blanket.
 */
export async function tapTile(page: Page, group: string, item: string) {
  const top = page.getByTestId('top-tiles').getByRole('button', { name: item, exact: true })
  if (await top.count()) return top.click()
  const more = page.getByRole('button', { name: 'More requests' })
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
  await page.getByRole('button', { name: group, exact: true }).click()
  await page.getByRole('button', { name: item, exact: true }).click()
}

/** Open the request history behind the header bell. */
export async function openRequests(page: Page) {
  await page.getByTestId('requests-bell').click()
  return page.getByTestId('requests-panel')
}
