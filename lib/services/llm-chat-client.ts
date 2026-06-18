import { log, timeAsync } from '@/lib/logger'
import {
    estimateChatCompletionsCostUsd,
    extractChatCompletionsText,
    getChatCompletionsTokenBudget,
    getDefaultLLMProvider,
    isLLMProviderId,
    type ChatCompletionsTokenBudget,
    type LLMProviderId,
} from '@/lib/services/openai-models'

export type LLMChatMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export type LLMChatCompletionParams = {
    provider?: LLMProviderId | string | null
    model: string
    messages: LLMChatMessage[]
    temperature?: number
    maxTokens: number
    responseFormat?: 'TEXT' | 'JSON_OBJECT'
    signal?: AbortSignal
    logContext?: Record<string, unknown>
}

export type LLMChatCompletionResult = {
    content: string
    model: string
    provider: LLMProviderId
    finishReason?: string
    usage?: {
        totalTokens?: number
        promptTokens?: number
        completionTokens?: number
        cachedTokens?: number
    }
    tokenBudget: ChatCompletionsTokenBudget
    raw?: unknown
}

type ProviderRuntimeConfig = {
    provider: LLMProviderId
    label: string
    apiKey: string
    url: string
    requiresStream: boolean
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '')
}

function trimLeadingSlash(value: string): string {
    return value.replace(/^\/+/, '')
}

export function resolveLLMProvider(provider?: string | null): LLMProviderId {
    const normalized = provider?.trim().toLowerCase()
    return isLLMProviderId(normalized) ? normalized : getDefaultLLMProvider()
}

export function getLLMProviderConfig(providerInput?: string | null): ProviderRuntimeConfig {
    const provider = resolveLLMProvider(providerInput)
    if (provider === 'vexke') {
        const baseUrl = trimTrailingSlash(process.env.VEXKE_BASE_URL || 'https://v2.vexke.com/openai/v1')
        const path = trimLeadingSlash(process.env.VEXKE_CHAT_COMPLETIONS_PATH || '/chat/completions')
        return {
            provider,
            label: 'Vexke',
            apiKey: process.env.VEXKE_API_KEY || '',
            url: `${baseUrl}/${path}`,
            requiresStream: true,
        }
    }

    const baseUrl = trimTrailingSlash(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
    return {
        provider: 'openai',
        label: 'OpenAI',
        apiKey: process.env.OPENAI_API_KEY || '',
        url: `${baseUrl}/chat/completions`,
        requiresStream: false,
    }
}

function getMissingApiKeyErrorCode(provider: LLMProviderId): string {
    return provider === 'vexke' ? 'VEXKE_API_KEY_MISSING' : 'OPENAI_API_KEY_MISSING'
}

function buildRequestBody(params: LLMChatCompletionParams, budget: ChatCompletionsTokenBudget, stream: boolean) {
    return {
        model: params.model,
        messages: params.messages,
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(params.responseFormat === 'JSON_OBJECT' ? { response_format: { type: 'json_object' } } : {}),
        ...budget.param,
        ...(stream ? { stream: true } : {}),
    }
}

function normalizeUsage(data: any): LLMChatCompletionResult['usage'] {
    const usage = data?.usage
    if (!usage) return undefined
    return {
        totalTokens: usage.total_tokens,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens,
    }
}

function logUsage(provider: LLMProviderId, model: string, usage: LLMChatCompletionResult['usage'], context?: Record<string, unknown>) {
    if (!usage) {
        log('OpenAI', 'info', 'chat.completions usage unavailable', { provider, model, ...context })
        return
    }
    const costEstimate = estimateChatCompletionsCostUsd(model, {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
    })
    log('OpenAI', 'info', 'chat.completions usage', {
        provider,
        model,
        totalTokens: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
        uncachedPromptTokens: costEstimate.uncachedPromptTokens,
        estimatedCostUsd: costEstimate.estimatedCostUsd,
        pricingApplied: costEstimate.pricingApplied,
        ...context,
    })
}

async function parseStreamingChatCompletion(response: Response): Promise<{
    content: string
    model?: string
    finishReason?: string
    usage?: LLMChatCompletionResult['usage']
    chunks: unknown[]
}> {
    if (!response.body) {
        throw new Error('LLM_STREAM_BODY_MISSING')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let model: string | undefined
    let finishReason: string | undefined
    let usage: LLMChatCompletionResult['usage']
    const chunks: unknown[] = []

    const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') return

        const chunk = JSON.parse(payload)
        chunks.push(chunk)
        if (typeof chunk.model === 'string') model = chunk.model
        if (chunk.usage) usage = normalizeUsage(chunk)

        const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : null
        if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
        const deltaContent = choice?.delta?.content
        if (typeof deltaContent === 'string') {
            content += deltaContent
        } else if (Array.isArray(deltaContent)) {
            content += deltaContent
                .map((part: unknown) => {
                    if (typeof part === 'string') return part
                    if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
                        return (part as { text: string }).text
                    }
                    return ''
                })
                .join('')
        }
    }

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) handleLine(line)
    }

    buffer += decoder.decode()
    for (const line of buffer.split(/\r?\n/)) handleLine(line)

    return { content: content.trim(), model, finishReason, usage, chunks }
}

