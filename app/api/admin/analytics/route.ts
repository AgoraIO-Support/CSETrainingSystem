import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { AnalyticsService } from '@/lib/services/analytics.service'

const parseDateParam = (value: string | null) => {
    if (!value) return { date: undefined, error: false }
    const parsed = new Date(value)
    if (isNaN(parsed.getTime())) {
        return { date: undefined, error: true }
    }
    return { date: parsed, error: false }
}

export const GET = withAdminAuth(async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url)

        const startResult = parseDateParam(searchParams.get('startDate'))
        const endResult = parseDateParam(searchParams.get('endDate'))

        if (startResult.error || endResult.error) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid date format. Please use ISO strings.',
                    },
                },
                { status: 400 }
            )
        }

        const data = await AnalyticsService.getSummary({
            startDate: startResult.date,
            endDate: endResult.date,
        })

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get analytics error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load analytics data',
                },
            },
            { status: 500 }
        )
    }
})
