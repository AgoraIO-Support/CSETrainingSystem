import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { MaterialService } from '@/lib/services/material.service'
import { FileService } from '@/lib/services/file.service'
import { LessonAssetType } from '@prisma/client'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

const assetUrl = async (asset: { id: string; type: string; s3Key?: string | null; url?: string | null }) =>
  asset.type === 'WEB_PACKAGE'
    ? `/api/assets/web-packages/${asset.id}/index.html`
    : asset.s3Key ? await FileService.getAssetAccessUrl(asset.s3Key) : asset.url

// DELETE /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets/:assetId
// Deletes the lesson-asset binding AND the underlying CourseAsset + S3 file
export const DELETE = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string; assetId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId, assetId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)

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
      url: await assetUrl(asset),
      cloudfrontUrl: asset.cloudfrontUrl,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      updatedAt: asset.updatedAt,
    })))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Delete lesson asset error:', error)
    if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete lesson asset' } },
      { status: 500 }
    )
  }
})
