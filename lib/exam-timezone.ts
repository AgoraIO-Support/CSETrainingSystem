export const DEFAULT_EXAM_TIMEZONE = 'UTC'

const FALLBACK_TIME_ZONES = [
    'UTC',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Africa/Johannesburg',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Sao_Paulo',
    'America/Mexico_City',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland',
] as const

type DateParts = {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const getFormatter = (timeZone: string) => {
    const cacheKey = timeZone
    const existing = formatterCache.get(cacheKey)
    if (existing) return existing

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    })

    formatterCache.set(cacheKey, formatter)
    return formatter
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const parseLocalDateTime = (value: string): DateParts => {
    const match = DATETIME_LOCAL_RE.exec(value.trim())
    if (!match) {
        throw new Error('INVALID_EXAM_DATETIME_FORMAT')
    }

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: Number(match[6] ?? '0'),
    }
}

const partsToUtcMillis = (parts: DateParts) =>
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)

const getZonedParts = (date: Date, timeZone: string): DateParts => {
    const parts = getFormatter(timeZone).formatToParts(date)
    const lookup = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value ?? '0')

    return {
        year: lookup('year'),
        month: lookup('month'),
        day: lookup('day'),
        hour: lookup('hour'),
        minute: lookup('minute'),
        second: lookup('second'),
    }
}

const sameParts = (left: DateParts, right: DateParts) =>
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second

export const isValidExamTimeZone = (value: string) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
        return true
    } catch {
        return false
    }
}

export const normalizeExamTimeZone = (value?: string | null) => {
    const normalized = value?.trim()
    if (normalized && isValidExamTimeZone(normalized)) {
        return normalized
    }
    return DEFAULT_EXAM_TIMEZONE
}

export const getBrowserTimeZone = () => {
    try {
        return normalizeExamTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    } catch {
        return DEFAULT_EXAM_TIMEZONE
    }
}

export const getExamTimeZoneOptions = () => {
    try {
        if (typeof Intl.supportedValuesOf === 'function') {
            return Array.from(new Set([DEFAULT_EXAM_TIMEZONE, ...Intl.supportedValuesOf('timeZone')]))
        }
    } catch {
        // Fall through to fallback list.
    }

    return [...FALLBACK_TIME_ZONES]
}

export const localDateTimeToUtc = (localDateTime: string, timeZone: string) => {
    const safeTimeZone = normalizeExamTimeZone(timeZone)
    const targetParts = parseLocalDateTime(localDateTime)
    let guess = partsToUtcMillis(targetParts)

    for (let index = 0; index < 6; index += 1) {
        const actualParts = getZonedParts(new Date(guess), safeTimeZone)
        const diff = partsToUtcMillis(targetParts) - partsToUtcMillis(actualParts)
        if (diff === 0) {
            const candidate = new Date(guess)
            if (!sameParts(getZonedParts(candidate, safeTimeZone), targetParts)) {
                throw new Error('INVALID_EXAM_LOCAL_TIME')
            }
            return candidate
        }
        guess += diff
    }

    const candidate = new Date(guess)
    if (!sameParts(getZonedParts(candidate, safeTimeZone), targetParts)) {
        throw new Error('INVALID_EXAM_LOCAL_TIME')
    }

    return candidate
}

export const optionalLocalDateTimeToUtc = (value: string | null | undefined, timeZone: string) => {
    if (!value) return undefined
    return localDateTimeToUtc(value, timeZone)
}

export const optionalNullableLocalDateTimeToUtc = (value: string | null | undefined, timeZone: string) => {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    return localDateTimeToUtc(value, timeZone)
}

export const assertExamTimeRange = (availableFrom?: Date | null, deadline?: Date | null) => {
    if (availableFrom && deadline && availableFrom.getTime() >= deadline.getTime()) {
        throw new Error('INVALID_EXAM_TIME_RANGE')
    }
}

export const utcToLocalDateTimeInputValue = (value: Date | string | null | undefined, timeZone: string) => {
    if (!value) return ''
    const zoned = getZonedParts(typeof value === 'string' ? new Date(value) : value, normalizeExamTimeZone(timeZone))
    return `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}T${pad2(zoned.hour)}:${pad2(zoned.minute)}`
}

type FormatOptions = {
    includeTimeZoneName?: boolean
}

export const formatDateTimeInExamTimeZone = (
    value: Date | string,
    timeZone: string,
    options: FormatOptions = {}
) =>
    new Intl.DateTimeFormat('en-US', {
        timeZone: normalizeExamTimeZone(timeZone),
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        ...(options.includeTimeZoneName ? { timeZoneName: 'short' } : {}),
    }).format(typeof value === 'string' ? new Date(value) : value)

export const buildExamScheduleDisplay = (
    value: Date | string | null | undefined,
    examTimeZone: string,
    viewerTimeZone?: string
) => {
    if (!value) return null

    const normalizedExamTimeZone = normalizeExamTimeZone(examTimeZone)
    const normalizedViewerTimeZone = normalizeExamTimeZone(viewerTimeZone ?? getBrowserTimeZone())

    return {
        localLabel: formatDateTimeInExamTimeZone(value, normalizedViewerTimeZone, { includeTimeZoneName: true }),
        examLabel: formatDateTimeInExamTimeZone(value, normalizedExamTimeZone, { includeTimeZoneName: true }),
        examTimeZone: normalizedExamTimeZone,
        viewerTimeZone: normalizedViewerTimeZone,
    }
}
