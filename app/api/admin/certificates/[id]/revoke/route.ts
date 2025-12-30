/**
 * Admin Certificate Revoke
 * POST /api/admin/certificates/[id]/revoke
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

        const updated = await CertificateService.revokeCertificate(id, user.id)

        return NextResponse.json({
            success: true,
            data: updated,
        })
    } catch (error) {
        console.error('Revoke certificate error:', error)

        if (error instanceof Error && error.message === 'CERT_NOT_FOUND') {
            return NextResponse.json(
                { success: false, error: { code: 'CERT_NOT_FOUND', message: 'Certificate not found' } },
                { status: 404 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'CERT_ADMIN_001', message: 'Failed to revoke certificate' } },
            { status: 500 }
        )
    }
})

