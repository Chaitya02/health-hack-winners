import { expect, test } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:8000'

test('(h) bedside intake: notes pick the dashboard and the top buttons; start over resets', async ({ page, request }) => {
  await request.delete(`${API}/api/rooms/400/intake`) // fresh tablet
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()

  // Rosa: low vision + bathroom often → audio dashboard, Bathroom first.
  await page.getByRole('button', { name: /Rosa, 82/ }).click()
  await page.getByRole('button', { name: 'Set up my screen' }).click()
  await expect(page.getByTestId('patient-identity')).toHaveText(/Rosa.*82 years/)
  await expect(page.locator('[data-dashboard]')).toHaveAttribute('data-dashboard', 'audio')
  await expect(page.getByTestId('voice-bubble').or(page.getByTestId('voice-unavailable'))).toBeVisible()
  await expect(page.getByLabel('Type your request')).toHaveCount(0)
  await expect(page.getByTestId('top-tiles').getByRole('button').first()).toContainText('Help to the bathroom')
  await expect(page.getByRole('button', { name: /i need my nurse/i })).toBeEnabled()
  await expect(page.getByText(/macular|furosemide/i)).toHaveCount(0)
  if (process.env.INTAKE_SHOTS) await page.screenshot({ path: `${process.env.INTAKE_SHOTS}/dashboard-audio.png`, fullPage: true })

  // Start over → Sam: post-op, NPO → standard dashboard, medication first, no food/drink on top.
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('button', { name: /Sam, 54/ }).click()
  await page.getByRole('button', { name: 'Set up my screen' }).click()
  await expect(page.getByTestId('patient-identity')).toHaveText(/Sam.*54 years/)
  await expect(page.locator('[data-dashboard]')).toHaveAttribute('data-dashboard', 'standard')
  const top = page.getByTestId('top-tiles')
  await expect(top.getByRole('button').first()).toContainText('Medication')
  await expect(top.getByRole('button', { name: /water|food/i })).toHaveCount(0)
  await expect(page.getByTestId('requests-bell')).toHaveAccessibleName(/0 open requests/)
  if (process.env.INTAKE_SHOTS) await page.screenshot({ path: `${process.env.INTAKE_SHOTS}/dashboard-standard.png`, fullPage: true })

  await request.delete(`${API}/api/rooms/400/intake`)
})
