import { expect, type Browser, type Page } from '@playwright/test'

export const PIN = process.env.STAFF_PIN ?? '2468'
export const MAX_LATENCY_MS = Number(process.env.MAX_LATENCY_MS ?? 1000)
export const SHOTS = process.env.SCREENSHOTS ? '../docs/screenshots' : null

export async function staffPage(browser: Browser, dept: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage()
  await page.goto(`/staff/${dept}`)
  await page.getByLabel('Department PIN').fill(PIN)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'live')
  return page
}

export async function patientPage(browser: Browser, room: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 768, height: 1024 } })).newPage()
  await page.goto(`/patient/${room}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Rooms have synthetic preferred languages; tests drive the English UI unless stated.
  await page.getByRole('combobox').selectOption('en')
  return page
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
