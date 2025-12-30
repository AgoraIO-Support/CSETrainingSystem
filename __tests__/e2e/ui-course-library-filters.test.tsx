/** @jest-environment jsdom */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoursesPage from '@/app/courses/page'
import { ApiClient } from '@/lib/api-client'

jest.mock('@/components/layout/dashboard-layout', () => ({
    DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('@/lib/api-client', () => ({
    ApiClient: {
        getCourses: jest.fn(),
        getMe: jest.fn(),
        getAdminCourseAnalytics: jest.fn(),
    },
}))

const mockedApi = ApiClient as unknown as {
    getCourses: jest.Mock
    getMe: jest.Mock
}

describe('Course Library: filters', () => {
    beforeEach(() => {
        mockedApi.getCourses.mockReset()
        mockedApi.getMe.mockReset()
    })

    it('filters by search query (title, instructor, tags) and category selection', async () => {
        mockedApi.getMe.mockResolvedValue({
            success: true,
            data: { id: 'u1', email: 'user@agora.io', role: 'USER' },
        })

        mockedApi.getCourses.mockResolvedValue({
            success: true,
            data: {
                courses: [
                    {
                        id: 'c1',
                        title: 'Messaging Basics',
                        description: 'Learn chat SDK',
                        instructor: { id: 'i1', name: 'Alice', avatar: null, title: null },
                        thumbnail: '',
                        duration: 3600,
                        level: 'BEGINNER',
                        category: 'Messaging',
                        rating: 4.2,
                        reviewCount: 0,
                        enrolledCount: 12,
                        tags: ['sdk', 'chat'],
                    },
                    {
                        id: 'c2',
                        title: 'Video Calling 101',
                        description: 'WebRTC intro',
                        instructor: { id: 'i2', name: 'Bob', avatar: null, title: null },
                        thumbnail: '',
                        duration: 5400,
                        level: 'INTERMEDIATE',
                        category: 'Video Solutions',
                        rating: 4.8,
                        reviewCount: 0,
                        enrolledCount: 4,
                        tags: ['webrtc', 'video'],
                    },
                    {
                        id: 'c3',
                        title: 'Advanced SDK Integration',
                        description: 'Deep dive into integration patterns',
                        instructor: { id: 'i1', name: 'Alice', avatar: null, title: null },
                        thumbnail: '',
                        duration: 7200,
                        level: 'ADVANCED',
                        category: 'SDK Integration',
                        rating: 4.6,
                        reviewCount: 0,
                        enrolledCount: 1,
                        tags: ['sdk', 'advanced'],
                    },
                ],
                pagination: { page: 1, limit: 200, total: 3, totalPages: 1 },
            },
        })

        render(<CoursesPage />)

        await screen.findByText('Messaging Basics')
        expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
        expect(screen.getByText('Advanced SDK Integration')).toBeInTheDocument()

        const user = userEvent.setup()

        // Search by instructor
        const searchInput = screen.getByPlaceholderText(/Search courses by title, instructor, or keywords/i)
        await user.clear(searchInput)
        await user.type(searchInput, 'alice')

        await waitFor(() => {
            expect(screen.getByText('Messaging Basics')).toBeInTheDocument()
            expect(screen.getByText('Advanced SDK Integration')).toBeInTheDocument()
            expect(screen.queryByText('Video Calling 101')).toBeNull()
        })

        // Clear search
        await user.click(screen.getByRole('button', { name: /Clear search/i }))
        await waitFor(() => {
            expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
        })

        // Search by tag keyword
        await user.type(searchInput, 'webrtc')
        await waitFor(() => {
            expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
            expect(screen.queryByText('Messaging Basics')).toBeNull()
            expect(screen.queryByText('Advanced SDK Integration')).toBeNull()
        })

        // Clear search before category-only assertions
        await user.click(screen.getByRole('button', { name: /Clear search/i }))
        await waitFor(() => {
            expect(screen.getByText('Messaging Basics')).toBeInTheDocument()
            expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
            expect(screen.getByText('Advanced SDK Integration')).toBeInTheDocument()
        })

        // Category filter
        await user.click(screen.getByRole('button', { name: 'Video Solutions' }))
        await waitFor(() => {
            expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
            expect(screen.queryByText('Messaging Basics')).toBeNull()
            expect(screen.queryByText('Advanced SDK Integration')).toBeNull()
        })

        // Switch to another category should update results
        await user.click(screen.getByRole('button', { name: 'Messaging' }))
        await waitFor(() => {
            expect(screen.queryByText('Video Calling 101')).toBeNull()
            expect(screen.getByText('Messaging Basics')).toBeInTheDocument()
        })

        // Clicking the same category again toggles back to All (no category filter)
        await user.click(screen.getByRole('button', { name: 'Messaging' }))
        await waitFor(() => {
            expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
            expect(screen.getByText('Messaging Basics')).toBeInTheDocument()
            expect(screen.getByText('Advanced SDK Integration')).toBeInTheDocument()
        })

        // Level filter (uses UI labels)
        await user.click(screen.getByRole('button', { name: 'Beginner' }))
        await waitFor(() => {
            expect(screen.getByText('Messaging Basics')).toBeInTheDocument()
            expect(screen.queryByText('Video Calling 101')).toBeNull()
            expect(screen.queryByText('Advanced SDK Integration')).toBeNull()
        })

        await user.click(screen.getByRole('button', { name: 'Advanced' }))
        await waitFor(() => {
            expect(screen.getByText('Advanced SDK Integration')).toBeInTheDocument()
            expect(screen.queryByText('Messaging Basics')).toBeNull()
            expect(screen.queryByText('Video Calling 101')).toBeNull()
        })

        // Clicking same level again toggles back to All Levels
        await user.click(screen.getByRole('button', { name: 'Advanced' }))
        await waitFor(() => {
            expect(screen.getByText('Video Calling 101')).toBeInTheDocument()
            expect(screen.getByText('Messaging Basics')).toBeInTheDocument()
            expect(screen.getByText('Advanced SDK Integration')).toBeInTheDocument()
        })
    })
})
