import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { ProgressService } from '@/lib/services/progress.service'

export const GET = withAuth(async (_req, user) => {
    try {
        const overview = await ProgressService.getUserOverview(user.id)

        return NextResponse.json({
            success: true,
            data: overview,
        })
    } catch (error) {
        console.error('Get progress overview error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load progress overview',
                },
            },
            { status: 500 }
        )
    }
})
