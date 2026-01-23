import { test, expect } from '@playwright/test'
import { getUserCredentials, login } from '../utils/auth'

const parseTimestampToSeconds = (timestamp: string) => {
  const parts = timestamp.trim().split(':').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [hh, mm, ss] = parts
  return hh * 3600 + mm * 60 + ss
}

test.describe('P0 smoke (learner)', () => {
  test('can login, enroll, and open first lesson with Key Moments', async ({ page }) => {
    await login(page, getUserCredentials())

    const explicitLearnPath = (process.env.E2E_LEARN_PATH || '').trim()
    if (explicitLearnPath) {
      await page.goto(explicitLearnPath, { waitUntil: 'domcontentloaded' })
    } else {
      await page.goto('/courses', { waitUntil: 'domcontentloaded' })

      // Wait for at least one course card action.
      const viewCourse = page.getByRole('button', { name: /view course/i }).first()
      await expect(viewCourse).toBeVisible()
      await viewCourse.click()
      await page.waitForURL(/\/courses\/[^/]+$/, { timeout: 60_000 })

      const enroll = page.getByRole('button', { name: /enroll now/i })
      const startCourse = page.getByRole('link', { name: /start course|continue learning/i })

      // Wait until either state is visible (enrolled or not enrolled).
      await Promise.race([
        enroll.waitFor({ state: 'visible', timeout: 30_000 }),
        startCourse.waitFor({ state: 'visible', timeout: 30_000 }),
      ])

      if (await enroll.isVisible().catch(() => false)) {
        await enroll.click()
        await startCourse.waitFor({ state: 'visible', timeout: 60_000 })
      }

      await startCourse.click()
    }

    await expect(page.getByText('Key Moments')).toBeVisible({ timeout: 60_000 })

    // Anchors are <button> items with timestamps like 00:00:00.
    const firstAnchor = page.getByRole('button', { name: /\b\d{2}:\d{2}:\d{2}\b/ }).first()
    await expect(firstAnchor).toBeVisible({ timeout: 60_000 })

    const anchorText = (await firstAnchor.textContent()) || ''
    const timestampMatch = anchorText.match(/\b(\d{2}:\d{2}:\d{2})\b/)
    const anchorTimestampStr = timestampMatch?.[1] || null
    const anchorSeconds = anchorTimestampStr ? parseTimestampToSeconds(anchorTimestampStr) : null

    const before = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null
      return typeof v?.currentTime === 'number' ? v.currentTime : null
    })

    await firstAnchor.click()

    // Prefer verifying the underlying media seek instead of relying on timeupdate-driven UI state.
    await page.waitForFunction(
      ({ before, anchorSeconds }) => {
        const v = document.querySelector('video') as HTMLVideoElement | null
        if (!v || typeof v.currentTime !== 'number') return false
        if (typeof anchorSeconds === 'number') {
          return v.currentTime >= Math.max(0, anchorSeconds - 1)
        }
        if (typeof before === 'number') {
          return Math.abs(v.currentTime - before) >= 1
        }
        return v.currentTime >= 1
      },
      { timeout: 60_000 },
      { before, anchorSeconds }
    )
  })
})
