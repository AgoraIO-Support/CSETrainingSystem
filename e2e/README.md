# E2E Tests (Playwright)

This directory contains browser-level end-to-end tests organized by priority:

- **P0 (smoke, real browser, real server)**: a small set of “must work” user journeys.
- **P1 (browser + mocked network)**: stable regression coverage by intercepting selected APIs.
- **P2 (deep integration)**: long-running flows that depend on external systems (S3/OpenAI/worker jobs).

These tests are intentionally separate from Jest to keep CI deterministic.

## Prerequisites

- A running web server (e.g. `http://localhost:3000`).
- Seeded accounts (defaults):
  - User: `tester@agora.io` / `password123`
  - Admin: `admin@agora.io` / `password123`

## Run

- Install deps: `npm i`
- Install browser: `npm run e2e:install`
- Run E2E: `npm run e2e`
- Run UI mode: `npm run e2e:ui`

## Environment variables

- `E2E_BASE_URL` (default: `http://localhost:3000`)
- `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`

Optional:
- `E2E_LEARN_PATH` (if you want to skip course selection and go straight to `/learn/.../...`)
