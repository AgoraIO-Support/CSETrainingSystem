import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { MaterialService } from '@/lib/services/material.service'

// DELETE /api/admin/materials/:assetId - Delete a course asset (material)
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ assetId: string }> }) => {
    try {
        const { assetId } = await params

        await MaterialService.deleteMaterial(assetId)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete material error:', error)

        if (error instanceof Error && error.message === 'COURSE_ASSET_NOT_FOUND') {
            return NextResponse.json(
                { success: false, error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found' } },
                { status: 404 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete material' } },
            { status: 500 }
        )
    }
})
