/** @jest-environment jsdom */

/**
 * Admin UI "E2E" (JSDOM) Test: Analytics page tolerates leaderboard response shape
 *
 * Why this test exists:
 * - A runtime crash occurred: `leaderboard.map is not a function`.
 * - The leaderboard API returns `{ data: { examId, examTitle, leaderboard: [...] } }`
 *   but the UI previously treated `data` as the array directly.
 * - This test ensures we don't regress and reintroduce the crash.
 */

jest.mock('react', () => {
    const actual = jest.requireActual('react')
    return {
        ...actual,
        use: (value: any) => value,
    }
})

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import ExamAnalyticsPage from '@/app/admin/exams/[id]/analytics/page'
import { ApiClient } from '@/lib/api-client'

jest.mock('@/components/layout/dashboard-layout', () => ({
    DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/lib/api-client', () => ({
    ApiClient: {
        getAdminExam: jest.fn(),
        getExamAnalytics: jest.fn(),
        getExamLeaderboard: jest.fn(),
        exportExamResults: jest.fn(),
    },
}))

const mockedApi = ApiClient as unknown as {
    getAdminExam: jest.Mock
    getExamAnalytics: jest.Mock
    getExamLeaderboard: jest.Mock
}

describe('Admin Exam Analytics: Leaderboard response shape', () => {
    beforeEach(() => {
        mockedApi.getAdminExam.mockReset()
        mockedApi.getExamAnalytics.mockReset()
        mockedApi.getExamLeaderboard.mockReset()
    })

    it('renders Top Performers when API returns { leaderboard: [...] }', async () => {
        mockedApi.getAdminExam.mockResolvedValue({
            success: true,
            data: {
                id: 'exam-analytics-1',
                title: 'Analytics Exam',
                totalScore: 100,
                passingScore: 70,
                status: 'PUBLISHED',
                examType: 'COURSE_BASED',
            },
        })
        mockedApi.getExamAnalytics.mockResolvedValue({
            success: true,
            data: {
                totalAttempts: 1,
                completedAttempts: 1,
                avgScore: 88,
                highestScore: 88,
                lowestScore: 88,
                avgCompletionTime: 10,
                passRate: 100,
            },
        })
        mockedApi.getExamLeaderboard.mockResolvedValue({
            success: true,
            data: {
                examId: 'exam-analytics-1',
                examTitle: 'Analytics Exam',
                leaderboard: [
                    {
                        rank: 1,
                        userId: 'u1',
                        userName: 'Test User',
                        score: 88,
                        percentageScore: 88,
                        completedAt: new Date().toISOString(),
                    },
                ],
            },
        })

        render(<ExamAnalyticsPage params={{ id: 'exam-analytics-1' } as any} />)

        await screen.findByText('Top Performers')
        await screen.findByText('Test User')
        const scores = await screen.findAllByText('88%')
        expect(scores.length).toBeGreaterThan(0)
    })
})
