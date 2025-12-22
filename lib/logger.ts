type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogCategory = 'API' | 'DB' | 'S3' | 'OpenAI' | 'AIService' | 'KnowledgeContext'

const DEFAULT_ENABLED = process.env.NODE_ENV !== 'production'

const parseEnabledCategories = (): Set<string> | 'all' | 'none' => {
    const raw = process.env.CSE_LOG
    if (raw == null || raw.trim() === '') {
        return DEFAULT_ENABLED ? 'all' : 'none'
    }

    const normalized = raw.trim().toLowerCase()
    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'none') return 'none'
    if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'all') return 'all'

    return new Set(
        normalized
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    )
}

const enabledCategories = parseEnabledCategories()

const shouldLogCategory = (category: LogCategory) => {
    if (enabledCategories === 'all') return true
    if (enabledCategories === 'none') return false
    return enabledCategories.has(category.toLowerCase())
}

const MAX_META_CHARS = (() => {
    const raw = process.env.CSE_LOG_MAX_CHARS
    if (!raw) return 4000
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return 4000
    if (n === 0) return Number.POSITIVE_INFINITY
    return Math.max(500, n)
})()
const REDACT_KEYS = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'token',
    'accesstoken',
    'refreshtoken',
    'apikey',
    'openai_api_key',
    'aws_access_key_id',
    'aws_secret_access_key',
    'secretaccesskey',
    'accesskeyid',
    'privatekey',
    'password',
    'jwt',
    'jwt_secret',
])

const safeStringify = (value: unknown) => {
    try {
        const text = JSON.stringify(
            value,
            (key, val) => {
                if (REDACT_KEYS.has(key.toLowerCase())) return '[REDACTED]'
                return val
            }
        )
        if (text.length > MAX_META_CHARS) return text.slice(0, MAX_META_CHARS) + '…(truncated)'
        return text
    } catch {
        return '"[Unserializable meta]"'
    }
}

export const log = (
    category: LogCategory,
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
) => {
    if (!shouldLogCategory(category)) return

    const payload = {
        t: new Date().toISOString(),
        level,
        category,
        message,
        ...(meta ? { meta } : {}),
    }

    const line = safeStringify(payload)

    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else if (level === 'debug') console.debug(line)
    else console.log(line)
}

export const timeAsync = async <T>(
    category: LogCategory,
    message: string,
    meta: Record<string, unknown>,
    fn: () => Promise<T>
): Promise<T> => {
    const startedAt = Date.now()
    try {
        const result = await fn()
        log(category, 'info', message, { ...meta, durationMs: Date.now() - startedAt })
        return result
    } catch (error) {
        log(category, 'error', message, {
            ...meta,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        })
        throw error
    }
}
