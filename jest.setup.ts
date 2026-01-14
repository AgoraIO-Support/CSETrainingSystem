// Jest shared setup (node + jsdom)
// Intentionally minimal: avoid changing existing test behavior.

import '@testing-library/jest-dom'

// Ensure Prisma can find DATABASE_URL when running via Jest (Next normally loads .env).
if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env' })

  // Local dev fallback (repo typically runs Postgres via podman with this mapping).
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/cselearning-database?schema=public'
  }
}

// Never hit real OpenAI in tests (existing tests mock `global.fetch`).
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

// JSDOM-only shims (guarded so node tests don’t crash).
if (typeof window !== 'undefined') {
  // Some components call scrollIntoView; JSDOM doesn’t implement it.
  if (!('scrollIntoView' in HTMLElement.prototype)) {
    // @ts-expect-error - JSDOM shim
    HTMLElement.prototype.scrollIntoView = () => {}
  }

  // Some UI libs rely on matchMedia.
  if (!window.matchMedia) {
    window.matchMedia = () =>
      ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as any
  }
}
