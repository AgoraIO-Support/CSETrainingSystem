/**
 * Admin Certificate Reissue
 * POST /api/admin/certificates/[id]/reissue
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CertificateService } from '@/lib/services/certificate.service'

type RouteContext = {
    params: Promise<{ id: string }>
}

export const POST = withAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { id } = await context.params

        const updated = await CertificateService.reissueCertificate(id, user.id)

        return NextResponse.json({
            success: true,
            data: updated,
        })
    } catch (error) {
        console.error('Reissue certificate error:', error)

        if (error instanceof Error && error.message === 'CERT_NOT_FOUND') {
            return NextResponse.json(
                { success: false, error: { code: 'CERT_NOT_FOUND', message: 'Certificate not found' } },
                { status: 404 }
            )
        }

        if (error instanceof Error && error.message === 'BADGE_NOT_CONFIGURED') {
            return NextResponse.json(
                { success: false, error: { code: 'BADGE_NOT_CONFIGURED', message: 'Badge is not configured for this certificate' } },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'CERT_ADMIN_002', message: 'Failed to reissue certificate' } },
            { status: 500 }
        )
    }
})

