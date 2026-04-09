import { NextRequest, NextResponse } from 'next/server'
import { ProductDomainCategory, ProductTrack } from '@prisma/client'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createProductDomainSchema } from '@/lib/validations'

const parseCategory = (value: string | null): ProductDomainCategory | undefined => {
    if (value === 'RTE' || value === 'AI') {
        return value
    }
    return undefined
}

const parseTrack = (value: string | null): ProductTrack | undefined => {
    if (value === 'AGILE' || value === 'MASTERY' || value === 'RELEASE' || value === 'FINAL') {
        return value
    }
    return undefined
}

const parseBooleanParam = (value: string | null): boolean | undefined => {
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
}

export const GET = withAdminAuth(async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get('page') || '1')
        const limit = Number(searchParams.get('limit') || '20')
        const search = searchParams.get('search') || undefined
        const category = parseCategory(searchParams.get('category'))
        const track = parseTrack(searchParams.get('track'))
        const active = parseBooleanParam(searchParams.get('active'))

        const data = await TrainingOpsService.getDomains({
            page,
            limit,
            search,
            category,
            track,
            active,
        })

        return NextResponse.json({
            success: true,
            data: data.domains,
            pagination: data.pagination,
        })
    } catch (error) {
        console.error('List training-op domains error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load product domains',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const payload = createProductDomainSchema.parse(body)
        const domain = await TrainingOpsService.createDomain(payload)

        return NextResponse.json({
            success: true,
            data: domain,
        })
    } catch (error) {
        console.error('Create training-op domain error:', error)

        const message =
            error instanceof Error && error.message === 'PRODUCT_DOMAIN_SLUG_EXISTS'
                ? 'A product domain with this slug already exists'
                : error instanceof Error && error.message === 'PRIMARY_SME_NOT_FOUND'
                    ? 'Primary SME must be an active user'
                    : error instanceof Error && error.message === 'BACKUP_SME_NOT_FOUND'
                        ? 'Backup SME must be an active user'
                        : 'Failed to create product domain'

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
