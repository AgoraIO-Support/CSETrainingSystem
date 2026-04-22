import {
    getRequestCallerId,
    getRequestCallerIp,
    isSmeMcpRateLimitEnabled,
} from '@/lib/mcp-production-policy'

type RateLimitBucket = {
    count: number
    resetAt: number
}

type McpRateLimitResult = {
    limited: boolean
    limit: number
    remaining: number
    retryAfterSeconds: number
    resetAt: number
    key: string
}

const buckets = new Map<string, RateLimitBucket>()

const readIntegerEnv = (name: string, fallback: number) => {
    const raw = process.env[name]
    if (!raw) return fallback

    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const getRateLimitWindowMs = () => readIntegerEnv('SME_MCP_RATE_LIMIT_WINDOW_MS', 60_000)

const getGeneralRequestLimit = () => readIntegerEnv('SME_MCP_RATE_LIMIT_MAX_REQUESTS', 120)

const getToolCallLimit = () => readIntegerEnv('SME_MCP_RATE_LIMIT_MAX_TOOL_CALLS', 60)

const resolveRateLimitKey = (request: Request) => {
    const callerId = getRequestCallerId(request)
    const callerIp = getRequestCallerIp(request)
    const userEmail = request.headers.get('x-sme-user-email')?.trim()

    if (callerId) return `caller:${callerId}`
    if (callerIp) return `ip:${callerIp}`
    if (userEmail) return `user:${userEmail}`
    return 'anonymous'
}

const buildBucketKey = (scope: string, key: string) => `${scope}:${key}`

const cleanupExpiredBuckets = (now: number) => {
    for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
            buckets.delete(key)
        }
    }
}

const consumeBucket = (bucketKey: string, limit: number, windowMs: number): McpRateLimitResult => {
    const now = Date.now()
    cleanupExpiredBuckets(now)

    const existingBucket = buckets.get(bucketKey)
    if (!existingBucket || existingBucket.resetAt <= now) {
        const resetAt = now + windowMs
        buckets.set(bucketKey, {
            count: 1,
            resetAt,
        })

        return {
            limited: false,
            limit,
            remaining: Math.max(limit - 1, 0),
            retryAfterSeconds: Math.ceil(windowMs / 1000),
            resetAt,
            key: bucketKey,
        }
    }

    if (existingBucket.count >= limit) {
        return {
            limited: true,
            limit,
            remaining: 0,
            retryAfterSeconds: Math.max(Math.ceil((existingBucket.resetAt - now) / 1000), 1),
            resetAt: existingBucket.resetAt,
            key: bucketKey,
        }
    }

    existingBucket.count += 1
    buckets.set(bucketKey, existingBucket)

    return {
        limited: false,
        limit,
        remaining: Math.max(limit - existingBucket.count, 0),
        retryAfterSeconds: Math.max(Math.ceil((existingBucket.resetAt - now) / 1000), 1),
        resetAt: existingBucket.resetAt,
        key: bucketKey,
    }
}

export const checkAndConsumeMcpRateLimit = (
    request: Request,
    options: {
        method: string
        toolName?: string | null
    }
): McpRateLimitResult | null => {
    if (!isSmeMcpRateLimitEnabled()) {
        return null
    }

    const windowMs = getRateLimitWindowMs()
    const identityKey = resolveRateLimitKey(request)
    const scope = options.method === 'tools/call' ? 'tool-call' : 'general'
    const limit = options.method === 'tools/call' ? getToolCallLimit() : getGeneralRequestLimit()

    return consumeBucket(buildBucketKey(scope, identityKey), limit, windowMs)
}
