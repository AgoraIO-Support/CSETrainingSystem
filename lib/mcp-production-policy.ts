import { smeMcpToolMetadataByName } from '@/lib/sme-mcp-tool-metadata'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

const readBooleanEnv = (name: string, fallback: boolean) => {
    const rawValue = process.env[name]
    if (!rawValue) return fallback

    const normalized = rawValue.trim().toLowerCase()
    if (TRUE_VALUES.has(normalized)) return true
    if (FALSE_VALUES.has(normalized)) return false
    return fallback
}

const readCsvEnv = (name: string) =>
    (process.env[name] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

const PRIMARY_STANDARD_MCP_TOOL_NAMES = new Set([
    'list_my_workspace',
    'create_badge',
    'create_series',
    'create_event',
    'create_course',
    'design_course',
    'create_exam',
    'design_exam_questions',
    'review_event_status',
    'share_course_with_learners',
    'publish_exam_for_learners',
])

const HIGH_RISK_TOOL_NAMES = new Set([
    'share_course_with_learners',
    'publish_exam_for_learners',
    'prepare_transcript_upload',
    'process_transcript_knowledge',
])

const CALLER_ID_HEADER = 'x-mcp-caller-id'

export const isSmeMcpProdMode = () =>
    readBooleanEnv('SME_MCP_PROD_MODE', process.env.NODE_ENV === 'production')

export const isSmeMcpFallbackUserDisabled = () =>
    readBooleanEnv('SME_MCP_DISABLE_FALLBACK_USER', isSmeMcpProdMode())

export const areTrustedProxyHeadersEnabled = () =>
    readBooleanEnv('SME_MCP_TRUST_PROXY_HEADERS', isSmeMcpProdMode())

export const areAdvancedSmeMcpToolsEnabled = () =>
    readBooleanEnv('SME_MCP_ENABLE_ADVANCED_TOOLS', !isSmeMcpProdMode())

export const areInsightSmeMcpToolsEnabled = () =>
    readBooleanEnv('SME_MCP_ENABLE_INSIGHT_TOOLS', !isSmeMcpProdMode())

export const isSmeMcpAuditLoggingEnabled = () =>
    readBooleanEnv('SME_MCP_AUDIT_LOGGING', isSmeMcpProdMode())

export const isSmeMcpRateLimitEnabled = () =>
    readBooleanEnv('SME_MCP_RATE_LIMIT_ENABLED', isSmeMcpProdMode())

export const getAllowedMcpCallerIps = () => readCsvEnv('SME_MCP_ALLOWED_CALLER_IPS')

export const getAllowedMcpCallerIds = () => readCsvEnv('SME_MCP_ALLOWED_CALLER_IDS')

export const isSmeMcpCallerRestrictionsConfigured = () =>
    getAllowedMcpCallerIps().length > 0 || getAllowedMcpCallerIds().length > 0

export const getMcpCallerIdHeader = () => CALLER_ID_HEADER

export const getRequestCallerIp = (request: Request) => {
    const xForwardedFor = request.headers.get('x-forwarded-for')
    if (xForwardedFor) {
        const firstIp = xForwardedFor
            .split(',')
            .map((value) => value.trim())
            .find(Boolean)
        if (firstIp) return firstIp
    }

    return request.headers.get('x-real-ip')?.trim() || null
}

export const getRequestCallerId = (request: Request) =>
    request.headers.get(CALLER_ID_HEADER)?.trim() || null

export const isTrustedMcpCaller = (request: Request) => {
    const allowedIps = getAllowedMcpCallerIps()
    const allowedCallerIds = getAllowedMcpCallerIds()
    const callerIp = getRequestCallerIp(request)
    const callerId = getRequestCallerId(request)

    if (allowedIps.length === 0 && allowedCallerIds.length === 0) {
        return false
    }

    if (callerIp && allowedIps.includes(callerIp)) {
        return true
    }

    if (callerId && allowedCallerIds.includes(callerId)) {
        return true
    }

    return false
}

export const isHighRiskStandardMcpTool = (toolName: string) => HIGH_RISK_TOOL_NAMES.has(toolName)

export const isToolExposedOnStandardMcpServer = (toolName: string) => {
    const metadata = smeMcpToolMetadataByName[toolName as keyof typeof smeMcpToolMetadataByName]
    if (!metadata) return false

    if (metadata.productionVisible !== undefined) {
        return metadata.productionVisible
    }

    if (PRIMARY_STANDARD_MCP_TOOL_NAMES.has(toolName)) {
        return true
    }

    if (metadata.category === 'advanced') {
        return areAdvancedSmeMcpToolsEnabled()
    }

    if (metadata.category === 'insights') {
        return areInsightSmeMcpToolsEnabled()
    }

    return !isSmeMcpProdMode()
}
