/**
 * Unit tests: ExamGenerationService correctAnswer normalization
 *
 * Why these tests exist:
 * - Admin UI and grading expect MULTIPLE_CHOICE `correctAnswer` to be an index string ("0".."3").
 * - The model may return "A"/"B"/"C"/"D" or a numeric index; we must normalize consistently.
 */

import { ExamGenerationService } from '@/lib/services/exam-generation.service'
import { ExamQuestionType } from '@prisma/client'

const createMock = jest.fn()

jest.mock('openai', () => {
    return {
        __esModule: true,
        default: function OpenAI() {
            return {
                chat: {
                    completions: {
                        create: createMock,
                    },
                },
            }
        },
    }
})

describe('ExamGenerationService: MULTIPLE_CHOICE correctAnswer normalization', () => {
    beforeEach(() => {
        createMock.mockReset()
    })

    it('normalizes correctAnswer "B" into index string "1"', async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            question: 'Q?',
                            options: ['A1', 'B1', 'C1', 'D1'],
                            correctAnswer: 'B',
                            explanation: 'Because.',
                            confidence: 0.9,
                        }),
                    },
                },
            ],
            usage: { total_tokens: 123 },
        })

        const svc: any = new ExamGenerationService()
        const out = await svc.generateSingleQuestion(
            ExamQuestionType.MULTIPLE_CHOICE,
            'EASY',
            'KB_PREFIX',
            undefined,
            undefined
        )

        expect(out.question.correctAnswer).toBe('1')
        expect(out.question.options).toEqual(['A1', 'B1', 'C1', 'D1'])
    })

    it('prefers correctAnswerIndex when present', async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            question: 'Q?',
                            options: ['A1', 'B1', 'C1', 'D1'],
                            correctAnswerIndex: 2,
                            correctAnswer: 'C',
                            explanation: 'Because.',
                            confidence: 0.9,
                        }),
                    },
                },
            ],
            usage: { total_tokens: 123 },
        })

        const svc: any = new ExamGenerationService()
        const out = await svc.generateSingleQuestion(
            ExamQuestionType.MULTIPLE_CHOICE,
            'MEDIUM',
            'KB_PREFIX',
            undefined,
            undefined
        )

        expect(out.question.correctAnswer).toBe('2')
    })
})

