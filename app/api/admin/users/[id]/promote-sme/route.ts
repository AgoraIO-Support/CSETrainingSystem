import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { UserService } from '@/lib/services/user.service'
import { z } from 'zod'

const promoteUserToSmeSchema = z.object({
    domainIds: z.array(z.string().uuid()).min(1, 'Select at least one domain'),
})

export const POST = withAdminAuth(async (req: NextRequest, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = promoteUserToSmeSchema.parse(body)
        const result = await UserService.promoteUserToSme(id, data.domainIds)

        return NextResponse.json({
            success: true,
            data: result,
        })
    } catch (error) {
        console.error('Promote user to SME error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: error.issues[0]?.message || 'Invalid SME promotion payload',
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof Error) {
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

            if (error.message === 'USER_ROLE_LOCKED') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'USER_005',
                            message: 'Admins cannot be reassigned through SME promotion',
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
                    message: 'Failed to promote user to SME',
                },
            },
            { status: 500 }
        )
    }
})
