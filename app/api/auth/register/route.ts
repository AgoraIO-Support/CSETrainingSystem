import { NextRequest, NextResponse } from 'next/server'
import { AuthService } from '@/lib/services/auth.service'
import { registerSchema } from '@/lib/validations'
import { z } from 'zod'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()

        // Validate request body
        const validatedData = registerSchema.parse(body)

        // Register user
        const result = await AuthService.register(validatedData)

        return NextResponse.json(
            {
                success: true,
                data: {
                    user: result.user,
                    session: {
                        accessToken: result.session?.access_token,
                        refreshToken: result.session?.refresh_token,
                        expiresIn: result.session?.expires_in,
                    },
                },
                message: 'Registration successful',
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Registration error:', error)

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
            if (error.message === 'EMAIL_EXISTS') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_004',
                            message: 'Email already registered',
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
                    message: 'Registration failed',
                },
            },
            { status: 500 }
        )
    }
}
