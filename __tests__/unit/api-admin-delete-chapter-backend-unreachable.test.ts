import { NextResponse } from 'next/server'

jest.mock('@/lib/auth-middleware', () => ({
  withAdminAuth:
    (handler: any) =>
    async (req: any, context: any) =>
      handler(req, { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }, context),
}))

jest.mock('@/lib/backend-internal', () => ({
  getBackendInternalBaseUrl: () => 'http://localhost:8080',
  getBackendInternalBearerToken: () => 'Bearer test',
}))

describe('API DELETE /api/admin/courses/:id/chapters/:chapterId', () => {
  beforeEach(() => {
    ;(global as any).fetch = jest.fn()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    ;(console.error as any).mockRestore?.()
  })

  it('returns 502 when backend is unreachable (fetch throws)', async () => {
    ;(global as any).fetch.mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))

    const { DELETE } = await import('@/app/api/admin/courses/[id]/chapters/[chapterId]/route')

    const res = (await DELETE(
      { method: 'DELETE', url: 'http://localhost/api/admin/courses/c1/chapters/ch1', headers: new Headers() } as any,
      { params: Promise.resolve({ id: 'c1', chapterId: 'ch1' }) } as any
    )) as NextResponse

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe('BACKEND_UNREACHABLE')
    expect(String(json.error.message)).toMatch(/BACKEND_INTERNAL_URL|cselearning-backend|Podman|Docker|backend/i)
  })
})
