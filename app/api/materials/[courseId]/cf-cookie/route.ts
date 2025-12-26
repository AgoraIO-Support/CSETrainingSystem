import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { getBackendInternalBaseUrl, getBackendInternalBearerToken } from '@/lib/backend-internal'

// GET /api/materials/:courseId/cf-cookie
// Proxies the backend signed-cookie endpoint so the browser never talks to the backend directly.
export const GET = withAuth(async (req: NextRequest, _user, { params }: { params: Promise<{ courseId: string }> }) => {
    const { courseId } = await params

    const backendBase = getBackendInternalBaseUrl()
    if (!backendBase) {
        return NextResponse.json(
            { success: false, error: { code: 'CONFIG_ERROR', message: 'BACKEND_INTERNAL_URL is not configured' } },
            { status: 500 }
        )
    }

    const res = await fetch(`${backendBase}/api/materials/${courseId}/cf-cookie`, {
        method: 'GET',
        headers: { Authorization: getBackendInternalBearerToken(_user) },
        // Backend returns 204 with Set-Cookie headers.
        redirect: 'manual',
    })

    const nextRes = new NextResponse(null, { status: res.status })

    // Node/undici supports `getSetCookie()` for retrieving multiple Set-Cookie headers.
    const getSetCookie = (res.headers as any).getSetCookie as undefined | (() => string[])
    const setCookies = getSetCookie ? getSetCookie.call(res.headers) : []
    for (const cookie of setCookies) {
        nextRes.headers.append('set-cookie', cookie)
    }

    return nextRes
})
