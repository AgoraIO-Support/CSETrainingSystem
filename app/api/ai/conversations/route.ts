import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { AIService } from '@/lib/services/ai.service'

export const POST = withAuth(async (req, user) => {
    try {
        const body = await req.json()
        const { courseId, lessonId } = body

        const conversation = await AIService.createConversation({
            userId: user.id,
            courseId,
            lessonId,
        })

        return NextResponse.json(
            {
                success: true,
                data: { conversation },
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Create AI conversation error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to create conversation',
                },
            },
            { status: 500 }
        )
    }
})
