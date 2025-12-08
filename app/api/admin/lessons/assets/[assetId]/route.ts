import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { LessonAssetService } from '@/lib/services/lesson-asset.service'

export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ assetId: string }> }) => {
    try {
        const { assetId } = await params
        await LessonAssetService.deleteAsset(assetId)

        return NextResponse.json({
            success: true,
            message: 'Asset deleted',
        })
    } catch (error) {
        console.error('Delete lesson asset error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to delete asset',
                },
            },
            { status: 500 }
        )
    }
})
