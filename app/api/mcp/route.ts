import { NextRequest, NextResponse } from 'next/server'
import { InternalMcpAuthError, resolveInternalMcpUser } from '@/lib/internal-mcp-auth'
import { listMcpToolsForServer } from '@/lib/sme-mcp-registry'
import { normalizeSmeMcpError, parseAndExecuteSmeMcpTool } from '@/lib/sme-mcp-runtime'

export const dynamic = 'force-dynamic'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
    jsonrpc?: string
    id?: JsonRpcId
    method?: string
    params?: Record<string, unknown>
}

const DEFAULT_PROTOCOL_VERSION = '2025-03-26'

export async function GET() {
    return NextResponse.json({
        name: 'cse-sme-mcp',
        endpoint: '/api/mcp',
        transport: 'http-jsonrpc',
        tools: listMcpToolsForServer().map((tool) => tool.name),
    })
}

export async function POST(request: NextRequest) {
    let body: JsonRpcRequest

    try {
        body = (await request.json()) as JsonRpcRequest
    } catch {
        return jsonRpcError(null, -32700, 'Parse error', 400)
    }

    if (body?.jsonrpc !== '2.0' || typeof body?.method !== 'string') {
        return jsonRpcError(body?.id ?? null, -32600, 'Invalid Request', 400)
    }

    const id = body.id ?? null

    try {
        const mcpUser = await resolveInternalMcpUser(request)

        switch (body.method) {
            case 'initialize':
                return jsonRpcResult(id, {
                    protocolVersion: readProtocolVersion(body.params),
                    capabilities: {
                        tools: {
                            listChanged: false,
                        },
                    },
                    serverInfo: {
                        name: 'cse-sme-mcp',
                        version: '0.1.0',
                    },
                })
            case 'notifications/initialized':
                return new NextResponse(null, { status: 202 })
            case 'ping':
                return jsonRpcResult(id, {})
            case 'tools/list':
                return jsonRpcResult(id, {
                    tools: listMcpToolsForServer(),
                })
            case 'tools/call': {
                const toolName = typeof body.params?.name === 'string' ? body.params.name : null
                if (!toolName) {
                    return jsonRpcError(id, -32602, 'Tool name is required', 400)
                }

                try {
                    const result = await parseAndExecuteSmeMcpTool(mcpUser, {
                        tool: toolName,
                        input:
                            body.params && 'arguments' in body.params
                                ? body.params.arguments
                                : undefined,
                    })

                    return jsonRpcResult(id, {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        structuredContent: result,
                        isError: false,
                    })
                } catch (error) {
                    const normalized = normalizeSmeMcpError(error)
                    return jsonRpcResult(id, {
                        content: [
                            {
                                type: 'text',
                                text: normalized.body.error.message,
                            },
                        ],
                        structuredContent: normalized.body,
                        isError: true,
                    })
                }
            }
            default:
                return jsonRpcError(id, -32601, 'Method not found', 404)
        }
    } catch (error) {
        if (error instanceof InternalMcpAuthError) {
            return jsonRpcError(id, -32001, error.message, error.status, {
                code: error.code,
            })
        }

        console.error('Standard MCP server error:', error)
        return jsonRpcError(id, -32603, 'Internal error', 500)
    }
}

const readProtocolVersion = (params: Record<string, unknown> | undefined) => {
    const protocolVersion = params?.protocolVersion
    return typeof protocolVersion === 'string' && protocolVersion.trim().length > 0
        ? protocolVersion
        : DEFAULT_PROTOCOL_VERSION
}

const jsonRpcResult = (id: JsonRpcId, result: unknown) =>
    NextResponse.json({
        jsonrpc: '2.0',
        id,
        result,
    })

const jsonRpcError = (
    id: JsonRpcId,
    code: number,
    message: string,
    status: number,
    data?: unknown
) =>
    NextResponse.json(
        {
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
                ...(data === undefined ? {} : { data }),
            },
        },
        { status }
    )
