import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CascadeDeleteService } from '@/lib/services/cascade-delete.service'

// DELETE /api/admin/courses/:id/chapters/:chapterId
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  try {
    const { id: courseId, chapterId } = await params

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
