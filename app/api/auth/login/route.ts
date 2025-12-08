import { NextRequest, NextResponse } from 'next/server'
import { AuthService } from '@/lib/services/auth.service'
import { loginSchema } from '@/lib/validations'
import { z } from 'zod'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()

        // Validate request body
        const { email, password } = loginSchema.parse(body)

        // Login user
        const result = await AuthService.login(email, password)

        return NextResponse.json({
            success: true,
            data: {
                user: result.user,
                session: {
                    accessToken: result.session?.access_token,
                    refreshToken: result.session?.refresh_token,
                    expiresIn: result.session?.expires_in,
                },
            },
            message: 'Login successful',
        })
    } catch (error) {
        console.error('Login error:', error)

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
            if (error.message === 'INVALID_CREDENTIALS' || error.message === 'USER_INACTIVE') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_005',
                            message: 'Invalid email or password',
                        },
                    },
                    { status: 401 }
                )
            }
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Login failed',
                },
            },
            { status: 500 }
        )
    }
}
