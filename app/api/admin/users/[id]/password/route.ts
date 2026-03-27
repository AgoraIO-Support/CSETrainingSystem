import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { adminResetUserPasswordSchema } from '@/lib/validations'
import { AuthService } from '@/lib/services/auth.service'
import { z } from 'zod'

export const POST = withAdminAuth(async (req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = adminResetUserPasswordSchema.parse(body)

        await AuthService.adminResetPassword(id, data.newPassword)

        return NextResponse.json({
            success: true,
        })
    } catch (error) {
        console.error('Admin reset password error:', error)

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

        if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'USER_001',
                        message: 'User not found',
                    },
                },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to reset password',
                },
            },
            { status: 500 }
        )
    }
})
