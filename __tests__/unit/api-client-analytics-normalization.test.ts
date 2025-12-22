/** @jest-environment jsdom */

/**
 * ApiClient normalization tests
 *
 * Why these tests exist:
 * - Backend analytics endpoints return nested shapes (e.g. `{ summary: {...} }` and
 *   leaderboard entries with `bestScore`).
 * - Admin UI expects a flattened `ExamAnalytics` shape and leaderboard items with
 *   `percentageScore`.
 * - This guards against regressions where UI silently shows zeros/NaN.
 */

import { ApiClient } from '@/lib/api-client'

describe('ApiClient analytics normalization', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        // Ensure auth header is set (not strictly required for mapping).
        localStorage.setItem('accessToken', 'test-token')
    })

    afterEach(() => {
        global.fetch = originalFetch
        localStorage.clear()
    })

    it('normalizes exam analytics `{ summary: ... }` into flat `ExamAnalytics`', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    examId: 'exam-1',
                    examTitle: 'Exam 1',
                    summary: {
                        totalAttempts: 2,
                        uniqueUsers: 1,
                        completedAttempts: 2,
                        passedCount: 0,
                        failedCount: 1,
                        passRate: 0,
                        averageScore: 8,
                        medianScore: 8,
                        minScore: 8,
                        maxScore: 8,
                        averageCompletionTime: 0.5,
                    },
                },
            }),
        } as any)

        const res = await ApiClient.getExamAnalytics('exam-1')
        expect(res.success).toBe(true)
        expect(res.data).toMatchObject({
            examId: 'exam-1',
            totalAttempts: 2,
            uniqueUsers: 1,
            passCount: 0,
            failCount: 1,
            avgScore: 8,
            medianScore: 8,
            highestScore: 8,
            lowestScore: 8,
        })
    })

    it('normalizes leaderboard `bestScore` into `percentageScore`', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    examId: 'exam-1',
                    examTitle: 'Exam 1',
                    leaderboard: [
                        {
                            rank: 1,
                            userId: 'u1',
                            userName: 'Test User',
                            bestScore: 92,
                            attemptsCount: 1,
                            completedAt: '2025-01-01T00:00:00.000Z',
                        },
                    ],
                },
            }),
        } as any)

        const res = await ApiClient.getExamLeaderboard('exam-1', 10)
        expect(res.success).toBe(true)
        expect(res.data.leaderboard[0]).toMatchObject({
            userId: 'u1',
            percentageScore: 92,
            score: 92,
        })
    })
})

