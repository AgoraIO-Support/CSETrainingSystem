import type { Page } from '@playwright/test'

type LoginParams = {
  email: string
  password: string
}

export async function login(page: Page, params: LoginParams) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(params.email)
  await page.locator('#password').fill(params.password)

  await page.locator('#email').dispatchEvent('change')
  await page.locator('#password').dispatchEvent('change')

  await page.getByRole('button', { name: /^sign in$/i }).click()

  // Client-side navigation: wait until we're not on /login anymore.
  // If an error alert appears instead, fail fast with its message.
  await Promise.race([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 }),
    (async () => {
      const alert = page.getByRole('alert').filter({ hasText: /.+/ }).first()
      await alert.waitFor({ state: 'visible', timeout: 10_000 })
      const message = (await alert.textContent())?.trim() || 'Login failed (unknown error)'
      throw new Error(message)
    })(),
  ])
}

export function getUserCredentials() {
  return {
    email: process.env.E2E_USER_EMAIL || 'tester@agora.io',
    password: process.env.E2E_USER_PASSWORD || 'password123',
  }
}

export function getAdminCredentials() {
  return {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@agora.io',
    password: process.env.E2E_ADMIN_PASSWORD || 'password123',
  }
}
