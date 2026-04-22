import { NextRequest, NextResponse } from 'next/server'
import { InternalMcpAuthError, resolveInternalMcpUser } from '@/lib/internal-mcp-auth'
import { buildMcpAuditContext, logMcpInvocationFinish, logMcpInvocationStart } from '@/lib/mcp-audit'
import { checkAndConsumeMcpRateLimit } from '@/lib/mcp-rate-limit'
import { listMcpToolsForServer } from '@/lib/sme-mcp-registry'
import { normalizeSmeMcpError, parseAndExecuteSmeMcpTool } from '@/lib/sme-mcp-runtime'
import { log } from '@/lib/logger'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
    jsonrpc?: string
    id?: JsonRpcId
    method?: string
    params?: Record<string, unknown>
}

const DEFAULT_PROTOCOL_VERSION = '2025-03-26'

export const handleInternalMcpGet = (endpoint: string) =>
    NextResponse.json({
        name: 'cse-sme-mcp',
        endpoint,
        transport: 'http-jsonrpc',
        tools: listMcpToolsForServer().map((tool) => tool.name),
    })

export async function handleInternalMcpPost(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
    let body: JsonRpcRequest

    try {
        body = (await request.json()) as JsonRpcRequest
    } catch {
        return jsonRpcError(null, -32700, 'Parse error', 400, undefined, requestId)
    }

    if (body?.jsonrpc !== '2.0' || typeof body?.method !== 'string') {
        return jsonRpcError(body?.id ?? null, -32600, 'Invalid Request', 400, undefined, requestId)
    }

    const id = body.id ?? null
    const method = body.method
    const toolName = method === 'tools/call' && typeof body.params?.name === 'string' ? body.params.name : null
    const rateLimitState = checkAndConsumeMcpRateLimit(request, {
        method,
        toolName,
    })

    if (rateLimitState?.limited) {
        log('API', 'warn', 'mcp rate limit exceeded', {
            requestId,
            method,
            toolName,
            rateLimitKey: rateLimitState.key,
            retryAfterSeconds: rateLimitState.retryAfterSeconds,
            limit: rateLimitState.limit,
        })

        return jsonRpcError(
            id,
            -32029,
            'Rate limit exceeded',
            429,
            {
                code: 'MCP_RATE_LIMITED',
                retryAfterSeconds: rateLimitState.retryAfterSeconds,
                limit: rateLimitState.limit,
            },
            requestId,
            buildRateLimitHeaders(rateLimitState)
        )
    }

    try {
        const mcpUser = await resolveInternalMcpUser(request)

        switch (method) {
            case 'initialize':
                return jsonRpcResult(
                    id,
                    {
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
                    },
                    requestId
                )
            case 'notifications/initialized':
                return new NextResponse(null, {
                    status: 202,
                    headers: {
                        'x-request-id': requestId,
                    },
                })
            case 'ping':
                return jsonRpcResult(id, {}, requestId, buildRateLimitHeaders(rateLimitState))
            case 'tools/list':
                log('API', 'info', 'mcp tools/list', {
                    requestId,
                    userId: mcpUser.id,
                    userEmail: mcpUser.email,
                    toolCount: listMcpToolsForServer().length,
                })
                return jsonRpcResult(
                    id,
                    {
                        tools: listMcpToolsForServer(),
                    },
                    requestId,
                    buildRateLimitHeaders(rateLimitState)
                )
            case 'tools/call': {
                if (!toolName) {
                    return jsonRpcError(
                        id,
                        -32602,
                        'Tool name is required',
                        400,
                        undefined,
                        requestId,
                        buildRateLimitHeaders(rateLimitState)
                    )
                }

                const allowedTools = listMcpToolsForServer().map((tool) => tool.name)
                const auditContext = buildMcpAuditContext(request, {
                    requestId,
                    method,
                    toolName,
                    user: mcpUser,
                })
                const startedAt = Date.now()
                logMcpInvocationStart(auditContext, body.params?.arguments)

                try {
                    const result = await parseAndExecuteSmeMcpTool(
                        mcpUser,
                        {
                            tool: toolName,
                            input:
                                body.params && 'arguments' in body.params
                                    ? body.params.arguments
                                    : undefined,
                        },
                        {
                            allowedTools,
                        }
                    )
                    logMcpInvocationFinish(auditContext, 'success', Date.now() - startedAt, {
                        nextActionCount: result.nextActions.length,
                        warningCount: result.warnings?.length || 0,
                    })

                    return jsonRpcResult(
                        id,
                        {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2),
                                },
                            ],
                            structuredContent: result,
                            isError: false,
                        },
                        requestId,
                        buildRateLimitHeaders(rateLimitState)
                    )
                } catch (error) {
                    const normalized = normalizeSmeMcpError(error)
                    logMcpInvocationFinish(auditContext, 'failure', Date.now() - startedAt, {
                        errorCode:
                            normalized.body && typeof normalized.body === 'object' && 'error' in normalized.body
                                ? (normalized.body as { error?: { code?: string } }).error?.code
                                : undefined,
                        status: normalized.status,
                    })
                    return jsonRpcResult(
                        id,
                        {
                            content: [
                                {
                                    type: 'text',
                                    text: normalized.body.error.message,
                                },
                            ],
                            structuredContent: normalized.body,
                            isError: true,
                        },
                        requestId,
                        buildRateLimitHeaders(rateLimitState)
                    )
                }
            }
            default:
                return jsonRpcError(id, -32601, 'Method not found', 404, undefined, requestId, buildRateLimitHeaders(rateLimitState))
        }
    } catch (error) {
        if (error instanceof InternalMcpAuthError) {
            return jsonRpcError(
                id,
                -32001,
                error.message,
                error.status,
                {
                    code: error.code,
                },
                requestId,
                buildRateLimitHeaders(rateLimitState)
            )
        }

        console.error('Standard MCP server error:', error)
        return jsonRpcError(id, -32603, 'Internal error', 500, undefined, requestId, buildRateLimitHeaders(rateLimitState))
    }
}

