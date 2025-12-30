import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseAnalyticsService } from '@/lib/services/course-analytics.service'

export const GET = withAdminAuth(async (_req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params

        const analytics = await CourseAnalyticsService.getCourseAnalytics(id)

        return NextResponse.json({
            success: true,
            data: analytics,
        })
    } catch (error) {
        console.error('Get course analytics error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load course analytics',
                },
            },
            { status: 500 }
        )
    }
})

