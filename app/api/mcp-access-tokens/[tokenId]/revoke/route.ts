import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { McpAccessTokenError, McpAccessTokenService } from '@/lib/services/mcp-access-token.service'

type RouteContext = {
    params: Promise<{
        tokenId: string
    }>
}

export const POST = withSmeOrAdminAuth(async (_req, user, context: RouteContext) => {
    try {
        const { tokenId } = await context.params
        const token = await McpAccessTokenService.revokeForUser(user.id, tokenId)
        return NextResponse.json({ success: true, data: token })
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

        console.error('Revoke MCP access token error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to revoke MCP access token',
                },
            },
            { status: 500 }
        )
    }
})
