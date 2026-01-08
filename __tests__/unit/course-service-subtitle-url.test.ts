import { CourseService } from '@/lib/services/course.service'

jest.mock('@/lib/services/file.service', () => ({
  FileService: {
    getAssetAccessUrl: jest.fn(async (key: string) => `https://assets.example/${key}`),
  },
}))

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    course: {
      findFirst: jest.fn(),
    },
    enrollment: {
      findUnique: jest.fn(),
    },
  },
}))

const prisma = (jest.requireMock('@/lib/prisma') as any).default as {
  course: { findFirst: jest.Mock }
  enrollment: { findUnique: jest.Mock }
}

describe('CourseService subtitleUrl', () => {
  beforeEach(() => {
    prisma.course.findFirst.mockReset()
    prisma.enrollment.findUnique.mockReset()
    prisma.enrollment.findUnique.mockResolvedValue(null)
  })

  it('does not require transcript status READY to expose subtitleUrl', async () => {
    prisma.course.findFirst.mockImplementation(async (args: any) => {
      // Ensure we are not filtering transcripts to READY in the query include.
      expect(args.include.chapters.include.lessons.include.transcripts.where).toBeUndefined()

      return {
        id: 'course-1',
        title: 'Course',
        description: 'Desc',
        thumbnail: null,
        duration: 120,
        level: 'BEGINNER',
        category: 'Cat',
        rating: 0,
        reviewCount: 0,
        enrolledCount: 0,
        tags: [],
        instructor: { id: 'inst-1', name: 'Inst', avatar: null, title: null, bio: null },
        chapters: [
          {
            id: 'ch-1',
            title: 'Ch',
            description: null,
            order: 1,
            lessons: [
              {
                id: 'lesson-1',
                title: 'Lesson',
                description: null,
                order: 1,
                duration: 120,
                durationMinutes: null,
                videoUrl: null,
                subtitleUrl: null,
                subtitleKey: null,
                videoKey: null,
                assets: [],
                transcripts: [
                  {
                    s3Key: 'CSETraining_Dev/course-1/lesson-1/transcript.vtt',
                    url: null,
                    language: 'en',
                  },
                ],
              },
            ],
          },
        ],
        assets: [],
        slug: 'course',
        status: 'PUBLISHED',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    const course = await CourseService.getCourseById('course-1')
    const lesson = course.chapters?.[0]?.lessons?.[0]
    expect(lesson?.subtitleUrl).toBe('https://assets.example/CSETraining_Dev/course-1/lesson-1/transcript.vtt')
  })
})

