import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { ExamAttemptService } from '@/lib/services/exam-attempt.service'
import { FileService } from '@/lib/services/file.service'
import { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'

type RouteContext = {
    params: Promise<{ examId: string; attemptId: string }>
}

const uploadUrlSchema = z.object({
    questionId: z.string().uuid(),
    filename: z.string().trim().min(1, 'Filename is required'),
    contentType: z.string().trim().min(1, 'Content type is required'),
})

const joinPathSegments = (...segments: Array<string | null | undefined>) =>
    segments
        .filter(Boolean)
        .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/')

export const POST = withAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId, attemptId } = await context.params
        const body = await req.json()
        const { questionId, filename, contentType } = uploadUrlSchema.parse(body)

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

        const snapshotQuestion = await prisma.examAttemptQuestionSnapshot.findFirst({
            where: { attemptId, questionId, examId },
            select: { questionId: true, type: true },
        })
        const question =
            snapshotQuestion ??
            (await prisma.examQuestion.findFirst({
                where: { id: questionId, examId },
                select: { id: true, type: true },
            }))

        if (!question) {
            return NextResponse.json(
                { success: false, error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found' } },
                { status: 404 }
            )
        }

        if (question.type !== 'ESSAY') {
            return NextResponse.json(
                { success: false, error: { code: 'NOT_ESSAY_QUESTION', message: 'Question is not an essay question' } },
                { status: 400 }
            )
        }

        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const key = joinPathSegments(
            S3_ASSET_BASE_PREFIX,
            'exam-attempts',
            examId,
            attemptId,
            questionId,
            'rich-content',
            `${uuidv4()}-${sanitizedFilename}`
        )

        const uploadUrl = await FileService.generatePresignedPutUrl({
            bucket: ASSET_S3_BUCKET_NAME,
            key,
            contentType,
            expiresInSeconds: 60 * 30,
        })

        const accessUrl = await FileService.getAssetAccessUrl(key)

        return NextResponse.json({
            success: true,
            data: {
                uploadUrl,
                key,
                bucket: ASSET_S3_BUCKET_NAME,
                accessUrl,
                expiresIn: 60 * 30,
            },
        })
    } catch (error) {
        console.error('Create exam rich content upload URL error:', error)

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
            { success: false, error: { code: 'EXAM_RICH_CONTENT_UPLOAD_001', message: 'Failed to create upload URL' } },
            { status: 500 }
        )
    }
})
