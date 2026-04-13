import prisma from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth-middleware'

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

    const requestedEmail =
        request.headers.get(USER_EMAIL_HEADER)?.trim() ||
        (process.env[INTERNAL_USER_EMAIL_ENV] || '').trim()

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
