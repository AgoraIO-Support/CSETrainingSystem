import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { getBackendInternalBaseUrl, getBackendInternalBearerToken } from '@/lib/backend-internal'

// DELETE /api/admin/courses/:id/chapters/:chapterId
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  let backendBase = ''
  try {
    const { id, chapterId } = await params

    backendBase = getBackendInternalBaseUrl()
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
        Authorization: getBackendInternalBearerToken(user),
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
    const hint =
      backendBase.includes('localhost') || backendBase.includes('127.0.0.1')
        ? 'If running in Podman/Docker, set BACKEND_INTERNAL_URL to the backend service name (e.g. http://cselearning-backend:8080).'
        : undefined
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BACKEND_UNREACHABLE',
          message: hint ? `Backend unreachable while deleting chapter. ${hint}` : 'Backend unreachable while deleting chapter',
        },
      },
      { status: 502 }
    )
  }
})
