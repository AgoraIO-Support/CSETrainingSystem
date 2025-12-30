import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { changePasswordSchema } from '@/lib/validations'
import { AuthService } from '@/lib/services/auth.service'
import { z } from 'zod'

export const POST = withAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const data = changePasswordSchema.parse(body)

        await AuthService.changePassword(user.id, data)

        return NextResponse.json({
            success: true,
        })
    } catch (error) {
        console.error('Change password error:', error)

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

        if (error instanceof Error) {
            if (error.message === 'CURRENT_PASSWORD_REQUIRED') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_006',
                            message: 'Current password is required',
                        },
                    },
                    { status: 400 }
                )
            }

            if (error.message === 'INVALID_CURRENT_PASSWORD') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_007',
                            message: 'Current password is incorrect',
                        },
                    },
                    { status: 400 }
                )
            }

            if (error.message === 'USER_NOT_FOUND') {
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
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to change password',
                },
            },
            { status: 500 }
        )
    }
})

