import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseAssetService } from '@/lib/services/course-asset.service'
import { Prisma } from '@prisma/client'

export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ assetId: string }> }) => {
    try {
        const { assetId } = await params
        await CourseAssetService.deleteAsset(assetId)

        return NextResponse.json({
            success: true,
            message: 'Asset deleted successfully',
        })
    } catch (error) {
        console.error('Delete course asset error:', error)

        if (
            (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') ||
            (error instanceof Error && error.message === 'COURSE_ASSET_NOT_FOUND')
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'ASSET_001',
                        message: 'Asset not found',
                    },
                },
                { status: 404 }
            )
        }

        if (error instanceof Error && error.message === 'COURSE_ASSET_FILE_DELETE_FAILED') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'ASSET_002',
                        message: 'Failed to delete file from storage. Please try again.',
                    },
                },
                { status: 502 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to delete course asset',
                },
            },
            { status: 500 }
        )
    }
})
