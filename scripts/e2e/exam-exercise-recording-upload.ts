import { randomBytes } from 'crypto'

type Json = Record<string, any>

const readEnv = () => {
  const baseUrl = (process.env.E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const adminEmail = (process.env.E2E_ADMIN_EMAIL || '').trim()
  const adminPassword = (process.env.E2E_ADMIN_PASSWORD || '').trim()
  return { baseUrl, adminEmail, adminPassword }
}

const expectTruthy = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const mustString = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value
}

const jsonFetch = async <T>(
  url: string,
  opts: RequestInit & { expectedStatus?: number } = {}
): Promise<T> => {
  const res = await fetch(url, opts)
  const expected = opts.expectedStatus
  const contentType = res.headers.get('content-type') || ''

  const body = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => '')

  if (expected && res.status !== expected) {
    throw new Error(`HTTP ${res.status} (expected ${expected}): ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }

  return body as T
}

const authHeaders = (token?: string) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const putToS3 = async (uploadUrl: string, contentType: string, body: Uint8Array) => {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      // Signed header (PutObjectCommand sets SSE=AES256).
      'x-amz-server-side-encryption': 'AES256',
    },
    body: body as any,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 PUT failed: ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`)
  }
}

const main = async () => {
  const env = readEnv()
  expectTruthy(env.adminEmail, 'Missing E2E_ADMIN_EMAIL')
  expectTruthy(env.adminPassword, 'Missing E2E_ADMIN_PASSWORD')

  const state: Record<string, any> = { baseUrl: env.baseUrl }

  try {
    // 1) Login as admin (used for both admin + user exam flows)
    const login = await jsonFetch<any>(`${env.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
    })
    const token = mustString(login?.data?.session?.accessToken, 'Admin login did not return accessToken')
    const adminUserId = mustString(login?.data?.user?.id, 'Admin login did not return user.id')
    state.adminUserId = adminUserId
    state.token = token

    // 2) Create an exam (Standalone) with totalScore matching the single question points
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const examTitle = `E2E Exercise Recording ${stamp}`
    const createdExam = await jsonFetch<any>(`${env.baseUrl}/api/admin/exams`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        examType: 'STANDALONE',
        title: examTitle,
        description: 'E2E exercise recording upload test (auto-cleanup)',
        totalScore: 10,
        passingScore: 0,
        maxAttempts: 1,
        randomizeQuestions: false,
        randomizeOptions: false,
        showResultsImmediately: true,
        allowReview: true,
      }),
    })
    const examId = mustString(createdExam?.data?.id, 'Create exam did not return exam id')
    state.examId = examId

    // 3) Add EXERCISE question
    const createdQuestion = await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${examId}/questions`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'EXERCISE',
        difficulty: 'MEDIUM',
        question: 'Record your screen while completing the exercise, then submit the WebM recording.',
        points: 10,
      }),
      expectedStatus: 201,
    })
    const questionId = mustString(createdQuestion?.data?.id, 'Create question did not return question id')
    state.questionId = questionId

    // 4) Move through review workflow: DRAFT -> PENDING_REVIEW -> APPROVED
    await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${examId}/status`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status: 'PENDING_REVIEW' }),
    })

    await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${examId}/status`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status: 'APPROVED' }),
    })

    // 5) Publish + assign to the admin user (so we don't create any extra users)
    await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${examId}/publish`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userIds: [adminUserId], sendEmail: false }),
    })

    // 6) Start attempt (user flow)
    const started = await jsonFetch<any>(`${env.baseUrl}/api/exams/${examId}/start`, {
      method: 'POST',
      headers: authHeaders(token),
    })
    const attemptId = mustString(started?.data?.attemptId, 'Start attempt did not return attemptId')
    state.attemptId = attemptId

    const questions: Array<{ id: string; type: string }> = started?.data?.questions ?? []
    expectTruthy(Array.isArray(questions) && questions.length === 1, 'Expected exactly 1 question in the exam')
    expectTruthy(questions[0].id === questionId, 'Returned questionId mismatch')
    expectTruthy(questions[0].type === 'EXERCISE', 'Returned question type is not EXERCISE')

    // 7) Get presigned PUT url
    const upload = await jsonFetch<any>(`${env.baseUrl}/api/exams/${examId}/exercise/upload-url`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ attemptId, questionId }),
    })
    const uploadUrl = mustString(upload?.data?.uploadUrl, 'Upload URL missing')
    const key = mustString(upload?.data?.key, 'S3 key missing')
    state.recordingKey = key

    // 8) Upload a small WebM-ish payload (content-type is enforced; content bytes are not validated)
    const payload = randomBytes(256)
    await putToS3(uploadUrl, 'video/webm', payload)

    // 9) Confirm upload (server HEADs S3 and stores metadata)
    const confirmed = await jsonFetch<any>(`${env.baseUrl}/api/exams/${examId}/exercise/confirm`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ attemptId, questionId, durationSeconds: 2 }),
    })
    expectTruthy(confirmed?.data?.recordingS3Key === key, 'Confirm response recordingS3Key mismatch')

    // 10) Submit the exam
    await jsonFetch<any>(`${env.baseUrl}/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ attemptId }),
    })

    // 11) Admin fetch attempt detail and verify playback URL is present
    const detail = await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${examId}/attempts/${attemptId}`, {
      method: 'GET',
      headers: authHeaders(token),
    })
    const answers: Array<any> = detail?.data?.answers ?? []
    expectTruthy(Array.isArray(answers) && answers.length === 1, 'Expected exactly 1 answer row')
    expectTruthy(answers[0]?.question?.type === 'EXERCISE', 'Attempt detail question type is not EXERCISE')
    expectTruthy(answers[0]?.recordingS3Key === key, 'Attempt detail recordingS3Key mismatch')
    expectTruthy(typeof answers[0]?.recordingUrl === 'string' && answers[0].recordingUrl.length > 0, 'Attempt detail missing recordingUrl')

    // 12) Admin grade the exercise via existing manual-grading endpoint
    await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${examId}/attempts/${attemptId}/grade-essay`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ answerId: answers[0].id, score: 10, feedback: 'E2E exercise recording looks good.' }),
    })

    console.log('E2E PASS: exercise recording upload + admin playback + grading')
  } finally {
    // Cleanup: force-delete exam (also deletes associated exercise recordings from S3)
    try {
      if (state.examId) {
        await jsonFetch<any>(`${env.baseUrl}/api/admin/exams/${state.examId}?force=1`, {
          method: 'DELETE',
          headers: authHeaders(state.token),
        })
      }
    } catch (e) {
      console.error('Cleanup failed: delete exam (force)', e)
      throw e
    }
  }
}

main().catch((err) => {
  console.error('E2E FAIL:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
