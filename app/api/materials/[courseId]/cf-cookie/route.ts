import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthUser } from '@/lib/auth-middleware'
import { CloudFrontCookieService } from '@/lib/services/cloudfront-cookie.service'

// GET /api/materials/:courseId/cf-cookie
// Generates CloudFront signed cookies for enrolled users to access course materials.
export const GET = withAuth(async (req: NextRequest, user: AuthUser, { params }: { params: Promise<{ courseId: string }> }) => {
    const { courseId } = await params

    // Check if CloudFront is configured
    if (!CloudFrontCookieService.isConfigured()) {
        return NextResponse.json(
            { success: false, error: { code: 'CLOUDFRONT_NOT_CONFIGURED', message: 'CloudFront signed cookies are not configured' } },
            { status: 501 }
        )
    }

    // Check if user is enrolled in the course
    const isEnrolled = await CloudFrontCookieService.isUserEnrolled(user.id, courseId)
    if (!isEnrolled) {
        return NextResponse.json(
            { success: false, error: { code: 'NOT_ENROLLED', message: 'User is not enrolled in this course' } },
            { status: 403 }
        )
    }

    try {
        // Generate signed cookies
        const cookies = CloudFrontCookieService.generateSignedCookies(courseId)
        const cookieOptions = CloudFrontCookieService.getCookieOptions()

        // Build cookie string with options
        const buildCookieString = (name: string, value: string) => {
            const parts = [
                `${name}=${value}`,
                `Path=${cookieOptions.path}`,
                `Max-Age=${cookieOptions.maxAge}`,
                cookieOptions.httpOnly ? 'HttpOnly' : '',
                cookieOptions.secure ? 'Secure' : '',
                `SameSite=${cookieOptions.sameSite.charAt(0).toUpperCase() + cookieOptions.sameSite.slice(1)}`,
                cookieOptions.domain ? `Domain=${cookieOptions.domain}` : '',
            ].filter(Boolean)
            return parts.join('; ')
        }

        // Return 204 No Content with cookies set
        const nextRes = new NextResponse(null, { status: 204 })
        nextRes.headers.append('set-cookie', buildCookieString('CloudFront-Policy', cookies['CloudFront-Policy']))
        nextRes.headers.append('set-cookie', buildCookieString('CloudFront-Signature', cookies['CloudFront-Signature']))
        nextRes.headers.append('set-cookie', buildCookieString('CloudFront-Key-Pair-Id', cookies['CloudFront-Key-Pair-Id']))

        return nextRes
    } catch (error) {
        console.error('CloudFront cookie generation error:', error)

        if (error instanceof Error && error.message === 'CLOUDFRONT_COOKIE_GENERATION_FAILED') {
            return NextResponse.json(
                { success: false, error: { code: 'CLOUDFRONT_COOKIE_GENERATION_FAILED', message: 'Failed to generate signed cookies' } },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to generate CloudFront cookies' } },
            { status: 500 }
        )
    }
})
