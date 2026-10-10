import { expect, test, type Page } from '@playwright/test'
import { patientPage, staffPage, submitAndCapture, tapTile, ticketCard } from './helpers'

const SHOT = process.env.TRACKER_SHOT

const card = (page: Page, label: string) =>
  page.getByTestId('patient-request').filter({ has: page.getByTestId('request-label').getByText(label, { exact: true }) })

test('(g) patient tracker follows staff updates; still waiting and cancel reach the department', async ({ browser }) => {
  const housekeeping = await staffPage(browser, 'housekeeping')
  const patient = await patientPage(browser, '407')

  const pillow = await submitAndCapture(patient, () => tapTile(patient, 'Comfort', 'Pillow'))
  await patient.getByRole('button', { name: /make another request/i }).click()
  const blanket = await submitAndCapture(patient, () => tapTile(patient, 'Comfort', 'Blanket'))
  await patient.getByRole('button', { name: /make another request/i }).click()
  const [pillowId, blanketId] = [pillow.tickets[0].ticket_id, blanket.tickets[0].ticket_id]

  // Staff acknowledges the pillow → the patient's tracker moves to "Seen" live.
  await ticketCard(housekeeping, pillowId).getByRole('button', { name: 'Acknowledge' }).click()
  await expect(card(patient, 'Pillow').locator('[aria-current="step"]')).toHaveText(/Seen/)
  await expect(card(patient, 'Pillow').getByTestId('eta')).toContainText(/About \d+ min|Any minute now/)

  // "Still waiting?" shows up on the housekeeping card.
  await card(patient, 'Pillow').getByRole('button', { name: 'Still waiting?' }).click()
  await expect(card(patient, 'Pillow').getByText('We’ve reminded them.')).toBeVisible()
  await expect(ticketCard(housekeeping, pillowId).getByTestId('still-waiting')).toBeVisible()
  if (SHOT) await patient.screenshot({ path: SHOT, fullPage: true })

  // Cancelling the blanket (after confirming) takes it off the housekeeping queue.
  await card(patient, 'Blanket').getByRole('button', { name: 'Cancel request' }).click()
  await card(patient, 'Blanket').getByRole('button', { name: 'Yes, cancel' }).click()
  await expect(card(patient, 'Blanket')).toHaveAttribute('data-status', 'CANCELLED')
  await expect(ticketCard(housekeeping, blanketId)).toHaveCount(0)
})
