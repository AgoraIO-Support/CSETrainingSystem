import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { AIService } from '@/lib/services/ai.service'
import { aiMessageSchema } from '@/lib/validations'
import { z } from 'zod'

export const GET = withAuth(async (req, user, { params }: { params: Promise<{ conversationId: string }> }) => {
    try {
        const { conversationId } = await params

        const messages = await AIService.getMessages(conversationId)

        return NextResponse.json({
            success: true,
            data: messages,
        })
    } catch (error) {
        console.error('Get AI messages error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to retrieve messages',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withAuth(async (req, user, { params }: { params: Promise<{ conversationId: string }> }) => {
    try {
        const { conversationId } = await params
        const body = await req.json()
        const payload = aiMessageSchema.parse(body)

        const result = await AIService.sendMessage({
            conversationId,
            message: payload.message,
            videoTimestamp: payload.videoTimestamp,
            context: payload.context,
        })

        return NextResponse.json({
            success: true,
            data: result,
        })
    } catch (error) {
        console.error('Send AI message error:', error)

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

        if (error instanceof Error && error.message === 'CONVERSATION_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AI_001',
                        message: 'Conversation not found',
                    },
                },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to send message',
                },
            },
            { status: 500 }
        )
    }
})
