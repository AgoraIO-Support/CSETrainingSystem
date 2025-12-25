import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'

// DELETE /api/admin/courses/:id/chapters/:chapterId
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  try {
    const { id, chapterId } = await params

    const backendBase = (process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '')
    if (!backendBase) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFIG_ERROR', message: 'BACKEND_INTERNAL_URL is not configured' } },
        { status: 500 }
      )
    }

    const res = await fetch(`${backendBase}/api/admin/courses/${id}/chapters/${chapterId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        // forward bearer token if present
        ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization') as string } : {}),
      },
    })

    if (!res.ok) {
      // 后端返回 404 视为幂等删除成功
      if (res.status === 404) {
        return NextResponse.json({ success: true })
      }
      const body = await res.json().catch(() => null)
      return NextResponse.json(body ?? { success: false, error: { code: 'BACKEND_ERROR' } }, { status: res.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Chapter delete proxy error:', error)
    // 后端不可达（如 ECONNREFUSED/超时）不得返回假成功，返回 502 以避免 DB/S3 漂移
    return NextResponse.json(
      { success: false, error: { code: 'BACKEND_UNREACHABLE', message: 'Backend unreachable while deleting chapter' } },
      { status: 502 }
    )
  }
})
