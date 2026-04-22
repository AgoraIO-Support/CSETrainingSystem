import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { McpAccessTokenError, McpAccessTokenService } from '@/lib/services/mcp-access-token.service'

const createMcpAccessTokenSchema = z.object({
    name: z.string().trim().min(2).max(80),
    expiresInDays: z.number().int().min(1).max(365).default(90),
})

export const GET = withSmeOrAdminAuth(async (_req, user) => {
    try {
        const tokens = await McpAccessTokenService.listForUser(user.id)
        return NextResponse.json({ success: true, data: tokens })
    } catch (error) {
        if (error instanceof McpAccessTokenError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                    },
                },
                { status: error.status }
            )
        }

        console.error('List MCP access tokens error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load MCP access tokens',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const data = createMcpAccessTokenSchema.parse(body)
        const token = await McpAccessTokenService.createForUser(user, data)
        return NextResponse.json({ success: true, data: token }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid MCP token request',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof McpAccessTokenError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                    },
                },
                { status: error.status }
            )
        }

        console.error('Create MCP access token error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to create MCP access token',
                },
            },
            { status: 500 }
        )
    }
})
