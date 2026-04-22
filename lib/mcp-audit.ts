import { AuthUser } from '@/lib/auth-middleware'
import { log } from '@/lib/logger'
import {
    getRequestCallerId,
    getRequestCallerIp,
    isHighRiskStandardMcpTool,
    isSmeMcpAuditLoggingEnabled,
} from '@/lib/mcp-production-policy'

type McpAuditOutcome = 'success' | 'failure'

type McpAuditContext = {
    requestId: string
    method: string
    toolName?: string | null
    callerId?: string | null
    callerIp?: string | null
    userId?: string | null
    userEmail?: string | null
}

const summarizeArguments = (args: unknown) => {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return {
            inputType: Array.isArray(args) ? 'array' : typeof args,
        }
    }

    const entries = Object.entries(args as Record<string, unknown>)
    return {
        inputType: 'object',
        inputKeys: entries.map(([key]) => key).slice(0, 12),
        inputKeyCount: entries.length,
    }
}

export const buildMcpAuditContext = (
    request: Request,
    options: {
        requestId: string
        method: string
        toolName?: string | null
        user?: Pick<AuthUser, 'id' | 'email'> | null
    }
): McpAuditContext => ({
    requestId: options.requestId,
    method: options.method,
    toolName: options.toolName ?? null,
    callerId: getRequestCallerId(request),
    callerIp: getRequestCallerIp(request),
    userId: options.user?.id ?? null,
    userEmail: options.user?.email ?? null,
})

export const logMcpInvocationStart = (
    context: McpAuditContext,
    args?: unknown
) => {
    if (!isSmeMcpAuditLoggingEnabled()) return

    log('API', 'info', 'mcp invocation start', {
        ...context,
        riskLevel: context.toolName && isHighRiskStandardMcpTool(context.toolName) ? 'high' : 'standard',
        ...summarizeArguments(args),
    })
}

export const logMcpInvocationFinish = (
    context: McpAuditContext,
    outcome: McpAuditOutcome,
    durationMs: number,
    extra?: Record<string, unknown>
) => {
    if (!isSmeMcpAuditLoggingEnabled()) return

    log(outcome === 'success' ? 'API' : 'API', outcome === 'success' ? 'info' : 'warn', `mcp invocation ${outcome}`, {
        ...context,
        durationMs,
        riskLevel: context.toolName && isHighRiskStandardMcpTool(context.toolName) ? 'high' : 'standard',
        ...(extra || {}),
    })
}
