import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { updateLessonSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { getBackendInternalBaseUrl, getBackendInternalBearerToken } from '@/lib/backend-internal'

// PATCH /admin/courses/:id/chapters/:chapterId/lessons/:lessonId
export const PATCH = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    const body = await req.json()
    const data = updateLessonSchema.parse(body)

    // Ensure lesson belongs to chapter and course
    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)

    const updated = await CourseStructureService.updateLesson(lessonId, data)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Update lesson error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_NOT_FOUND', message: 'Lesson not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'ASSET_COURSE_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ASSET_COURSE_MISMATCH', message: 'Asset does not belong to course' } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'ANCESTRY_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ANCESTRY_MISMATCH', message: 'Lesson does not belong to chapter/course' } },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to update lesson' } },
      { status: 500 }
    )
  }
})

// DELETE /admin/courses/:id/chapters/:chapterId/lessons/:lessonId
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params

    const backendBase = getBackendInternalBaseUrl()
    if (!backendBase) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFIG_ERROR', message: 'BACKEND_INTERNAL_URL is not configured' } },
        { status: 500 }
      )
    }

    const res = await fetch(`${backendBase}/api/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getBackendInternalBearerToken(user),
      },
    })

    if (!res.ok) {
      // backend 404 is idempotent success
      if (res.status === 404) return NextResponse.json({ success: true })
      const body = await res.json().catch(() => null)
      return NextResponse.json(body ?? { success: false, error: { code: 'BACKEND_ERROR' } }, { status: res.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete lesson error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete lesson' } },
      { status: 500 }
    )
  }
})
