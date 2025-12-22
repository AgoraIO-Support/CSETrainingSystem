import { PrismaClient } from '@prisma/client'
import { log } from './logger.js'

export const prisma = new PrismaClient({
  log: process.env.CSE_DB_QUERY_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})

const enableDbLog =
  process.env.NODE_ENV !== 'production' ||
  process.env.CSE_DB_LOG === '1' ||
  (process.env.CSE_LOG?.toLowerCase().includes('db') ?? false)

if (enableDbLog) {
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
