import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateProductDomainSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const domain = await TrainingOpsService.getDomainById(id)

        return NextResponse.json({
            success: true,
            data: domain,
        })
    } catch (error) {
        console.error('Get training-op domain error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load product domain',
                },
            },
            { status: 500 }
        )
    }
})

export const PATCH = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const body = await req.json()
        const payload = updateProductDomainSchema.parse(body)
        const domain = await TrainingOpsService.updateDomain(id, payload)

        return NextResponse.json({
            success: true,
            data: domain,
        })
    } catch (error) {
        console.error('Update training-op domain error:', error)

        const message =
            error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                ? 'Product domain no longer exists'
                : error instanceof Error && error.message === 'PRODUCT_DOMAIN_SLUG_EXISTS'
                    ? 'A product domain with this slug already exists'
                    : error instanceof Error && error.message === 'PRIMARY_SME_NOT_FOUND'
                        ? 'Primary SME must be an active user'
                        : error instanceof Error && error.message === 'BACKUP_SME_NOT_FOUND'
                            ? 'Backup SME must be an active user'
                            : 'Failed to update product domain'

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message,
                },
            },
            { status: 500 }
        )
    }
})
