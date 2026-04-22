import { NextRequest } from 'next/server'
import { handleInternalMcpGet, handleInternalMcpPost } from '@/lib/mcp-internal-runtime'

export const dynamic = 'force-dynamic'

export async function GET() {
    return handleInternalMcpGet('/api/internal/mcp')
}

export async function POST(request: NextRequest) {
    return handleInternalMcpPost(request)
}
