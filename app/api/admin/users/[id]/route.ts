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

            if (error.message === 'EMAIL_EXISTS') {
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

            if (error.message === 'WECOM_USER_ID_EXISTS') {
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

            if (error.message === 'SME_ROLE_REQUIRES_DOMAIN_ASSIGNMENT') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'USER_006',
                            message: 'Promoting a user to SME requires at least one domain assignment.',
                        },
                    },
                    { status: 400 }
                )
            }

            if (error.message === 'SME_DOMAIN_REQUIRED') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'USER_007',
                            message: 'SME must be assigned at least one domain.',
                        },
                    },
                    { status: 400 }
                )
            }

            if (error.message === 'DOMAIN_ASSIGNMENT_REQUIRES_SME_ROLE') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'USER_008',
                            message: 'Domain assignments can only be managed for SME users.',
                        },
                    },
                    { status: 400 }
                )
            }

            if (error.message === 'PRODUCT_DOMAIN_NOT_FOUND') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'DOMAIN_001',
                            message: 'One or more selected domains no longer exist',
                        },
                    },
                    { status: 404 }
                )
            }

            if (error.message.startsWith('DOMAIN_ASSIGNMENT_CONFLICT:')) {
                const domainNames = error.message.split(':')[1] || ''

                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'DOMAIN_002',
                            message: `These domains already have both SME slots filled: ${domainNames}`,
                        },
                    },
                    { status: 409 }
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
