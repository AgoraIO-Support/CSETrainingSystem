import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { createLessonSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'

// GET /admin/courses/:id/chapters/:chapterId/lessons
export const GET = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  try {
    const { id: courseId, chapterId } = await params
    await CourseStructureService.assertChapterAncestry(courseId, chapterId)
    const lessons = await CourseStructureService.listLessons(chapterId)
    return NextResponse.json({ success: true, data: lessons })
  } catch (error) {
    console.error('List lessons error:', error)
    if (error instanceof Error && error.message === 'CHAPTER_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'ANCESTRY_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ANCESTRY_MISMATCH', message: 'Chapter does not belong to course' } },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to list lessons' } },
      { status: 500 }
    )
  }
})

// POST /admin/courses/:id/chapters/:chapterId/lessons
export const POST = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  try {
    const { id: courseId, chapterId } = await params
    const body = await req.json()
    const data = createLessonSchema.parse(body)

    // Ensure chapter belongs to course
    await CourseStructureService.assertChapterAncestry(courseId, chapterId)

    const lesson = await CourseStructureService.createLesson(chapterId, data)
    return NextResponse.json({ success: true, data: lesson }, { status: 201 })
  } catch (error) {
    console.error('Create lesson error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'CHAPTER_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'ANCESTRY_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ANCESTRY_MISMATCH', message: 'Chapter does not belong to course' } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'ASSET_COURSE_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ASSET_COURSE_MISMATCH', message: 'Asset does not belong to course' } },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to create lesson' } },
      { status: 500 }
    )
  }
})
