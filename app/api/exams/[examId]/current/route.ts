/**
 * User Exam Current Attempt Route
 * GET /api/exams/[examId]/current - Get current in-progress attempt (if any)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { ExamAttemptService } from '@/lib/services/exam-attempt.service'

type RouteContext = {
    params: Promise<{ examId: string }>
}

export const GET = withAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const attempt = await ExamAttemptService.getCurrentAttempt(user.id, examId)

        return NextResponse.json({
            success: true,
            data: attempt,
        })
    } catch (error) {
        console.error('Get current attempt error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'EXAM_001',
                    message: 'Failed to get current attempt',
                },
            },
            { status: 500 }
        )
    }
})

