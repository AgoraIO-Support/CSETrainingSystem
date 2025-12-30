import { CourseService } from '@/lib/services/course.service'
import { GET } from '@/app/api/courses/route'

jest.mock('@/lib/services/course.service', () => ({
    CourseService: {
        getCourses: jest.fn(),
    },
}))

const mockedCourseService = CourseService as unknown as {
    getCourses: jest.Mock
}

describe('API /api/courses: level parsing', () => {
    beforeEach(() => {
        mockedCourseService.getCourses.mockReset()
        mockedCourseService.getCourses.mockResolvedValue({
            courses: [],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
        })
    })

    it.each([
        ['BEGINNER', 'BEGINNER'],
        ['beginner', 'BEGINNER'],
        ['Beginner', 'BEGINNER'],
        ['Intermediate', 'INTERMEDIATE'],
        ['advanced', 'ADVANCED'],
        ['All Levels', undefined],
        ['ALL', undefined],
        ['unknown', undefined],
    ])('maps "%s" to %s', async (raw, expected) => {
        await GET({ url: `http://localhost:3000/api/courses?level=${encodeURIComponent(raw)}` } as any)

        expect(mockedCourseService.getCourses).toHaveBeenCalledTimes(1)
        const arg = mockedCourseService.getCourses.mock.calls[0]?.[0]
        expect(arg.level).toBe(expected)
    })
})

