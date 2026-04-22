import prisma from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth-middleware'
import {
    areTrustedProxyHeadersEnabled,
    getMcpCallerIdHeader,
    isSmeMcpCallerRestrictionsConfigured,
    isSmeMcpFallbackUserDisabled,
    isSmeMcpProdMode,
    isTrustedMcpCaller,
} from '@/lib/mcp-production-policy'

const INTERNAL_TOKEN_ENV = 'SME_MCP_INTERNAL_TOKEN'
const INTERNAL_USER_EMAIL_ENV = 'SME_MCP_INTERNAL_USER_EMAIL'
const USER_EMAIL_HEADER = 'x-sme-user-email'

export class InternalMcpAuthError extends Error {
    status: number
    code: string

    constructor(code: string, message: string, status: number) {
        super(message)
        this.name = 'InternalMcpAuthError'
        this.status = status
        this.code = code
    }
}

export const resolveInternalMcpUser = async (request: Request): Promise<AuthUser> => {
    const configuredToken = (process.env[INTERNAL_TOKEN_ENV] || '').trim()
    if (!configuredToken) {
        throw new InternalMcpAuthError(
            'MCP_INTERNAL_AUTH_NOT_CONFIGURED',
            `${INTERNAL_TOKEN_ENV} is not configured`,
            500
        )
    }

    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!bearerToken || bearerToken !== configuredToken) {
        throw new InternalMcpAuthError('MCP_INTERNAL_AUTH_FORBIDDEN', 'Invalid internal MCP token', 401)
    }

    const requestedEmailFromHeader = request.headers.get(USER_EMAIL_HEADER)?.trim() || ''
    const fallbackEmail = (process.env[INTERNAL_USER_EMAIL_ENV] || '').trim()

    if (requestedEmailFromHeader) {
        if (!areTrustedProxyHeadersEnabled()) {
            throw new InternalMcpAuthError(
                'MCP_INTERNAL_TRUSTED_HEADERS_DISABLED',
                `${USER_EMAIL_HEADER} is not accepted unless trusted proxy headers are enabled`,
                403
            )
        }

        if (isSmeMcpProdMode() && !isSmeMcpCallerRestrictionsConfigured()) {
            throw new InternalMcpAuthError(
                'MCP_INTERNAL_CALLER_RESTRICTION_NOT_CONFIGURED',
                `Trusted user headers require caller restrictions in production. Configure ${getMcpCallerIdHeader()} or SME_MCP_ALLOWED_CALLER_IPS/SME_MCP_ALLOWED_CALLER_IDS.`,
                500
            )
        }

        if (isSmeMcpProdMode() && !isTrustedMcpCaller(request)) {
            throw new InternalMcpAuthError(
                'MCP_INTERNAL_CALLER_FORBIDDEN',
                'The MCP caller is not trusted to inject user context headers',
                403
            )
        }
    }

    if (!requestedEmailFromHeader && isSmeMcpFallbackUserDisabled()) {
        throw new InternalMcpAuthError(
            'MCP_INTERNAL_FALLBACK_USER_DISABLED',
            `Missing ${USER_EMAIL_HEADER} header while fallback user resolution is disabled`,
            403
        )
    }

    const requestedEmail = requestedEmailFromHeader || fallbackEmail

    if (!requestedEmail) {
        throw new InternalMcpAuthError(
            'MCP_INTERNAL_USER_NOT_CONFIGURED',
            `Missing ${USER_EMAIL_HEADER} header and ${INTERNAL_USER_EMAIL_ENV} env`,
            500
        )
    }

    const user = await prisma.user.findUnique({
        where: {
            email: requestedEmail,
        },
    })

    if (!user || user.status !== 'ACTIVE' || (user.role !== 'SME' && user.role !== 'ADMIN')) {
        throw new InternalMcpAuthError(
            'MCP_INTERNAL_USER_INVALID',
            'Configured MCP internal user was not found, inactive, or not SME/ADMIN scoped',
            403
        )
    }

    return {
        id: user.id,
        email: user.email,
        role: user.role,
        supabaseId: user.supabaseId || undefined,
    }
}
