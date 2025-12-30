export {}

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
    throw new Error(
      `HTTP ${res.status} (expected ${expected}): ${typeof body === 'string' ? body : JSON.stringify(body)}`
    )
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

const main = async () => {
  const env = readEnv()
  expectTruthy(env.adminEmail, 'Missing E2E_ADMIN_EMAIL')
  expectTruthy(env.adminPassword, 'Missing E2E_ADMIN_PASSWORD')

  const state: Record<string, any> = { baseUrl: env.baseUrl }

  try {
    // 1) Login as admin
    const login = await jsonFetch<Json>(`${env.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
    })
    const token = mustString((login as any)?.data?.session?.accessToken, 'Admin login did not return accessToken')
    const adminUserId = mustString((login as any)?.data?.user?.id, 'Admin login did not return user.id')
    state.token = token
    state.adminUserId = adminUserId

    // 2) Create an exam with certificate template enabled (AUTO badge)
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const examTitle = `E2E Certificate ${stamp}`
    const createdExam = await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        examType: 'STANDALONE',
        title: examTitle,
        description: 'E2E certificate auto-issue + revoke/reissue (auto-cleanup)',
        totalScore: 10,
        // Passing logic currently uses rawScore >= passingScore, so set 0 for a deterministic pass.
        passingScore: 0,
        maxAttempts: 1,
        randomizeQuestions: false,
        randomizeOptions: false,
        showResultsImmediately: true,
        allowReview: true,
      }),
    })
    const examId = mustString((createdExam as any)?.data?.id, 'Create exam did not return exam id')
    state.examId = examId

    await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams/${examId}/certificate-template`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({
        isEnabled: true,
        title: `Certificate - ${examTitle}`,
        badgeMode: 'AUTO',
        badgeS3Key: null,
        badgeMimeType: null,
        badgeStyle: null,
      }),
    })

    // 3) Add a simple objective question (so the attempt can be auto-graded)
    const createdQuestion = await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams/${examId}/questions`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'TRUE_FALSE',
        difficulty: 'EASY',
        question: 'E2E: Certificate issuance test question (answer can be empty).',
        correctAnswer: 'true',
        points: 10,
      }),
      expectedStatus: 201,
    })
    state.questionId = mustString((createdQuestion as any)?.data?.id, 'Create question did not return question id')

    // 4) Move through review workflow: DRAFT -> PENDING_REVIEW -> APPROVED
    await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams/${examId}/status`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status: 'PENDING_REVIEW' }),
    })

    await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams/${examId}/status`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status: 'APPROVED' }),
    })

    // 5) Publish + assign to the admin user (so we don't create any extra users)
    await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams/${examId}/publish`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ userIds: [adminUserId], sendEmail: false }),
    })

    // 6) Start attempt (user flow)
    const started = await jsonFetch<Json>(`${env.baseUrl}/api/exams/${examId}/start`, {
      method: 'POST',
      headers: authHeaders(token),
    })
    const attemptId = mustString((started as any)?.data?.attemptId, 'Start attempt did not return attemptId')
    state.attemptId = attemptId

    // 7) Submit without answering (still passes due to passingScore=0)
    const submitted = await jsonFetch<Json>(`${env.baseUrl}/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ attemptId }),
    })
    expectTruthy((submitted as any)?.success === true, 'Submit did not succeed')

    // 8) Assert certificate auto-issued
    const certs = await jsonFetch<Json>(`${env.baseUrl}/api/certificates`, {
      method: 'GET',
      headers: authHeaders(token),
    })
    const list: Array<any> = (certs as any)?.data ?? []
    expectTruthy(Array.isArray(list), 'Certificates list is not an array')
    const cert = list.find((c) => c?.examId === examId)
    expectTruthy(cert, 'Expected a certificate issued for this exam')
    expectTruthy(cert.status === 'ISSUED', `Expected certificate status ISSUED, got ${String(cert.status)}`)
    const certificateId = mustString(cert.id, 'Certificate id missing')
    const certificateNumber = mustString(cert.certificateNumber, 'Certificate number missing')
    state.certificateId = certificateId
    state.certificateNumber = certificateNumber

    // 9) Public verify should succeed
    const verify1 = await jsonFetch<Json>(`${env.baseUrl}/api/certificates/verify/${encodeURIComponent(certificateNumber)}`, {
      method: 'GET',
    })
    expectTruthy((verify1 as any)?.data?.valid === true, 'Expected certificate verify to be valid after issue')

    // 10) Admin revoke
    await jsonFetch<Json>(`${env.baseUrl}/api/admin/certificates/${certificateId}/revoke`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    })

    const verify2 = await jsonFetch<Json>(`${env.baseUrl}/api/certificates/verify/${encodeURIComponent(certificateNumber)}`, {
      method: 'GET',
    })
    expectTruthy((verify2 as any)?.data?.valid === false, 'Expected certificate verify to be invalid after revoke')

    // 11) Admin reissue
    await jsonFetch<Json>(`${env.baseUrl}/api/admin/certificates/${certificateId}/reissue`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    })

    const verify3 = await jsonFetch<Json>(`${env.baseUrl}/api/certificates/verify/${encodeURIComponent(certificateNumber)}`, {
      method: 'GET',
    })
    expectTruthy((verify3 as any)?.data?.valid === true, 'Expected certificate verify to be valid after reissue')

    // eslint-disable-next-line no-console
    console.log('E2E PASS: certificate auto-issue + revoke + reissue', {
      examId,
      attemptId,
      certificateId,
      certificateNumber,
    })
  } finally {
    // Cleanup: force-delete exam (also deletes associated exercise recordings + certificates + badge assets)
    try {
      if (state.examId && state.token) {
        await jsonFetch<Json>(`${env.baseUrl}/api/admin/exams/${state.examId}?force=1`, {
          method: 'DELETE',
          headers: authHeaders(state.token),
        })
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Cleanup failed: delete exam (force)', e)
      throw e
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('E2E FAIL:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
