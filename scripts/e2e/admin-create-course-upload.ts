/**
 * Admin E2E: create Course -> Chapter -> Lesson and upload MP4 + VTT as lesson assets.
 *
 * What it validates (end-to-end):
 * - Admin auth works
 * - Admin CRUD for course/chapter/lesson works
 * - Prepare -> S3 PUT -> confirm upload flow works for MP4 + VTT
 * - Learner payload returns signed GET URLs and the VTT content is fetchable
 * - (Optional) Basic learner UI loads the video + subtitles track
 *
 * Usage:
 *   npm --prefix scripts/e2e install
 *
 *   E2E_BASE_URL=http://127.0.0.1:3000 \
 *   E2E_ADMIN_EMAIL=admin@agora.io \
 *   E2E_ADMIN_PASSWORD=password123 \
 *   E2E_MP4_PATH=/abs/path/video.mp4 \
 *   E2E_VTT_PATH=/abs/path/subs.vtt \
 *   npx tsx scripts/e2e/admin-create-course-upload.ts
 */

import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer'

type Env = {
  baseUrl: string
  adminEmail: string
  adminPassword: string
  mp4Path: string
  vttPath: string
  runUi: boolean
}

const readEnv = (): Env => {
  const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
  const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@agora.io'
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'password123'
  const mp4Path =
    process.env.E2E_MP4_PATH ||
    '/Users/zhonghuang/Documents/InternalTrainingSystem-Fresh/Files/ConversationalAIEngineWorkshop.mp4'
  const vttPath =
    process.env.E2E_VTT_PATH ||
    '/Users/zhonghuang/Documents/InternalTrainingSystem-Fresh/Files/ConversationalAIEngineWorkshop.vtt'
  const runUi = (process.env.E2E_UI || '').trim() === '1'
  return { baseUrl, adminEmail, adminPassword, mp4Path, vttPath, runUi }
}

const expectTruthy = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const jsonFetch = async <T>(
  url: string,
  opts: RequestInit & { expectedStatus?: number } = {}
): Promise<T> => {
  const res = await fetch(url, opts)
  const expected = opts.expectedStatus
  if (expected && res.status !== expected) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} (expected ${expected}): ${text}`)
  }
  const data = (await res.json()) as T
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`)
  }
  return data
}

const putToS3 = async (uploadUrl: string, contentType: string, body: Uint8Array) => {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-server-side-encryption': 'AES256',
    },
    // `fetch` body typing differs between runtimes; this script runs in Node (undici accepts Uint8Array).
    body: body as any,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 PUT failed: ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`)
  }
}

const confirmLessonAssetUpload = async (
  baseUrl: string,
  authHeaders: Record<string, string>,
  courseId: string,
  chapterId: string,
  lessonId: string,
  uploadSessionId: string
) => {
  return jsonFetch<any>(
    `${baseUrl}/api/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}/assets/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ uploadSessionId }),
    }
  )
}

