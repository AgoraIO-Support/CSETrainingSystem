/** @jest-environment jsdom */

/**
 * Admin UI "E2E" (JSDOM) Test: Exam question generation uses selected XML knowledge contexts
 *
 * Why this test exists:
 * - Admins must be able to choose which lesson XML knowledge context(s) are used for question generation.
 * - The UI must pass `lessonIds` to the backend so generation is scoped deterministically.
 * - We keep this CI-safe by mocking ApiClient (no OpenAI/S3 required).
 */

// Jest's React runtime doesn't expose the experimental `use()` helper that Next.js
// uses to unwrap route params. For this test, we provide a minimal shim so we can
// exercise the UI logic in JSDOM deterministically.
jest.mock('react', () => {
    const actual = jest.requireActual('react')
    return {
        ...actual,
        use: (value: any) => value,
    }
})

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExamQuestionsPage from '@/app/admin/exams/[id]/questions/page'
import { ApiClient } from '@/lib/api-client'

jest.mock('@/components/layout/dashboard-layout', () => ({
    DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/lib/api-client', () => ({
    ApiClient: {
        getAdminExam: jest.fn(),
        getExamQuestions: jest.fn(),
        getExamKnowledgeContexts: jest.fn(),
        generateExamQuestions: jest.fn(),
        deleteExamQuestion: jest.fn(),
        updateExamQuestion: jest.fn(),
        createExamQuestion: jest.fn(),
        reorderExamQuestions: jest.fn(),
    },
}))

const mockedApi = ApiClient as unknown as {
    getAdminExam: jest.Mock
    getExamQuestions: jest.Mock
    getExamKnowledgeContexts: jest.Mock
    generateExamQuestions: jest.Mock
}

describe('Admin Exam Question Generation: Knowledge Context Selector', () => {
    beforeEach(() => {
        mockedApi.getAdminExam.mockReset()
        mockedApi.getExamQuestions.mockReset()
        mockedApi.getExamKnowledgeContexts.mockReset()
        mockedApi.generateExamQuestions.mockReset()
    })

    it('sends selected lessonIds when generating questions', async () => {
        mockedApi.getAdminExam.mockResolvedValue({
            success: true,
            data: {
                id: 'exam-1',
                title: 'Exam 1',
                totalScore: 100,
                status: 'DRAFT',
                examType: 'COURSE_BASED',
            },
        })
        mockedApi.getExamQuestions.mockResolvedValue({ success: true, data: [] })
        mockedApi.getExamKnowledgeContexts.mockResolvedValue({
            success: true,
            data: {
                courseId: 'course-1',
                lessons: [
                    {
                        lessonId: 'lesson-ready',
                        lessonTitle: 'Lesson Ready',
                        chapterTitle: 'Chapter 1',
                        chapterOrder: 1,
                        lessonOrder: 1,
                        knowledgeStatus: 'READY',
                        anchorCount: 3,
                        processedAt: '2025-01-01T00:00:00.000Z',
                        hasTranscript: true,
                    },
                    {
                        lessonId: 'lesson-missing',
                        lessonTitle: 'Lesson Missing',
                        chapterTitle: 'Chapter 1',
                        chapterOrder: 1,
                        lessonOrder: 2,
                        knowledgeStatus: 'MISSING',
                        anchorCount: 0,
                        processedAt: null,
                        hasTranscript: true,
                    },
                ],
            },
        })
        mockedApi.generateExamQuestions.mockResolvedValue({ success: true, data: [] })

        // Pass a plain object instead of a Promise; the `use()` shim above returns it as-is.
        render(<ExamQuestionsPage params={{ id: 'exam-1' } as any} />)

        const user = userEvent.setup()

        // Page load completes after initial exam+question fetch.
        await screen.findByText('Question Management')

        // Open the AI generation dialog (this triggers loading knowledge contexts).
        // There are two "Generate with AI" buttons when there are no questions
        // (header action + empty-state CTA). Either is fine; use the first for determinism.
        await user.click(screen.getAllByRole('button', { name: /Generate with AI/i })[0])
        await screen.findByText('Generate Questions with AI')
        await screen.findByText('Lesson knowledge contexts')

        const readyRow = await screen.findByText('Chapter 1 · Lesson Ready')
        const missingRow = await screen.findByText('Chapter 1 · Lesson Missing')

        const readyCheckbox = readyRow.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement
        const missingCheckbox = missingRow.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement

        // Default selection should include READY lessons.
        expect(readyCheckbox).toBeTruthy()
        expect(readyCheckbox.checked).toBe(true)
        expect(missingCheckbox).toBeTruthy()
        expect(missingCheckbox.checked).toBe(false)

        // Generate using the default READY selection.
        await user.click(screen.getByRole('button', { name: /Generate Questions/i }))
        expect(mockedApi.generateExamQuestions).toHaveBeenCalledTimes(1)
        expect(mockedApi.generateExamQuestions.mock.calls[0][1]).toMatchObject({
            lessonIds: ['lesson-ready'],
        })

        // Re-open and include the second lesson; the UI must pass both ids.
        await user.click(screen.getAllByRole('button', { name: /Generate with AI/i })[0])
        await screen.findByText('Lesson knowledge contexts')

        const missingRow2 = await screen.findByText('Chapter 1 · Lesson Missing')
        const missingCheckbox2 = missingRow2.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement
        await user.click(missingCheckbox2)

        await user.click(screen.getByRole('button', { name: /Generate Questions/i }))
        expect(mockedApi.generateExamQuestions).toHaveBeenCalledTimes(2)
        expect(mockedApi.generateExamQuestions.mock.calls[1][1]).toMatchObject({
            lessonIds: ['lesson-ready', 'lesson-missing'],
        })
    })
})
