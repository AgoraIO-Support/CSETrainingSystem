/**
 * Exercise Recording Access URL Route
 * GET /api/exams/[examId]/exercise/access-url - Get a time-limited URL to view the uploaded WebM
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { FileService } from '@/lib/services/file.service'
import { z } from 'zod'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const querySchema = z.object({
    attemptId: z.string().uuid(),
    questionId: z.string().uuid(),
})

export const GET = withAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const { searchParams } = new URL(req.url)
        const parsed = querySchema.parse({
            attemptId: searchParams.get('attemptId'),
            questionId: searchParams.get('questionId'),
        })

        const attempt = await prisma.examAttempt.findFirst({
            where: { id: parsed.attemptId, examId, userId: user.id },
            select: { id: true },
        })
        if (!attempt) {
            return NextResponse.json(
                { success: false, error: { code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' } },
                { status: 404 }
            )
        }

        const answer = await prisma.examAnswer.findUnique({
            where: { attemptId_questionId: { attemptId: parsed.attemptId, questionId: parsed.questionId } },
            include: { question: { select: { type: true, examId: true } } },
        })
        if (!answer || answer.question.examId !== examId) {
            return NextResponse.json(
                { success: false, error: { code: 'ANSWER_NOT_FOUND', message: 'Answer not found' } },
                { status: 404 }
            )
        }
        if (answer.question.type !== 'EXERCISE') {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_EXERCISE_QUESTION', message: 'Question is not an exercise' } },
                { status: 400 }
            )
        }
        if (answer.recordingStatus !== 'UPLOADED' || !answer.recordingS3Key) {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_UPLOADED', message: 'Recording not uploaded yet' } },
                { status: 400 }
            )
        }

        const url = await FileService.getAssetAccessUrl(answer.recordingS3Key)

        return NextResponse.json({
            success: true,
            data: { url },
        })
    } catch (error) {
        console.error('Get exercise access URL error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: error.errors } },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'EXERCISE_UPLOAD_003', message: 'Failed to generate access URL' } },
            { status: 500 }
        )
    }
})

