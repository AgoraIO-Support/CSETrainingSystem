import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { UserService } from '@/lib/services/user.service'
import type { UserRole, UserStatus } from '@prisma/client'

function parseRole(value: string | null): UserRole | undefined {
    if (value === 'ADMIN' || value === 'USER') {
        return value
    }
    return undefined
}

function parseStatus(value: string | null): UserStatus | undefined {
    if (value === 'ACTIVE' || value === 'SUSPENDED' || value === 'DELETED') {
        return value
    }
    return undefined
}

export const GET = withAdminAuth(async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get('page')) || 1
        const limit = Number(searchParams.get('limit')) || 20
        const search = searchParams.get('search') || undefined
        const role = parseRole(searchParams.get('role'))
        const status = parseStatus(searchParams.get('status'))

        const data = await UserService.getUsers({
            page,
            limit,
            search,
            role,
            status,
        })

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get users error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load users',
                },
            },
            { status: 500 }
        )
    }
})
