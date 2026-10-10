import { expect, test } from '@playwright/test'
import { openPatient, submitAndCapture, tapTile } from './helpers'

const SHOTS = process.env.SCREENSAVER_SHOTS

test('(f) idle patient screen shows the screensaver with the nurse button and open requests', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } })
  await context.clock.install()
  const patient = await context.newPage()
  await openPatient(patient, '406')
  await submitAndCapture(patient, () => tapTile(patient, 'Comfort', 'Pillow'))
  await patient.getByRole('button', { name: /make another request/i }).click()

  await patient.clock.fastForward('02:59')
  await expect(patient.getByTestId('screensaver')).toHaveCount(0)
  await patient.clock.fastForward('00:02')
  const saver = patient.getByTestId('screensaver')
  await expect(saver).toBeVisible()
  // toBeVisible() is true even at opacity 0, so check the patient can actually see it.
  await expect(saver).toHaveCSS('opacity', '1')
  await expect(saver.getByRole('button', { name: /^emergency$/i })).toBeEnabled()
  await expect(saver).toContainText('Housekeeping')
  if (SHOTS) await patient.screenshot({ path: `${SHOTS}/screensaver-tablet.png` })

  // A tap wakes it without pressing whatever tile is underneath.
  const before = await patient.getByTestId('patient-request').count()
  // Centre of the screen: over the tip text, which lets the tap through to the wake button.
  await saver.getByRole('button', { name: 'Tap anywhere to continue' }).click()
  await expect(saver).toHaveCount(0)
  await expect(patient.getByTestId('patient-request')).toHaveCount(before)
  await context.close()
})