async function executeChatCompletion(
    providerConfig: ProviderRuntimeConfig,
    params: LLMChatCompletionParams,
    maxTokens: number,
    attempt: 1 | 2
): Promise<LLMChatCompletionResult> {
    const budget = getChatCompletionsTokenBudget(params.model, maxTokens)
    const requestBody = buildRequestBody(params, budget, providerConfig.requiresStream)
    const logContent = process.env.CSE_OPENAI_LOG_CONTENT === '1'
    const logContext = {
        provider: providerConfig.provider,
        url: providerConfig.url,
        model: params.model,
        stream: providerConfig.requiresStream,
        attempt,
        tokenParam: budget.tokenParam,
        requestedMaxTokens: budget.requestedMaxTokens,
        effectiveMaxTokens: budget.effectiveMaxTokens,
        clamped: budget.clamped,
        messagesCount: params.messages.length,
        ...params.logContext,
    }

    log('OpenAI', 'info', 'chat.completions request', logContext)
    if (logContent) {
        log('OpenAI', 'debug', 'chat.completions request body', { provider: providerConfig.provider, body: requestBody })
    }

    const response = await timeAsync('OpenAI', 'chat.completions response', logContext, () =>
        fetch(providerConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${providerConfig.apiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: params.signal,
        })
    )

    if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        log('OpenAI', 'error', 'chat.completions error', {
            provider: providerConfig.provider,
            status: response.status,
            bodyPreview: errorText.slice(0, 500),
            ...params.logContext,
        })
        if (logContent) {
            log('OpenAI', 'error', 'chat.completions error body', {
                provider: providerConfig.provider,
                status: response.status,
                body: errorText,
            })
        }
        throw new Error(`${providerConfig.label} error: ${response.status}`)
    }

    if (providerConfig.requiresStream) {
        const streamResult = await parseStreamingChatCompletion(response)
        if (logContent) {
            log('OpenAI', 'debug', 'chat.completions stream chunks', {
                provider: providerConfig.provider,
                chunks: streamResult.chunks,
            })
        }
        const model = streamResult.model || params.model
        logUsage(providerConfig.provider, model, streamResult.usage, params.logContext)
        return {
            content: streamResult.content,
            model,
            provider: providerConfig.provider,
            finishReason: streamResult.finishReason,
            usage: streamResult.usage,
            tokenBudget: budget,
            raw: streamResult.chunks,
        }
    }

    const data = await response.json()
    if (logContent) {
        log('OpenAI', 'debug', 'chat.completions raw response', { provider: providerConfig.provider, response: data })
    }

    const extracted = extractChatCompletionsText(data)
    const model = data.model || params.model
    const usage = normalizeUsage(data)
    logUsage(providerConfig.provider, model, usage, params.logContext)

    return {
        content: extracted.text || '',
        model,
        provider: providerConfig.provider,
        finishReason: data.choices?.[0]?.finish_reason,
        usage,
        tokenBudget: budget,
        raw: data,
    }
}

export async function createLLMChatCompletion(params: LLMChatCompletionParams): Promise<LLMChatCompletionResult> {
    const providerConfig = getLLMProviderConfig(params.provider)
    if (!providerConfig.apiKey) {
        throw new Error(getMissingApiKeyErrorCode(providerConfig.provider))
    }

    let result = await executeChatCompletion(providerConfig, params, params.maxTokens, 1)

    if (
        !result.content &&
        !providerConfig.requiresStream &&
        result.tokenBudget.tokenParam === 'max_completion_tokens' &&
        result.finishReason === 'length'
    ) {
        const retryMaxTokens = Math.min(8192, Math.max(4096, result.tokenBudget.effectiveMaxTokens * 2))
        if (retryMaxTokens > result.tokenBudget.effectiveMaxTokens) {
            log('OpenAI', 'warn', 'chat.completions retrying due to empty content', {
                provider: providerConfig.provider,
                model: result.model,
                finishReason: result.finishReason,
                previousMaxCompletionTokens: result.tokenBudget.effectiveMaxTokens,
                retryMaxCompletionTokens: retryMaxTokens,
                ...params.logContext,
            })
            result = await executeChatCompletion(providerConfig, params, retryMaxTokens, 2)
        }
    }

    if (!result.content) {
        log('OpenAI', 'error', 'chat.completions missing message content', {
            provider: providerConfig.provider,
            model: result.model,
            finishReason: result.finishReason,
            ...params.logContext,
        })
    }

    return result
}
