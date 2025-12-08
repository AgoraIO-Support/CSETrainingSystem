import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { LessonAssetService } from '@/lib/services/lesson-asset.service'
import { LessonAssetType } from '@prisma/client'

export const GET = withAdminAuth(async (req, user, { params }: { params: Promise<{ lessonId: string }> }) => {
    try {
        const { lessonId } = await params
        const assets = await LessonAssetService.listAssets(lessonId)

        return NextResponse.json({
            success: true,
            data: assets,
        })
    } catch (error) {
        console.error('List lesson assets error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load lesson assets',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req, user, { params }: { params: Promise<{ lessonId: string }> }) => {
    try {
        const { lessonId } = await params
        const body = await req.json()
        const { title, description, url, s3Key, contentType, type } = body

        if (!title || !url || !s3Key || !type) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'title, url, s3Key, and type are required',
                    },
                },
                { status: 400 }
            )
        }

        const asset = await LessonAssetService.addAsset(lessonId, {
            title,
            description,
            url,
            s3Key,
            contentType,
            type,
        } as {
            title: string
            description?: string
            url: string
            s3Key: string
            contentType?: string
            type: LessonAssetType
        })

        return NextResponse.json(
            {
                success: true,
                data: asset,
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Create lesson asset error:', error)

        if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'LESSON_001',
                        message: 'Lesson not found',
                    },
                },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to create lesson asset',
                },
            },
            { status: 500 }
        )
    }
})
