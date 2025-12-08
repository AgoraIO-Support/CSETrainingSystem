import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { ProfileService } from '@/lib/services/profile.service'
import { updateProfileSchema } from '@/lib/validations'
import { z } from 'zod'

export const GET = withAuth(async (_req, user) => {
    try {
        const profile = await ProfileService.getProfile(user.id)
        return NextResponse.json({ success: true, data: profile })
    } catch (error) {
        console.error('Get profile error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load profile',
                },
            },
            { status: 500 }
        )
    }
})

export const PUT = withAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const data = updateProfileSchema.parse(body)
        const profile = await ProfileService.updateProfile(user.id, data)
        return NextResponse.json({ success: true, data: profile })
    } catch (error) {
        console.error('Update profile error:', error)

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

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to update profile',
                },
            },
            { status: 500 }
        )
    }
})
