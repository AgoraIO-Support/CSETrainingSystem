import crypto from 'crypto'
import type { AuthUser } from '@/lib/auth-middleware'
import { getRequestCallerIp } from '@/lib/mcp-production-policy'
import prisma from '@/lib/prisma'

const MCP_TOKEN_PREFIX = 'csemcp'
const MCP_TOKEN_SCOPE = 'SME_MCP'
const DEFAULT_EXPIRATION_DAYS = 90
const MAX_EXPIRATION_DAYS = 365
const MAX_ACTIVE_TOKENS_PER_USER = 10

export class McpAccessTokenError extends Error {
    status: number
    code: string

    constructor(code: string, message: string, status: number) {
        super(message)
        this.name = 'McpAccessTokenError'
        this.status = status
        this.code = code
    }
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

const normalizeExpiryDays = (expiresInDays?: number) => {
    if (!Number.isFinite(expiresInDays)) return DEFAULT_EXPIRATION_DAYS
    const normalized = Math.max(1, Math.min(MAX_EXPIRATION_DAYS, Math.floor(expiresInDays as number)))
    return normalized
}

const buildRawToken = () => {
    const tokenPrefix = `${MCP_TOKEN_PREFIX}_${crypto.randomBytes(6).toString('hex')}`
    const secret = crypto.randomBytes(24).toString('base64url')
    return {
        tokenPrefix,
        rawToken: `${tokenPrefix}.${secret}`,
    }
}

const ensureEligibleMcpUser = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            role: true,
            status: true,
        },
    })

    if (!user || user.status !== 'ACTIVE' || (user.role !== 'SME' && user.role !== 'ADMIN')) {
        throw new McpAccessTokenError(
            'MCP_ACCESS_TOKEN_USER_INVALID',
            'Only active SME or ADMIN users can manage MCP access tokens.',
            403
        )
    }

    return user
}

const refreshExpiredTokensForUser = async (userId: string) => {
    await prisma.mcpAccessToken.updateMany({
        where: {
            userId,
            status: 'ACTIVE',
            expiresAt: { lte: new Date() },
        },
        data: {
            status: 'EXPIRED',
        },
    })
}

const toSummary = (token: {
    id: string
    name: string
    tokenPrefix: string
    scope: 'SME_MCP'
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
    createdAt: Date
    updatedAt: Date
    expiresAt: Date
    revokedAt: Date | null
    lastUsedAt: Date | null
    lastUsedIp: string | null
    lastUsedUserAgent: string | null
}) => ({
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scope: token.scope,
    status: token.status,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    lastUsedIp: token.lastUsedIp,
    lastUsedUserAgent: token.lastUsedUserAgent,
})

export class McpAccessTokenService {
    static async listForUser(userId: string) {
        await ensureEligibleMcpUser(userId)
        await refreshExpiredTokensForUser(userId)

        const tokens = await prisma.mcpAccessToken.findMany({
            where: { userId },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        })

        return tokens.map(toSummary)
    }

    static async createForUser(
        user: Pick<AuthUser, 'id' | 'role'>,
        data: {
            name: string
            expiresInDays?: number
        }
    ) {
        await ensureEligibleMcpUser(user.id)
        await refreshExpiredTokensForUser(user.id)

        const activeCount = await prisma.mcpAccessToken.count({
            where: {
                userId: user.id,
                status: 'ACTIVE',
            },
        })

        if (activeCount >= MAX_ACTIVE_TOKENS_PER_USER) {
            throw new McpAccessTokenError(
                'MCP_ACCESS_TOKEN_LIMIT_REACHED',
                `You already have ${MAX_ACTIVE_TOKENS_PER_USER} active MCP tokens. Revoke an old token before creating a new one.`,
                409
            )
        }

        const tokenName = data.name.trim()
        if (!tokenName) {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_NAME_REQUIRED', 'Token name is required.', 400)
        }

        const expiresInDays = normalizeExpiryDays(data.expiresInDays)
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        const { tokenPrefix, rawToken } = buildRawToken()

        const token = await prisma.mcpAccessToken.create({
            data: {
                userId: user.id,
                name: tokenName,
                tokenPrefix,
                tokenHash: hashToken(rawToken),
                scope: MCP_TOKEN_SCOPE,
                status: 'ACTIVE',
                expiresAt,
            },
        })

        return {
            token: rawToken,
            record: toSummary(token),
        }
    }

    static async revokeForUser(userId: string, tokenId: string) {
        await ensureEligibleMcpUser(userId)

        const token = await prisma.mcpAccessToken.findFirst({
            where: {
                id: tokenId,
                userId,
            },
        })

        if (!token) {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_NOT_FOUND', 'MCP token not found.', 404)
        }

        if (token.status === 'REVOKED') {
            return toSummary(token)
        }

        const revoked = await prisma.mcpAccessToken.update({
            where: { id: token.id },
            data: {
                status: 'REVOKED',
                revokedAt: new Date(),
            },
        })

        return toSummary(revoked)
    }

    static async authenticate(rawToken: string, request: Request): Promise<AuthUser> {
        const normalizedToken = rawToken.trim()
        if (!normalizedToken) {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_MISSING', 'Missing MCP access token.', 401)
        }

        const tokenPrefix = normalizedToken.split('.', 1)[0]?.trim()
        if (!tokenPrefix || !tokenPrefix.startsWith(`${MCP_TOKEN_PREFIX}_`)) {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_INVALID', 'Invalid MCP access token.', 401)
        }

        const record = await prisma.mcpAccessToken.findUnique({
            where: { tokenPrefix },
            include: {
                user: true,
            },
        })

        if (!record) {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_INVALID', 'Invalid MCP access token.', 401)
        }

        if (record.status === 'REVOKED') {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_REVOKED', 'This MCP access token has been revoked.', 401)
        }

        if (record.expiresAt <= new Date()) {
            if (record.status !== 'EXPIRED') {
                await prisma.mcpAccessToken.update({
                    where: { id: record.id },
                    data: { status: 'EXPIRED' },
                })
            }
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_EXPIRED', 'This MCP access token has expired.', 401)
        }

        if (record.status !== 'ACTIVE' || record.tokenHash !== hashToken(normalizedToken)) {
            throw new McpAccessTokenError('MCP_ACCESS_TOKEN_INVALID', 'Invalid MCP access token.', 401)
        }

        if (
            record.user.status !== 'ACTIVE' ||
            (record.user.role !== 'SME' && record.user.role !== 'ADMIN')
        ) {
            throw new McpAccessTokenError(
                'MCP_ACCESS_TOKEN_USER_INVALID',
                'The token owner is no longer an active SME or ADMIN user.',
                403
            )
        }

        await prisma.mcpAccessToken.update({
            where: { id: record.id },
            data: {
                lastUsedAt: new Date(),
                lastUsedIp: getRequestCallerIp(request),
                lastUsedUserAgent: request.headers.get('user-agent')?.trim() || null,
            },
        })

        return {
            id: record.user.id,
            email: record.user.email,
            role: record.user.role,
            supabaseId: record.user.supabaseId || undefined,
        }
    }
}
