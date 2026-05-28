import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseAssetService } from '@/lib/services/course-asset.service'
import { FileService } from '@/lib/services/file.service'
import { createCourseAssetSchema } from '@/lib/validations'
import { z } from 'zod'

const assetUrl = async (asset: { id: string; type: string; s3Key?: string | null; url: string }) =>
    asset.type === 'WEB_PACKAGE'
        ? `/api/assets/web-packages/${asset.id}/index.html`
        : asset.s3Key ? await FileService.getAssetAccessUrl(asset.s3Key) : asset.url

export const GET = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const assets = await CourseAssetService.listAssets(id)

        return NextResponse.json({
            success: true,
            data: await Promise.all(
                assets.map(async (asset) => ({
                    ...asset,
                    url: await assetUrl(asset),
                    cloudfrontUrl: null,
                }))
            ),
        })
    } catch (error) {
        console.error('List course assets error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load course assets',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = createCourseAssetSchema.parse(body)

        const asset = await CourseAssetService.addAsset(id, data)

        return NextResponse.json(
            {
                success: true,
                data: asset,
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Create course asset error:', error)

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

        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_001',
                        message: 'Course not found',
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
                    message: 'Failed to save course asset',
                },
            },
            { status: 500 }
        )
    }
})
