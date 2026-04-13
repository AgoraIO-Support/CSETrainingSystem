import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { normalizeSmeMcpError, parseAndExecuteSmeMcpTool } from '@/lib/sme-mcp-runtime'

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        return NextResponse.json(await parseAndExecuteSmeMcpTool(user, body))
    } catch (error) {
        console.error('SME MCP tool error:', error)
        const normalized = normalizeSmeMcpError(error)
        return NextResponse.json(normalized.body, { status: normalized.status })
    }
})
