import { expect, test } from '@playwright/test'
import { MAX_LATENCY_MS, patientPage, SHOTS, staffPage, submitAndCapture, ticketCard } from './helpers'

test('(a) pillow on the tablet appears live in Housekeeping and never in Nursing', async ({ browser }) => {
  const housekeeping = await staffPage(browser, 'housekeeping')
  const nursing = await staffPage(browser, 'nursing')
  const patient = await patientPage(browser, '401')

  let t0 = 0
  const { tickets } = await submitAndCapture(patient, async () => {
    t0 = Date.now()
    await patient.getByRole('button', { name: 'Pillow', exact: true }).click()
  })
  expect(tickets.map((t) => t.department)).toEqual(['housekeeping'])
  const id = tickets[0].ticket_id

  await expect(ticketCard(housekeeping, id)).toBeVisible()
  const latency = Date.now() - t0
  console.log(`REALTIME_LATENCY_MS=${latency} (tap → visible on Housekeeping dashboard)`)
  expect(latency).toBeLessThan(MAX_LATENCY_MS)
  await expect(patient.getByTestId('confirmation')).toContainText('Housekeeping is on the way')

  await nursing.waitForTimeout(1500)
  await expect(ticketCard(nursing, id)).toHaveCount(0)
  if (SHOTS) {
    await patient.screenshot({ path: `${SHOTS}/patient-confirmation-tablet.png` })
    await housekeeping.screenshot({ path: `${SHOTS}/staff-housekeeping.png` })
  }
})

test('(b) incision throbbing + dizzy → Nursing HIGH alert', async ({ browser }) => {
  const nursing = await staffPage(browser, 'nursing')
  const patient = await patientPage(browser, '402')
  await patient.getByLabel(/type your request|escriba su pedido/i).fill('my surgical incision is throbbing and I feel dizzy')
  const { tickets } = await submitAndCapture(patient, () =>
    patient.getByRole('button', { name: /send request|enviar pedido/i }).click(),
  )
  expect(tickets).toHaveLength(1)
  expect(tickets[0]).toMatchObject({ department: 'nursing', priority: 'HIGH' })
  const card = ticketCard(nursing, tickets[0].ticket_id)
  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute('data-priority', 'HIGH')
  await expect(nursing.getByTestId('urgent-banner')).toContainText('402')
  await expect(patient.getByTestId('confirmation')).toContainText(/nurse has been alerted/i)
  if (SHOTS) {
    await nursing.screenshot({ path: `${SHOTS}/staff-nursing-urgent.png` })
    await patient.screenshot({ path: `${SHOTS}/patient-urgent-tablet.png` })
  }
  await card.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(nursing.getByTestId('urgent-banner')).not.toContainText('402')
})

test('(c) Spanish ice-water request → Food Services with Spanish confirmation', async ({ browser }) => {
  const food = await staffPage(browser, 'food')
  const patient = await patientPage(browser, '403')
  await patient.getByLabel(/type your request/i).fill('¿Me puede traer agua con hielo?')
  const { tickets, confirmation } = await submitAndCapture(patient, () =>
    patient.getByRole('button', { name: /send request/i }).click(),
  )
  expect(tickets.map((t) => t.department)).toEqual(['food'])
  expect(confirmation).toMatch(/alimentación/i)
  await expect(patient.getByTestId('confirmation')).toContainText('Servicios de alimentación va en camino')
  await expect(patient.getByRole('button', { name: 'Hacer otro pedido' })).toBeVisible()
  await expect(ticketCard(food, tickets[0].ticket_id)).toContainText('ES')
})

test('(d) staff escalates a ticket → it appears in Nursing', async ({ browser }) => {
  const housekeeping = await staffPage(browser, 'housekeeping')
  const nursing = await staffPage(browser, 'nursing')
  const patient = await patientPage(browser, '404')
  const { tickets } = await submitAndCapture(patient, () =>
    patient.getByRole('button', { name: 'Blanket', exact: true }).click(),
  )
  const id = tickets[0].ticket_id
  const hkCard = ticketCard(housekeeping, id)
  await expect(hkCard).toBeVisible()
  await hkCard.getByRole('button', { name: /this is clinical/i }).click()
  await expect(hkCard).toHaveCount(0)
  const nurseCard = ticketCard(nursing, id)
  await expect(nurseCard).toBeVisible()
  await expect(nurseCard).toContainText('Escalated by Housekeeping')
  await expect(nurseCard).toHaveAttribute('data-priority', 'HIGH')
})

test('(e) WebSocket blocked → dashboard still updates via 2 s polling', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  const housekeeping = await context.newPage()
  // Block only the app socket (local /ws or API Gateway), not Vite HMR.
  await housekeeping.routeWebSocket(/\/ws$|execute-api/, (ws) => ws.close())
  await housekeeping.goto('/staff/housekeeping')
  await housekeeping.getByLabel('Department PIN').fill(process.env.STAFF_PIN ?? '2468')
  await housekeeping.getByRole('button', { name: 'Sign in' }).click()
  await expect(housekeeping.getByTestId('live-status')).toHaveAttribute('data-status', /offline|connecting/)

  const patient = await patientPage(browser, '405')
  const { tickets } = await submitAndCapture(patient, () =>
    patient.getByRole('button', { name: 'Ice', exact: true }).click(),
  )
  expect(tickets[0].department).toBe('food')
  const pillowReq = await submitAndCapture(patient, async () => {
    await patient.getByRole('button', { name: /make another request/i }).click()
    await patient.getByRole('button', { name: 'Pillow', exact: true }).click()
  })
  await expect(ticketCard(housekeeping, pillowReq.tickets[0].ticket_id)).toBeVisible({ timeout: 5000 })
  await expect(housekeeping.getByTestId('live-status')).not.toHaveAttribute('data-status', 'live')
})
