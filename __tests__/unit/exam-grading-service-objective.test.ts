/**
 * Unit tests: ExamGradingService objective grading behavior
 *
 * Why these tests exist:
 * - We must auto-grade ONLY Multiple Choice + True/False.
 * - Fill-in-Blank and Essay should NOT be auto-graded (manual grading only).
 * - Multiple Choice correctAnswer canonical format is index string ("0".."3").
 */

import { ExamGradingService } from '@/lib/services/exam-grading.service'
import { ExamAttemptStatus, ExamQuestionType, GradingStatus } from '@prisma/client'

jest.mock('openai', () => {
    return {
        __esModule: true,
        default: function OpenAI() {
            return {
                chat: { completions: { create: jest.fn() } },
            }
        },
    }
})

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        examAttempt: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        examAnswer: {
            createMany: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
    },
}))

const prisma = (jest.requireMock('@/lib/prisma') as any).default as {
    examAttempt: { findUnique: jest.Mock; update: jest.Mock }
    examAnswer: { createMany: jest.Mock; update: jest.Mock; count: jest.Mock }
}

describe('ExamGradingService (objective grading only)', () => {
    beforeEach(() => {
        prisma.examAttempt.findUnique.mockReset()
        prisma.examAttempt.update.mockReset()
        prisma.examAnswer.createMany.mockReset()
        prisma.examAnswer.update.mockReset()
        prisma.examAnswer.count.mockReset()
    })

    it('auto-grades MULTIPLE_CHOICE + TRUE_FALSE and leaves FILL_IN_BLANK + ESSAY pending', async () => {
        const attemptId = 'attempt-1'

        prisma.examAttempt.findUnique.mockResolvedValue({
            id: attemptId,
            status: ExamAttemptStatus.SUBMITTED,
            exam: {
                questions: [
                    { id: 'q-mc', type: ExamQuestionType.MULTIPLE_CHOICE, points: 10 },
                    { id: 'q-tf', type: ExamQuestionType.TRUE_FALSE, points: 5 },
                    { id: 'q-fib', type: ExamQuestionType.FILL_IN_BLANK, points: 5 },
                    { id: 'q-essay', type: ExamQuestionType.ESSAY, points: 10 },
                ],
            },
            answers: [
                {
                    id: 'a-mc',
                    questionId: 'q-mc',
                    selectedOption: 1,
                    answer: null,
                    gradingStatus: GradingStatus.PENDING,
                    question: {
                        id: 'q-mc',
                        type: ExamQuestionType.MULTIPLE_CHOICE,
                        correctAnswer: '1',
                        options: ['A1', 'B1', 'C1', 'D1'],
                        points: 10,
                    },
                },
                {
                    id: 'a-tf',
                    questionId: 'q-tf',
                    selectedOption: null,
                    answer: 'true',
                    gradingStatus: GradingStatus.PENDING,
                    question: {
                        id: 'q-tf',
                        type: ExamQuestionType.TRUE_FALSE,
                        correctAnswer: 'true',
                        options: null,
                        points: 5,
                    },
                },
                {
                    id: 'a-fib',
                    questionId: 'q-fib',
                    selectedOption: null,
                    answer: 'some text',
                    gradingStatus: GradingStatus.PENDING,
                    question: {
                        id: 'q-fib',
                        type: ExamQuestionType.FILL_IN_BLANK,
                        correctAnswer: 'expected',
                        options: null,
                        points: 5,
                    },
                },
                {
                    id: 'a-essay',
                    questionId: 'q-essay',
                    selectedOption: null,
                    answer: 'essay answer',
                    gradingStatus: GradingStatus.PENDING,
                    question: {
                        id: 'q-essay',
                        type: ExamQuestionType.ESSAY,
                        correctAnswer: null,
                        options: null,
                        points: 10,
                    },
                },
            ],
        })

        prisma.examAnswer.update.mockResolvedValue({})

        const finalizeSpy = jest
            .spyOn(ExamGradingService.prototype, 'calculateFinalScore')
            .mockResolvedValue({
                attemptId,
                rawScore: 0,
                percentageScore: 0,
                passed: false,
                totalScore: 100,
                passingScore: 70,
            })

        const service = new ExamGradingService()
        const result = await service.gradeAttempt(attemptId)

        // Objective answers updated, manual answers untouched
        expect(prisma.examAnswer.update).toHaveBeenCalledTimes(2)
        expect(prisma.examAnswer.update.mock.calls[0][0]).toMatchObject({ where: { id: 'a-mc' } })
        expect(prisma.examAnswer.update.mock.calls[1][0]).toMatchObject({ where: { id: 'a-tf' } })

        // Should NOT finalize because there are manual questions pending.
        expect(finalizeSpy).not.toHaveBeenCalled()

        expect(result).toMatchObject({
            attemptId,
            gradedQuestions: 2,
            pendingEssays: 2,
            autoGradedScore: 15,
            maxAutoGradedScore: 15,
        })

        finalizeSpy.mockRestore()
    })
})

