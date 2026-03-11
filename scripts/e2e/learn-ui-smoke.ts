/**
 * Browser E2E smoke test (Puppeteer)
 *
 * Why this exists:
 * - Learner UX is critical (video + Key Moments + timestamp navigation).
 * - JSDOM tests cover integration logic, but this script validates the real UI wiring
 *   against a running Next.js dev server and real browser media elements.
 *
 * How to run:
 *   npm --prefix scripts/e2e install
 *
 *   E2E_BASE_URL=http://localhost:3000 \\
 *   E2E_USER_EMAIL=user@agora.io \\
 *   E2E_USER_PASSWORD=password123 \\
 *   E2E_LEARN_PATH=/learn/<courseId>/<lessonId> \\
 *   npx tsx scripts/e2e/learn-ui-smoke.ts
 *
 * Notes:
 * - This is intentionally NOT wired into `npm test` to keep CI deterministic.
 * - It exits non-zero on failure so it can still be used in pipelines when desired.
 */

import puppeteer from 'puppeteer'

type Env = {
  baseUrl: string
  email: string
  password: string
  learnPath: string
}

const readEnv = (): Env => {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000'
  const email = process.env.E2E_USER_EMAIL || 'user@agora.io'
  const password = process.env.E2E_USER_PASSWORD || 'password123'
  const learnPath =
    process.env.E2E_LEARN_PATH ||
    '/learn/2ec86632-aa0a-46b7-8920-35d345481500/39a42884-c3d5-4817-a581-4cc0b4cddedd'

  return { baseUrl, email, password, learnPath }
}

const expectTruthy = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const main = async () => {
  const env = readEnv()

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60_000)

    // Login
    await page.goto(`${env.baseUrl}/login`, { waitUntil: 'networkidle2' })
    await page.type('#email', env.email, { delay: 10 })
    await page.type('#password', env.password, { delay: 10 })
    await page.click('button[type="submit"]')
    // Next.js login usually navigates client-side; wait on URL change + dashboard content.
    await page.waitForFunction(() => window.location.pathname !== '/login')
    await page.waitForFunction(() => document.body?.innerText?.includes('Dashboard'))

    // Learner page
    // Avoid `networkidle2` here because the video player keeps network activity open.
    await page.goto(`${env.baseUrl}${env.learnPath}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body?.innerText?.includes('Key Moments'))

    // Wait for anchors to render (count > 0)
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.some((b) => /\b\d{2}:\d{2}:\d{2}\b/.test(b.textContent || ''))
    })

    // Click the first Key Moments anchor and assert video currentTime jumps forward.
    const before = await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement | null
      return v?.currentTime ?? null
    })
    expectTruthy(typeof before === 'number', 'No <video> element found on learner page')

    // Heuristic: Key Moments anchors are rendered as <button> items containing "00:MM:SS".
    const clickedAnchor = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const anchor = buttons.find((b) => /\b\d{2}:\d{2}:\d{2}\b/.test(b.textContent || ''))
      if (!anchor) return false
      anchor.click()
      return true
    })
    expectTruthy(clickedAnchor, 'No Key Moments anchor button found')

    await page.waitForFunction(
      (minDelta: number) => {
        const v = document.querySelector('video') as HTMLVideoElement | null
        if (!v) return false
        return v.currentTime >= minDelta
      },
      {},
      (before as number) + 30
    )

    // Click an AI timestamp button if present (e.g., "00:12:08") and assert another jump.
    const hasTimestampButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.some((b) => /^\d{2}:\d{2}:\d{2}$/.test((b.textContent || '').trim()))
    })
    if (hasTimestampButton) {
      const beforeTs = await page.evaluate(
        () => (document.querySelector('video') as HTMLVideoElement | null)?.currentTime ?? null
      )

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const ts = buttons.find((b) => /^\d{2}:\d{2}:\d{2}$/.test((b.textContent || '').trim()))
        ts?.click()
      })

      await page.waitForFunction(
        (prev: number) => {
          const v = document.querySelector('video') as HTMLVideoElement | null
          if (!v) return false
          return v.currentTime > prev + 1
        },
        {},
        typeof beforeTs === 'number' ? beforeTs : 0
      )
    }

    // Success
    // eslint-disable-next-line no-console
    console.log('[learn-ui-smoke] PASS', {
      baseUrl: env.baseUrl,
      learnPath: env.learnPath,
      userEmail: env.email,
    })
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[learn-ui-smoke] FAIL:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
