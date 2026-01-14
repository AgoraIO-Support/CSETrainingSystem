import { NextResponse } from 'next/server'

jest.mock('@/lib/auth-middleware', () => ({
  withAdminAuth:
    (handler: any) =>
    async (req: any, context: any) =>
      handler(req, { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }, context),
}))

const prismaMock = {
  lesson: {
    findUnique: jest.fn(),
  },
  knowledgeContextJob: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  knowledgeContextJobEvent: {
    create: jest.fn(),
  },
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}))

describe('POST /api/admin/lessons/[lessonId]/knowledge/process', () => {
  beforeEach(() => {
    prismaMock.lesson.findUnique.mockReset()
    prismaMock.knowledgeContextJob.findFirst.mockReset()
    prismaMock.knowledgeContextJob.updateMany.mockReset()
    prismaMock.knowledgeContextJob.create.mockReset()
    prismaMock.knowledgeContextJobEvent.create.mockReset()
  })

  it('enqueues a job and persists promptTemplateId into metrics', async () => {
    prismaMock.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      chapter: { course: { id: 'course-1', title: 'Course 1' } },
      transcripts: [{ id: 'tr-1', s3Key: 'prefix/lesson-1/tr-1.vtt' }],
    })
    prismaMock.knowledgeContextJob.findFirst.mockResolvedValue(null)
    prismaMock.knowledgeContextJob.create.mockResolvedValue({
      id: 'job-1',
      lessonId: 'lesson-1',
      transcriptId: 'tr-1',
      state: 'QUEUED',
      stage: 'PENDING',
      progress: 0,
      attempt: 0,
      maxAttempts: 5,
      scheduledAt: new Date('2026-01-13T00:00:00Z'),
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
      workerId: null,
      errorMessage: null,
      metrics: {},
      createdAt: new Date('2026-01-13T00:00:00Z'),
      updatedAt: new Date('2026-01-13T00:00:00Z'),
    })
    prismaMock.knowledgeContextJobEvent.create.mockResolvedValue({ id: 'evt-1' })

    const { POST } = await import('@/app/api/admin/lessons/[lessonId]/knowledge/process/route')

    const res = (await POST(
      {
        method: 'POST',
        url: 'http://localhost/api/admin/lessons/lesson-1/knowledge/process',
        json: async () => ({ promptTemplateId: 'tpl-123' }),
      } as any,
      { params: Promise.resolve({ lessonId: 'lesson-1' }) } as any
    )) as NextResponse

    expect(res.status).toBe(200)
    expect(prismaMock.knowledgeContextJob.create).toHaveBeenCalledTimes(1)
    const createArg = prismaMock.knowledgeContextJob.create.mock.calls[0]?.[0]
    expect(createArg.data.lessonId).toBe('lesson-1')
    expect(createArg.data.transcriptId).toBe('tr-1')
    expect(createArg.data.metrics).toEqual({
      transcriptS3Key: 'prefix/lesson-1/tr-1.vtt',
      promptTemplateId: 'tpl-123',
    })
  })
})

