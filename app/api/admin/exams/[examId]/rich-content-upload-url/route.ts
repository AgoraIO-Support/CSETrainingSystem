import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { FileService } from '@/lib/services/file.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const uploadUrlSchema = z.object({
    filename: z.string().trim().min(1, 'Filename is required'),
    contentType: z.string().trim().min(1, 'Content type is required'),
})

const joinPathSegments = (...segments: (string | undefined | null)[]) =>
    segments
        .filter(Boolean)
        .map((segment) => segment!.replace(/^\/+|\/+$/g, ''))
        .filter((segment) => segment.length > 0)
        .join('/')

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedExamAccess(user, examId)
        }
        const body = await req.json()
        const data = uploadUrlSchema.parse(body)

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, status: true },
        })

        if (!exam) {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' } },
                { status: 404 }
            )
        }

        if (exam.status !== 'DRAFT') {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_004', message: 'Exam can only be modified in DRAFT status.' } },
                { status: 400 }
            )
        }

        const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const key = joinPathSegments(
            S3_ASSET_BASE_PREFIX,
            'exams',
            examId,
            'rich-content',
            `${uuidv4()}-${sanitizedFilename}`
        )

        const uploadUrl = await FileService.generatePresignedPutUrl({
            bucket: ASSET_S3_BUCKET_NAME,
            key,
            contentType: data.contentType,
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
        console.error('Generate exam rich content upload url error:', error)

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

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                { success: false, error: { code: 'AUTH_003', message: 'Insufficient permissions' } },
                { status: 403 }
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
