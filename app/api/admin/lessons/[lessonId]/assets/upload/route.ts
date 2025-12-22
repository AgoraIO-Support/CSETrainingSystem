import { NextResponse } from 'next/server'

const gone = NextResponse.json(
  {
    success: false,
    error: {
      code: 'DEPRECATED',
      message: 'This endpoint has been replaced. Use /api/admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets/upload',
    },
  },
  { status: 410 }
)

export const POST = async () => gone
