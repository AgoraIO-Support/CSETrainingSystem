import { NextRequest, NextResponse } from 'next/server'
import { handleInternalMcpGet } from '@/lib/mcp-internal-runtime'
import { isSmeMcpProdMode } from '@/lib/mcp-production-policy'
import { McpAccessTokenError, McpAccessTokenService } from '@/lib/services/mcp-access-token.service'

export const dynamic = 'force-dynamic'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
    jsonrpc?: string
    id?: JsonRpcId
}

const INTERNAL_TOKEN_ENV = 'SME_MCP_INTERNAL_TOKEN'
const USER_EMAIL_HEADER = 'x-sme-user-email'
const CALLER_ID_HEADER = 'x-mcp-caller-id'
const PUBLIC_GATEWAY_CALLER_ID = process.env.SME_MCP_PUBLIC_GATEWAY_CALLER_ID?.trim() || 'nginx-gateway'

export async function GET() {
    return handleInternalMcpGet('/api/mcp')
}

export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
    const rawBody = await request.text()
    const parsedBody = safeParseJsonRpc(rawBody)
    const jsonRpcId = parsedBody?.id ?? null
    const bearerToken = extractBearerToken(request)
    const configuredInternalToken = (process.env[INTERNAL_TOKEN_ENV] || '').trim()

    if (!bearerToken) {
        return jsonRpcError(
            jsonRpcId,
            -32001,
            'Missing MCP access token',
            401,
            { code: 'MCP_ACCESS_TOKEN_MISSING' },
            requestId
        )
    }

    if (configuredInternalToken && bearerToken === configuredInternalToken) {
        if (isSmeMcpProdMode()) {
            return jsonRpcError(
                jsonRpcId,
                -32001,
                'Direct internal MCP token usage is disabled on the public MCP gateway',
                403,
                { code: 'MCP_INTERNAL_TOKEN_PUBLIC_FORBIDDEN' },
                requestId
            )
        }

        return proxyToInternalRuntime(request, rawBody, requestId, {
            internalToken: configuredInternalToken,
            requestedUserEmail: request.headers.get(USER_EMAIL_HEADER)?.trim() || undefined,
            callerId: `${PUBLIC_GATEWAY_CALLER_ID}-direct-dev`,
        })
    }

    try {
        const user = await McpAccessTokenService.authenticate(bearerToken, request)

        if (!configuredInternalToken) {
            return jsonRpcError(
                jsonRpcId,
                -32603,
                `${INTERNAL_TOKEN_ENV} is not configured`,
                500,
                { code: 'MCP_INTERNAL_AUTH_NOT_CONFIGURED' },
                requestId
            )
        }

        return proxyToInternalRuntime(request, rawBody, requestId, {
            internalToken: configuredInternalToken,
            requestedUserEmail: user.email,
            callerId: PUBLIC_GATEWAY_CALLER_ID,
        })
    } catch (error) {
        if (error instanceof McpAccessTokenError) {
            return jsonRpcError(
                jsonRpcId,
                -32001,
                error.message,
                error.status,
                { code: error.code },
                requestId
            )
        }

        console.error('Public MCP gateway error:', error)
        return jsonRpcError(jsonRpcId, -32603, 'Internal error', 500, undefined, requestId)
    }
}

const safeParseJsonRpc = (rawBody: string): JsonRpcRequest | null => {
    try {
        return rawBody ? (JSON.parse(rawBody) as JsonRpcRequest) : null
    } catch {
        return null
    }
}

const extractBearerToken = (request: Request) => {
    const authHeader = request.headers.get('authorization')
    return authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
}

const proxyToInternalRuntime = async (
    request: NextRequest,
    rawBody: string,
    requestId: string,
    options: {
        internalToken: string
        requestedUserEmail?: string
        callerId: string
    }
) => {
    const internalUrl = new URL('/api/internal/mcp', request.url)
    const headers = new Headers()

    headers.set('content-type', request.headers.get('content-type') || 'application/json')
    headers.set('authorization', `Bearer ${options.internalToken}`)
    headers.set('x-request-id', requestId)
    headers.set(CALLER_ID_HEADER, options.callerId)

    if (options.requestedUserEmail) {
        headers.set(USER_EMAIL_HEADER, options.requestedUserEmail)
    }

    const xForwardedFor = request.headers.get('x-forwarded-for')
    const xRealIp = request.headers.get('x-real-ip')
    if (xForwardedFor) headers.set('x-forwarded-for', xForwardedFor)
    if (xRealIp) headers.set('x-real-ip', xRealIp)
    const userAgent = request.headers.get('user-agent')
    if (userAgent) headers.set('user-agent', userAgent)

    const response = await fetch(internalUrl, {
        method: 'POST',
        headers,
        body: rawBody,
        cache: 'no-store',
    })

    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('x-request-id', requestId)

    return new NextResponse(response.body, {
        status: response.status,
        headers: responseHeaders,
    })
}

const jsonRpcError = (
    id: JsonRpcId,
    code: number,
    message: string,
    status: number,
    data?: unknown,
    requestId?: string
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
            headers: requestId
                ? {
                      'x-request-id': requestId,
                  }
                : undefined,
        }
    )
