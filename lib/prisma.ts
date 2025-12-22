import { PrismaClient } from '@prisma/client'
import { log } from '@/lib/logger'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
    prismaMiddlewareRegistered?: boolean
}

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log:
            process.env.NODE_ENV === 'development'
                ? [
                      ...(process.env.CSE_DB_QUERY_LOG === '1' ? (['query'] as const) : []),
                      'error',
                      'warn',
                  ]
                : ['error'],
    })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

const enableDbLog =
    process.env.NODE_ENV === 'development' ||
    process.env.CSE_DB_LOG === '1' ||
    (process.env.CSE_LOG?.toLowerCase().includes('db') ?? false)

if (enableDbLog && !globalForPrisma.prismaMiddlewareRegistered) {
    globalForPrisma.prismaMiddlewareRegistered = true
    prisma.$use(async (params, next) => {
        const startedAt = Date.now()
        try {
            const result = await next(params)
            log('DB', 'info', 'prisma', {
                model: params.model,
                action: params.action,
                durationMs: Date.now() - startedAt,
            })
            return result
        } catch (error) {
            log('DB', 'error', 'prisma', {
                model: params.model,
                action: params.action,
                durationMs: Date.now() - startedAt,
                error: error instanceof Error ? error.message : String(error),
            })
            throw error
        }
    })
}

export default prisma
