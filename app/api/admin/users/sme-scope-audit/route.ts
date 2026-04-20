import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { UserService } from '@/lib/services/user.service'

export const GET = withAdminAuth(async () => {
    try {
        const data = await UserService.getSmeScopeAudit()

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME scope audit error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load SME scope audit',
                },
            },
            { status: 500 }
        )
    }
})
