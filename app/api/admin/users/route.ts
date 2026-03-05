import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { UserService } from '@/lib/services/user.service'
import type { UserRole, UserStatus } from '@prisma/client'
import { adminCreateUserSchema } from '@/lib/validations'
import { z } from 'zod'

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

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const data = adminCreateUserSchema.parse(body)

        const user = await UserService.createUser({
            email: data.email,
            password: data.password,
            name: data.name,
            wecomUserId: data.wecomUserId,
            department: data.department,
            title: data.title,
        })

        return NextResponse.json(
            {
                success: true,
                data: user,
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Create user error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input data',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'USER_003',
                        message: 'Email already registered',
                    },
                },
                { status: 409 }
            )
        }

        if (error instanceof Error && error.message === 'WECOM_USER_ID_EXISTS') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'USER_004',
                        message: 'WeCom User ID already exists',
                    },
                },
                { status: 409 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to create user',
                },
            },
            { status: 500 }
        )
    }
})
