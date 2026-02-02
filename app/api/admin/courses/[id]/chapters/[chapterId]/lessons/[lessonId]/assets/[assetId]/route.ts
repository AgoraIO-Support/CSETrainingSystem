import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { MaterialService } from '@/lib/services/material.service'
import { FileService } from '@/lib/services/file.service'
import { LessonAssetType } from '@prisma/client'

// DELETE /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets/:assetId
// Deletes the lesson-asset binding AND the underlying CourseAsset + S3 file
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string; assetId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId, assetId } = await params

    // Validate hierarchy
    const valid = await MaterialService.validateHierarchy({ courseId, chapterId, lessonId, assetId })
    if (!valid.ok) {
      return NextResponse.json(
        { success: false, error: { code: 'HIERARCHY_MISMATCH', message: valid.message } },
        { status: 409 }
      )
    }

    // Delete lesson asset binding, course asset, and S3 file; returns updated asset list
    const assets = await MaterialService.deleteLessonAsset(lessonId, assetId)

    // Transform assets to include access URLs
    const data = await Promise.all(assets.map(async (asset) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type as LessonAssetType,
      url: asset.s3Key ? await FileService.getAssetAccessUrl(asset.s3Key) : asset.url,
      cloudfrontUrl: asset.cloudfrontUrl,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      updatedAt: asset.updatedAt,
    })))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Delete lesson asset error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete lesson asset' } },
      { status: 500 }
    )
  }
})
