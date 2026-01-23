# E2E Test Plan

This is the proposed end-to-end test matrix for the project, split into tiers to balance coverage vs. runtime/flakiness.

## P0 (Smoke, always-on)

Goal: prove the app is usable for core roles.

- Learner can log in and browse courses
- Learner can enroll and open a lesson
- Learner can see Key Moments and click an anchor
- Admin can log in and open core admin pages (users/courses/analytics)

## P1 (Regression, stable via selective mocking)

Goal: cover UI state machines and API contracts without external dependencies.

- Admin analytics renders charts/lists when `/api/admin/analytics` has data (mocked)
- Admin analytics empty states render when `/api/admin/analytics` is empty (mocked)
- Learner lesson page renders “Key Moments” list for anchors API shapes (mocked)
- AI chat panel:
  - readiness gate (anchors empty → “preparing…” state)
  - timestamp buttons render from assistant message content (mocked)
  - send message error states (mocked 500/timeout)

## P2 (Deep integration, scheduled/on-demand)

Goal: validate async jobs and external integrations end-to-end.

- Transcript upload → knowledge context generated → anchors appear in learner UI
  - requires S3 + worker + OpenAI enabled
- Course materials download (CloudFront signed cookies)
- Exam publish → assign users → learner can start and submit attempt → admin analytics updates

## Data strategy

- Default: reuse local seeded accounts/courses, or set `E2E_*` env vars.
- Prefer deterministic test IDs via env (e.g. `E2E_LEARN_PATH`) for CI stability.
- For P2, run against a dedicated “test course” (isolated assets) to avoid impacting real data.

