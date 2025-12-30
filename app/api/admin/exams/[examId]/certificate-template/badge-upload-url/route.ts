/**
 * Admin Exam Certificate Badge Upload URL
 * POST /api/admin/exams/[examId]/certificate-template/badge-upload-url
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { FileService } from '@/lib/services/file.service'
import { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const uploadUrlSchema = z.object({
    filename: z.string().min(1),
    contentType: z.enum(['image/png', 'image/jpeg']),
})

const joinPathSegments = (...segments: (string | undefined | null)[]) => {
    return segments
        .filter(Boolean)
        .map(segment => segment!.replace(/^\/+|\/+$/g, ''))
        .filter(segment => segment.length > 0)
        .join('/')
}

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const body = await req.json()
        const data = uploadUrlSchema.parse(body)

        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } })
        if (!exam) {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' } },
                { status: 404 }
            )
        }

        const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const key = joinPathSegments(
            S3_ASSET_BASE_PREFIX,
            'certificates',
            'badges',
            examId,
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
        console.error('Generate badge upload url error:', error)

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
                    code: 'CERT_TEMPLATE_003',
                    message: 'Failed to generate upload url',
                },
            },
            { status: 500 }
        )
    }
})
