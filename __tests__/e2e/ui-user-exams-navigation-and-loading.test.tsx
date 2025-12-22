/** @jest-environment jsdom */

/**
 * User UI "E2E" (JSDOM) Tests: picking up and starting assigned exams
 *
 * Why these tests exist:
 * - Users must have a clear navigation entry to find assigned exams ("My Exams").
 * - The `/exams` and `/exams/[id]` pages must tolerate the current API response shapes:
 *   - list: `{ questionCount, userStatus: {...} }`
 *   - detail: `{ questionCount, canTake }` + attempts fetched separately
 * - We keep this CI-safe by mocking ApiClient and Next router hooks.
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
import ExamsPage from '@/app/exams/page'
import ExamIntroPage from '@/app/exams/[id]/page'
import { Sidebar } from '@/components/layout/sidebar'
import { ApiClient } from '@/lib/api-client'

jest.mock('@/components/layout/dashboard-layout', () => ({
    DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/api-client', () => ({
    ApiClient: {
        getAvailableExams: jest.fn(),
        getExamDetails: jest.fn(),
        getUserExamAttempts: jest.fn(),
        getCurrentAttempt: jest.fn(),
        startExamAttempt: jest.fn(),
    },
}))

const mockedApi = ApiClient as unknown as {
    getAvailableExams: jest.Mock
    getExamDetails: jest.Mock
    getUserExamAttempts: jest.Mock
}

describe('User Exams: navigation and loading', () => {
    beforeEach(() => {
        mockedApi.getAvailableExams.mockReset()
        mockedApi.getExamDetails.mockReset()
        mockedApi.getUserExamAttempts.mockReset()
    })

    it('shows a "My Exams" link in the sidebar for USER', () => {
        render(
            <Sidebar
                user={{ id: 'u1', email: 'user@agora.io', role: 'USER' }}
            />
        )

        expect(screen.getByRole('link', { name: /My Exams/i })).toBeInTheDocument()
    })

    it('renders /exams with current API response shape (questionCount + userStatus)', async () => {
        mockedApi.getAvailableExams.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'exam-1',
                    title: 'Assigned Exam',
                    description: 'An assigned exam',
                    examType: 'COURSE_BASED',
                    status: 'PUBLISHED',
                    course: { id: 'c1', title: 'Course 1' },
                    timeLimit: null,
                    totalScore: 100,
                    passingScore: 70,
                    maxAttempts: 1,
                    randomizeQuestions: false,
                    randomizeOptions: false,
                    showResultsImmediately: true,
                    allowReview: true,
                    availableFrom: null,
                    deadline: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    questionCount: 5,
                    userStatus: {
                        completedAttempts: 0,
                        remainingAttempts: 1,
                        hasInProgressAttempt: false,
                        inProgressAttemptId: null,
                        bestScore: null,
                        hasPassed: false,
                    },
                },
            ],
        })

        render(<ExamsPage />)

        await screen.findByText('My Exams')
        await screen.findByText('Assigned Exam')

        // Regression guard: should not render NaN in stats.
        expect(screen.getByText('Total Attempts')).toBeInTheDocument()
        expect(screen.queryByText('NaN')).toBeNull()

        expect(screen.getByText(/5 questions/i)).toBeInTheDocument()
        expect(screen.getByText(/Attempts:\s*0\s*\/\s*1/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Start Exam/i })).toBeInTheDocument()
    })

    it('renders /exams/[id] without crashing when attempts are fetched separately', async () => {
        mockedApi.getExamDetails.mockResolvedValue({
            success: true,
            data: {
                id: 'exam-1',
                title: 'Assigned Exam',
                description: 'An assigned exam',
                instructions: null,
                examType: 'COURSE_BASED',
                status: 'PUBLISHED',
                course: { id: 'c1', title: 'Course 1' },
                timeLimit: null,
                totalScore: 100,
                passingScore: 70,
                maxAttempts: 1,
                randomizeQuestions: false,
                randomizeOptions: false,
                showResultsImmediately: true,
                allowReview: true,
                availableFrom: null,
                deadline: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                questionCount: 5,
                canTake: true,
                remainingAttempts: 1,
            },
        })
        mockedApi.getUserExamAttempts.mockResolvedValue({ success: true, data: [] })

        render(<ExamIntroPage params={{ id: 'exam-1' } as any} />)

        await screen.findByText('Assigned Exam')
        await screen.findByText('Questions')
        await screen.findByText('5')
        expect(screen.getByRole('button', { name: /Start Exam/i })).toBeInTheDocument()
    })
})
