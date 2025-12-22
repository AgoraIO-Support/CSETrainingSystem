import { NextResponse } from 'next/server'

const gone = NextResponse.json(
  {
    success: false,
    error: {
      code: 'DEPRECATED',
      message: 'This endpoint has been replaced. Use /api/admin/courses/:courseId/chapters/:chapterId',
    },
  },
  { status: 410 }
)

export const PATCH = async () => gone
export const DELETE = async () => gone
