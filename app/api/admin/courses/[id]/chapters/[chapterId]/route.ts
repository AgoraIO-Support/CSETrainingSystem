import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { CascadeDeleteService } from '@/lib/services/cascade-delete.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

// DELETE /api/admin/courses/:id/chapters/:chapterId
export const DELETE = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  try {
    const { id: courseId, chapterId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)

    // Validate hierarchy: chapter belongs to course
    const isValid = await CascadeDeleteService.validateChapterHierarchy(courseId, chapterId)
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: { code: 'HIERARCHY_MISMATCH', message: 'Chapter does not belong to course' } },
        { status: 409 }
      )
    }

    await CascadeDeleteService.deleteChapterCascade(chapterId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Chapter delete error:', error)

    if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
        { status: 403 }
      )
    }

    // S3 cleanup failure returns 502 to indicate partial failure
    if (error instanceof Error && error.message.startsWith('S3_CLEANUP_FAILED')) {
      return NextResponse.json(
        { success: false, error: { code: 'S3_CLEANUP_FAILED', message: error.message } },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete chapter' } },
      { status: 500 }
    )
  }
})
