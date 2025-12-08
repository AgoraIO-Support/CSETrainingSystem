import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { UserService } from '@/lib/services/user.service'
import { adminUpdateUserSchema } from '@/lib/validations'
import { z } from 'zod'

export const PATCH = withAdminAuth(async (req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = adminUpdateUserSchema.parse(body)

        const updated = await UserService.updateUser(id, data)

        return NextResponse.json({
            success: true,
            data: updated,
        })
    } catch (error) {
        console.error('Update user error:', error)

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
            if (error.message === 'NO_UPDATES') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'USER_002',
                            message: 'No updates provided',
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
                    message: 'Failed to update user',
                },
            },
            { status: 500 }
        )
    }
})
