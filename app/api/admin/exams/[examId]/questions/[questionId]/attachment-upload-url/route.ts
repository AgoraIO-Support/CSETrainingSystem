import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { FileService } from '@/lib/services/file.service'
import { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

type RouteContext = {
    params: Promise<{ examId: string; questionId: string }>
}

const uploadUrlSchema = z.object({
    filename: z.string().min(1),
    contentType: z.string().min(1).refine(
        (value) => value.startsWith('application/') || value.startsWith('text/'),
        'Only document uploads are supported'
    ),
})

const joinPathSegments = (...segments: (string | undefined | null)[]) =>
    segments
        .filter(Boolean)
        .map((segment) => segment!.replace(/^\/+|\/+$/g, ''))
        .filter((segment) => segment.length > 0)
        .join('/')

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId, questionId } = await context.params
        const body = await req.json()
        const data = uploadUrlSchema.parse(body)

        const question = await prisma.examQuestion.findFirst({
            where: {
                id: questionId,
                examId,
                archivedAt: null,
            },
            select: {
                id: true,
                type: true,
                exam: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
            },
        })

        if (!question) {
            return NextResponse.json(
                { success: false, error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found' } },
                { status: 404 }
            )
        }

        if (question.exam.status !== 'DRAFT') {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_004', message: 'Exam can only be modified in DRAFT status.' } },
                { status: 400 }
            )
        }

        if (question.type !== 'ESSAY') {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_014', message: 'Only essay questions support document attachments.' } },
                { status: 400 }
            )
        }

        const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const key = joinPathSegments(
            S3_ASSET_BASE_PREFIX,
            'exams',
            examId,
            'questions',
            questionId,
            `${uuidv4()}-${sanitizedFilename}`
        )

        const uploadUrl = await FileService.generatePresignedPutUrl({
            bucket: ASSET_S3_BUCKET_NAME,
            key,
            contentType: data.contentType,
            expiresInSeconds: 60 * 30,
        })

        const publicUrl = FileService.getAssetPublicUrl(key)
        const accessUrl = await FileService.getAssetAccessUrl(key)

        return NextResponse.json({
            success: true,
            data: {
                uploadUrl,
                key,
                bucket: ASSET_S3_BUCKET_NAME,
                publicUrl,
                accessUrl,
                expiresIn: 60 * 30,
            },
        })
    } catch (error) {
        console.error('Generate exam question attachment upload url error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input data',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'EXAM_001',
                    message: 'Failed to generate upload url',
                },
            },
            { status: 500 }
        )
    }
})