const readProtocolVersion = (params: Record<string, unknown> | undefined) => {
    const protocolVersion = params?.protocolVersion
    return typeof protocolVersion === 'string' && protocolVersion.trim().length > 0
        ? protocolVersion
        : DEFAULT_PROTOCOL_VERSION
}

const jsonRpcResult = (id: JsonRpcId, result: unknown, requestId?: string, extraHeaders?: HeadersInit) =>
    NextResponse.json(
        {
            jsonrpc: '2.0',
            id,
            result,
        },
        {
            headers: mergeHeaders(
                requestId
                    ? {
                          'x-request-id': requestId,
                      }
                    : undefined,
                extraHeaders
            ),
        }
    )

const jsonRpcError = (
    id: JsonRpcId,
    code: number,
    message: string,
    status: number,
    data?: unknown,
    requestId?: string,
    extraHeaders?: HeadersInit
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
        {
            status,
            headers: mergeHeaders(
                requestId
                    ? {
                          'x-request-id': requestId,
                      }
                    : undefined,
                extraHeaders
            ),
        }
    )

const buildRateLimitHeaders = (
    state: ReturnType<typeof checkAndConsumeMcpRateLimit>
): HeadersInit | undefined => {
    if (!state) return undefined

    return {
        'x-ratelimit-limit': String(state.limit),
        'x-ratelimit-remaining': String(state.remaining),
        'x-ratelimit-reset': String(Math.floor(state.resetAt / 1000)),
        'retry-after': String(state.retryAfterSeconds),
    }
}

const mergeHeaders = (...headerSets: Array<HeadersInit | undefined>) => {
    const headers = new Headers()

    for (const headerSet of headerSets) {
        if (!headerSet) continue
        const nextHeaders = new Headers(headerSet)
        nextHeaders.forEach((value, key) => {
            headers.set(key, value)
        })
    }

    return headers
}
