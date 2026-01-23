import { test, expect } from '@playwright/test'
import { getAdminCredentials, login } from '../utils/auth'

test.describe('P1 regression (admin analytics, mocked)', () => {
  test('renders charts and lists when /api/admin/analytics returns data', async ({ page }) => {
    await login(page, getAdminCredentials())

    await page.route('**/api/admin/analytics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            totalUsers: 123,
            activeUsers: 45,
            totalCourses: 8,
            totalEnrollments: 90,
            completionRate: 12.3,
            recentActivity: [
              {
                id: 'a1',
                date: '2026-01-10T00:00:00.000Z',
                activeUsers: 10,
                newEnrollments: 2,
                completedCourses: 1,
                totalViews: 30,
                aiInteractions: 7,
                createdAt: '2026-01-10T01:00:00.000Z',
              },
              {
                id: 'a2',
                date: '2026-01-11T00:00:00.000Z',
                activeUsers: 12,
                newEnrollments: 3,
                completedCourses: 0,
                totalViews: 40,
                aiInteractions: 9,
                createdAt: '2026-01-11T01:00:00.000Z',
              },
            ],
          },
        }),
      })
    })

    await page.goto('/admin/analytics', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Engagement Trend')).toBeVisible()
    await expect(page.getByText('AI & Platform Usage')).toBeVisible()
    await expect(page.getByText('Latest Snapshot')).toBeVisible()
    await expect(page.getByText('Recent Activity')).toBeVisible()

    // With mocked data, empty-state messages should not show.
    await expect(page.getByText('No analytics records for this range')).toHaveCount(0)
    await expect(page.getByText('No analytics records found.')).toHaveCount(0)
    await expect(page.getByText('No analytics entries recorded yet.')).toHaveCount(0)

    // Recent activity should list the mocked entries (date formatting is locale-specific; assert on the stable parts).
    await expect(page.getByText(/AI requests/i).first()).toBeVisible()
  })
})

