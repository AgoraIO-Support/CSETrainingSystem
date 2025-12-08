import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (req, user) => {
    try {
        return NextResponse.json({
            success: true,
            data: user,
        })
    } catch (error) {
        console.error('Get current user error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to get user information',
                },
            },
            { status: 500 }
        )
    }
})