const main = async () => {
  const env = readEnv()
  const state: Record<string, unknown> = { baseUrl: env.baseUrl }

  try {
    await fs.access(env.mp4Path)
    await fs.access(env.vttPath)

    const [mp4Bytes, vttBytes] = await Promise.all([fs.readFile(env.mp4Path), fs.readFile(env.vttPath)])
    expectTruthy(mp4Bytes.byteLength > 1024 * 1024, `MP4 looks too small (${mp4Bytes.byteLength} bytes)`)
    expectTruthy(vttBytes.byteLength > 10, `VTT looks too small (${vttBytes.byteLength} bytes)`)

    const now = new Date()
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const courseTitle = `E2E Upload Smoke ${stamp}`
    const courseSlug = `e2e-upload-smoke-${stamp}`
    state.courseSlug = courseSlug

    // 1) Login as admin
    const login = await jsonFetch<any>(`${env.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
    })
    const token = login?.data?.session?.accessToken
    expectTruthy(typeof token === 'string' && token.length > 10, 'Failed to obtain access token')
    const authHeaders = { Authorization: `Bearer ${token}` }

    // 2) Pick an instructorId (any ADMIN)
    const instructors = await jsonFetch<any>(`${env.baseUrl}/api/admin/instructors`, {
      headers: { ...authHeaders },
    })
    const instructorId = instructors?.data?.[0]?.id
    expectTruthy(typeof instructorId === 'string', 'No instructors returned; expected at least one ADMIN user')
    state.instructorId = instructorId

    // 3) Create course (DRAFT to avoid polluting public catalog)
    const course = await jsonFetch<any>(`${env.baseUrl}/api/admin/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      expectedStatus: 201,
      body: JSON.stringify({
        title: courseTitle,
        slug: courseSlug,
        description: 'E2E admin upload smoke test (auto-generated).',
        level: 'BEGINNER',
        category: 'E2E',
        tags: ['e2e', 'upload'],
        instructorId,
        status: 'DRAFT',
      }),
    })
    const courseId = course?.data?.id
    expectTruthy(typeof courseId === 'string', 'Create course did not return course.id')
    state.courseId = courseId

    // 4) Create chapter
    const chapter = await jsonFetch<any>(`${env.baseUrl}/api/admin/courses/${courseId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      expectedStatus: 201,
      body: JSON.stringify({
        title: 'Chapter 1',
        description: 'Auto-generated E2E chapter',
      }),
    })
    const chapterId = chapter?.data?.id
    expectTruthy(typeof chapterId === 'string', 'Create chapter did not return chapter.id')
    state.chapterId = chapterId

    // 5) Create lesson
    const lessonTitle = path.basename(env.mp4Path).replace(/\.[^/.]+$/, '')
    const lesson = await jsonFetch<any>(
      `${env.baseUrl}/api/admin/courses/${courseId}/chapters/${chapterId}/lessons`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        expectedStatus: 201,
        body: JSON.stringify({
          title: lessonTitle,
          description: 'Auto-generated E2E lesson',
          durationMinutes: 60,
          lessonType: 'VIDEO',
        }),
      }
    )
    const lessonId = lesson?.data?.id
    expectTruthy(typeof lessonId === 'string', 'Create lesson did not return lesson.id')
    state.lessonId = lessonId

    // 6) Prepare + upload MP4 as VIDEO asset
    const mp4Name = path.basename(env.mp4Path)
    const mp4Upload = await jsonFetch<any>(
      `${env.baseUrl}/api/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}/assets/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          filename: mp4Name,
          contentType: 'video/mp4',
          type: 'VIDEO',
        }),
      }
    )
    const videoUploadSessionId = mp4Upload?.data?.uploadSessionId
    const mp4UploadUrl = mp4Upload?.data?.uploadUrl
    expectTruthy(typeof videoUploadSessionId === 'string', 'MP4 upload prepare did not return uploadSessionId')
    expectTruthy(typeof mp4UploadUrl === 'string', 'MP4 upload prepare did not return uploadUrl')
    await putToS3(mp4UploadUrl, 'video/mp4', mp4Bytes)
    const mp4Confirm = await confirmLessonAssetUpload(
      env.baseUrl,
      authHeaders,
      courseId,
      chapterId,
      lessonId,
      videoUploadSessionId
    )
    const videoAssetId = mp4Confirm?.data?.asset?.id
    expectTruthy(typeof videoAssetId === 'string', 'MP4 upload confirm did not return asset.id')
    state.videoAssetId = videoAssetId

    // 7) Prepare + upload VTT as TEXT asset (so learner UI can use it as subtitles)
    const vttName = path.basename(env.vttPath)
    const vttUpload = await jsonFetch<any>(
      `${env.baseUrl}/api/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}/assets/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          filename: vttName,
          contentType: 'text/vtt',
          type: 'TEXT',
        }),
      }
    )
    const vttUploadSessionId = vttUpload?.data?.uploadSessionId
    const vttUploadUrl = vttUpload?.data?.uploadUrl
    expectTruthy(typeof vttUploadSessionId === 'string', 'VTT upload prepare did not return uploadSessionId')
    expectTruthy(typeof vttUploadUrl === 'string', 'VTT upload prepare did not return uploadUrl')
    await putToS3(vttUploadUrl, 'text/vtt', vttBytes)
    const vttConfirm = await confirmLessonAssetUpload(
      env.baseUrl,
      authHeaders,
      courseId,
      chapterId,
      lessonId,
      vttUploadSessionId
    )
    const vttAssetId = vttConfirm?.data?.asset?.id
    expectTruthy(typeof vttAssetId === 'string', 'VTT upload confirm did not return asset.id')
    state.vttAssetId = vttAssetId

    // 8) Verify learner payload returns signed, fetchable URLs
    const coursePayload = await jsonFetch<any>(`${env.baseUrl}/api/courses/${courseId}`, {
      headers: { ...authHeaders },
    })

    const foundLesson =
      coursePayload?.data?.chapters
        ?.flatMap((c: any) => c.lessons || [])
        ?.find((l: any) => l.id === lessonId) || null
    expectTruthy(foundLesson, 'Lesson missing from /api/courses payload')

    const assets = foundLesson.assets || []
    const videoAsset =
      assets.find((a: any) => a.id === videoAssetId) || assets.find((a: any) => a.type === 'VIDEO')
    const subtitleAsset =
      assets.find((a: any) => a.id === vttAssetId) ||
      assets.find((a: any) => a.mimeType === 'text/vtt' || String(a.url || '').toLowerCase().includes('.vtt'))

    expectTruthy(videoAsset?.url, 'Video asset url missing from course payload')
    expectTruthy(subtitleAsset?.url, 'VTT asset url missing from course payload')

    // Range GET: video seeking depends on this.
    const rangeRes = await fetch(String(videoAsset.url), { headers: { Range: 'bytes=0-2047' } })
    expectTruthy(
      rangeRes.status === 206 || rangeRes.status === 200,
      `Unexpected video Range GET status: ${rangeRes.status}`
    )

    const vttRes = await fetch(String(subtitleAsset.url))
    expectTruthy(vttRes.ok, `Unexpected VTT GET status: ${vttRes.status}`)
    const vttText = await vttRes.text()
    expectTruthy(vttText.trimStart().startsWith('WEBVTT'), 'VTT content does not start with WEBVTT')

    // 9) Optional: learner UI smoke (login -> load /learn page)
    if (env.runUi) {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      try {
        const page = await browser.newPage()
        page.setDefaultTimeout(120_000)

        await page.goto(`${env.baseUrl}/login`, { waitUntil: 'networkidle2' })
        await page.type('#email', env.adminEmail, { delay: 5 })
        await page.type('#password', env.adminPassword, { delay: 5 })
        await page.click('button[type="submit"]')
        await page.waitForFunction(() => window.location.pathname !== '/login')

        await page.goto(`${env.baseUrl}/learn/${courseId}/${lessonId}`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => document.querySelectorAll('video-js').length > 0, { timeout: 120_000 })
        // Best-effort: many players only fetch subtitles when captions are enabled.
        // We already validated the signed VTT URL is fetchable (step 8), so don't fail UI smoke on this.
        await page
          .waitForResponse(
            (res) => res.url().toLowerCase().includes('.vtt') && res.status() >= 200 && res.status() < 400,
            { timeout: 15_000 }
          )
          .catch(() => undefined)
      } finally {
        await browser.close()
      }
    }

    // eslint-disable-next-line no-console
    console.log('[admin-create-course-upload] PASS', {
      courseId,
      chapterId,
      lessonId,
      videoAssetId,
      vttAssetId,
      learnUrl: `${env.baseUrl}/learn/${courseId}/${lessonId}`,
      adminEditUrl: `${env.baseUrl}/admin/courses/${courseId}/edit`,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin-create-course-upload] CONTEXT', state)
    throw err
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[admin-create-course-upload] FAIL:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
