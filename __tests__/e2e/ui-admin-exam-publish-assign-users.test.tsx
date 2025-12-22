/** @jest-environment jsdom */

/**
 * Admin UI "E2E" (JSDOM) Test: Publish + Assign Users workflow
 *
 * Why this test exists:
 * - Publishing MUST require explicit selection from existing users (no implicit assignment).
 * - When exam is APPROVED, the invitations page becomes "Publish & Assign Users" and calls
 *   `ApiClient.publishExam(examId, { userIds, sendEmail })`.
 * - After publishing, the UI should refresh and show the standard invitation management view.
 *
 * Notes:
 * - We keep this CI-safe by mocking ApiClient (no DB/email dependencies).
 * - Next.js route params are unwrapped via `use()` in this page; Jest needs a shim.
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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExamInvitationsPage from '@/app/admin/exams/[id]/invitations/page'
import { ApiClient } from '@/lib/api-client'

jest.mock('@/components/layout/dashboard-layout', () => ({
    DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/lib/api-client', () => ({
    ApiClient: {
        getAdminExam: jest.fn(),
        getExamInvitations: jest.fn(),
        getUsers: jest.fn(),
        publishExam: jest.fn(),
        createExamInvitations: jest.fn(),
        sendExamInvitationEmails: jest.fn(),
    },
}))

const mockedApi = ApiClient as unknown as {
    getAdminExam: jest.Mock
    getExamInvitations: jest.Mock
    getUsers: jest.Mock
    publishExam: jest.Mock
    createExamInvitations: jest.Mock
}

describe('Admin Invitations: Publish & Assign Users', () => {
    beforeEach(() => {
        mockedApi.getAdminExam.mockReset()
        mockedApi.getExamInvitations.mockReset()
        mockedApi.getUsers.mockReset()
        mockedApi.publishExam.mockReset()
        mockedApi.createExamInvitations.mockReset()
    })

    it('publishes an APPROVED exam using explicitly selected userIds', async () => {
        // First load: exam is APPROVED (publish state).
        mockedApi.getAdminExam.mockResolvedValueOnce({
            success: true,
            data: {
                id: 'exam-publish-1',
                title: 'Publish Test Exam',
                totalScore: 20,
                status: 'APPROVED',
                examType: 'COURSE_BASED',
            },
        })
        mockedApi.getExamInvitations.mockResolvedValueOnce({ success: true, data: [] })
        mockedApi.getUsers.mockResolvedValueOnce({
            success: true,
            data: {
                users: [
                    { id: 'u1', name: 'Test User', email: 'user@agora.io', department: 'CSE' },
                    { id: 'u2', name: 'Admin User', email: 'admin@agora.io', department: 'IT' },
                ],
            },
        })

        // After publish, `loadData()` is called again; return PUBLISHED + one invitation.
        mockedApi.getAdminExam.mockResolvedValueOnce({
            success: true,
            data: {
                id: 'exam-publish-1',
                title: 'Publish Test Exam',
                totalScore: 20,
                status: 'PUBLISHED',
                examType: 'COURSE_BASED',
            },
        })
        mockedApi.getExamInvitations.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: 'inv-1',
                    examId: 'exam-publish-1',
                    userId: 'u1',
                    user: { id: 'u1', name: 'Test User', email: 'user@agora.io', department: 'CSE' },
                    emailSent: false,
                    viewed: false,
                    started: false,
                    completed: false,
                    score: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ],
        })
        mockedApi.getUsers.mockResolvedValueOnce({
            success: true,
            data: { users: [{ id: 'u2', name: 'Admin User', email: 'admin@agora.io', department: 'IT' }] },
        })

        mockedApi.publishExam.mockResolvedValue({
            success: true,
            data: { id: 'exam-publish-1', status: 'PUBLISHED' },
            meta: { invited: 1, emailsSent: 0, emailsFailed: 0, skipped: 0 },
        })

        render(<ExamInvitationsPage params={{ id: 'exam-publish-1' } as any} />)
        const user = userEvent.setup()

        await screen.findByText('Manage Invitations')
        await screen.findByText('Publish & Assign Users')

        // Explicitly select a user row.
        // (The row is clickable; we avoid relying on fragile checkbox DOM ancestry.)
        const row = await screen.findByText('Test User')
        await user.click(row)

        // Publish should be possible once there is at least one selected user.
        const publishButton = await screen.findByRole('button', { name: /Publish Exam/i })
        await user.click(publishButton)

        expect(mockedApi.publishExam).toHaveBeenCalledTimes(1)
        expect(mockedApi.publishExam.mock.calls[0][0]).toBe('exam-publish-1')
        expect(mockedApi.publishExam.mock.calls[0][1]).toMatchObject({
            userIds: ['u1'],
            sendEmail: false,
        })

        // UI refresh should switch to the published view and show invitation list.
        await screen.findByText('Invite Users')
        await screen.findByText('Current Invitations (1)')
        await screen.findByText('Email pending')

        // In the published view, the invited user should no longer appear in the selectable user list,
        // so their name should only appear once (in the invitations list).
        expect(screen.getAllByText('Test User')).toHaveLength(1)
    })
})
