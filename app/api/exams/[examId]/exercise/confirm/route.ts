/**
 * Exercise Recording Confirm Route
 * POST /api/exams/[examId]/exercise/confirm - Verify uploaded WebM exists and finalize answer
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { ExamAttemptService } from '@/lib/services/exam-attempt.service'
import s3Client, { ASSET_S3_BUCKET_NAME } from '@/lib/aws-s3'
import { HeadObjectCommand } from '@aws-sdk/client-s3'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const confirmExerciseUploadSchema = z.object({
    attemptId: z.string().uuid(),
    questionId: z.string().uuid(),
    durationSeconds: z.number().int().positive().max(60 * 60 * 6).optional(), // clamp to 6h
})

export const POST = withAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const body = await req.json()
        const { attemptId, questionId, durationSeconds } = confirmExerciseUploadSchema.parse(body)

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

        const answer = await prisma.examAnswer.findUnique({
            where: { attemptId_questionId: { attemptId, questionId } },
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

        if (!answer.recordingS3Key) {
            return NextResponse.json(
                { success: false, error: { code: 'MISSING_S3_KEY', message: 'Missing recording key' } },
                { status: 400 }
            )
        }

        // Verify the object exists in S3 and is WebM.
        const head = await s3Client.send(
            new HeadObjectCommand({
                Bucket: ASSET_S3_BUCKET_NAME,
                Key: answer.recordingS3Key,
            })
        )

        const contentType = head.ContentType || ''
        if (!contentType.toLowerCase().startsWith('video/webm')) {
            await prisma.examAnswer.update({
                where: { id: answer.id },
                data: { recordingStatus: 'FAILED' },
            })
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_CONTENT_TYPE', message: 'Only video/webm is accepted' } },
                { status: 400 }
            )
        }

        const sizeBytes = typeof head.ContentLength === 'number' ? head.ContentLength : null

        await prisma.examAnswer.update({
            where: { id: answer.id },
            data: {
                recordingStatus: 'UPLOADED',
                recordingMimeType: contentType,
                recordingSizeBytes: sizeBytes ?? undefined,
                recordingDurationSeconds: durationSeconds ?? undefined,
                answeredAt: new Date(),
            },
        })

        await prisma.examAttempt.update({
            where: { id: attemptId },
            data: { lastSavedAt: new Date() },
        })

        return NextResponse.json({
            success: true,
            data: {
                answerId: answer.id,
                recordingS3Key: answer.recordingS3Key,
                bucket: ASSET_S3_BUCKET_NAME,
                recordingMimeType: contentType,
                recordingSizeBytes: sizeBytes,
            },
        })
    } catch (error) {
        console.error('Confirm exercise upload error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.errors },
                },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'EXERCISE_UPLOAD_002', message: 'Failed to confirm upload' } },
            { status: 500 }
        )
    }
})
