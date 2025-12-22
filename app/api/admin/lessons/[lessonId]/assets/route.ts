import { NextResponse } from 'next/server'

const gone = NextResponse.json(
  {
    success: false,
    error: {
      code: 'DEPRECATED',
      message: 'This endpoint has been replaced. Use /api/admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets',
    },
  },
  { status: 410 }
)

export const GET = async () => gone
export const POST = async () => gone
