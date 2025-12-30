/**
 * Exercise Recording Upload URL Route
 * POST /api/exams/[examId]/exercise/upload-url - Create a presigned PUT URL for WebM uploads
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { ExamAttemptService } from '@/lib/services/exam-attempt.service'
import { FileService } from '@/lib/services/file.service'
import { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const createExerciseUploadUrlSchema = z.object({
    attemptId: z.string().uuid(),
    questionId: z.string().uuid(),
})

const joinPath = (...segments: Array<string | null | undefined>) =>
    segments
        .filter(Boolean)
        .map(s => String(s).replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/')

export const POST = withAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const body = await req.json()
        const { attemptId, questionId } = createExerciseUploadUrlSchema.parse(body)

        // Verify current attempt belongs to this user + exam (and is IN_PROGRESS).
        const currentAttempt = await ExamAttemptService.getCurrentAttempt(user.id, examId)
        if (!currentAttempt || currentAttempt.attemptId !== attemptId) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'INVALID_ATTEMPT', message: 'Invalid or expired attempt' },
                },
                { status: 400 }
            )
        }

        const question = await prisma.examQuestion.findFirst({
            where: { id: questionId, examId },
            select: { id: true, type: true },
        })
        if (!question) {
            return NextResponse.json(
                { success: false, error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found' } },
                { status: 404 }
            )
        }
        if (question.type !== 'EXERCISE') {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_EXERCISE_QUESTION', message: 'Question is not an exercise' } },
                { status: 400 }
            )
        }

        // We only accept WebM (per requirement).
        const mimeType = 'video/webm'
        const key = joinPath(
            S3_ASSET_BASE_PREFIX,
            'exam-attempts',
            examId,
            attemptId,
            questionId,
            `${uuidv4()}.webm`
        )

        const uploadUrl = await FileService.generatePresignedPutUrl({
            key,
            contentType: mimeType,
            expiresInSeconds: 60 * 30,
        })

        await prisma.examAnswer.upsert({
            where: {
                attemptId_questionId: { attemptId, questionId },
            },
            create: {
                attemptId,
                questionId,
                answer: null,
                selectedOption: null,
                recordingS3Key: key,
                recordingMimeType: mimeType,
                recordingStatus: 'PENDING_UPLOAD',
            },
            update: {
                answer: null,
                selectedOption: null,
                recordingS3Key: key,
                recordingMimeType: mimeType,
                recordingStatus: 'PENDING_UPLOAD',
                answeredAt: null,
            },
        })

        return NextResponse.json({
            success: true,
            data: {
                uploadUrl,
                key,
                bucket: ASSET_S3_BUCKET_NAME,
                contentType: mimeType,
                expiresIn: 60 * 30,
            },
        })
    } catch (error) {
        console.error('Create exercise upload URL error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid request body',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'EXERCISE_UPLOAD_001', message: 'Failed to create upload URL' } },
            { status: 500 }
        )
    }
})
