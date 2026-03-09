export const SUPPORTED_OPENAI_MODELS = ['gpt-5.2', 'gpt-5.1', 'gpt-4o', 'gpt-4o-mini'] as const

export type SupportedOpenAIModel = (typeof SUPPORTED_OPENAI_MODELS)[number]

export function isSupportedOpenAIModel(model: string): model is SupportedOpenAIModel {
    return (SUPPORTED_OPENAI_MODELS as readonly string[]).includes(model)
}

export type ChatCompletionsTokenParamName = 'max_tokens' | 'max_completion_tokens'

export function getChatCompletionsTokenParamName(model: string): ChatCompletionsTokenParamName {
    const normalized = model.trim().toLowerCase()
    if (normalized.startsWith('gpt-5')) return 'max_completion_tokens'
    return 'max_tokens'
}

export function buildChatCompletionsTokenParam(model: string, maxTokens: number): Record<ChatCompletionsTokenParamName, number> {
    const key = getChatCompletionsTokenParamName(model)
    return { [key]: maxTokens } as Record<ChatCompletionsTokenParamName, number>
}

export type ChatCompletionsTokenBudget = {
    tokenParam: ChatCompletionsTokenParamName
    requestedMaxTokens: number
    effectiveMaxTokens: number
    clamped: boolean
    param: Record<ChatCompletionsTokenParamName, number>
}

// GPT-5 family can spend completion tokens on reasoning with zero output tokens if the budget is too low.
// Clamp to a safer minimum so the model can emit actual user-visible text.
export const GPT5_MIN_MAX_COMPLETION_TOKENS = 1024

export function getChatCompletionsTokenBudget(model: string, requestedMaxTokens: number): ChatCompletionsTokenBudget {
    const tokenParam = getChatCompletionsTokenParamName(model)

    if (tokenParam === 'max_completion_tokens') {
        const effectiveMaxTokens = Math.max(GPT5_MIN_MAX_COMPLETION_TOKENS, requestedMaxTokens)
        return {
            tokenParam,
            requestedMaxTokens,
            effectiveMaxTokens,
            clamped: effectiveMaxTokens !== requestedMaxTokens,
            param: buildChatCompletionsTokenParam(model, effectiveMaxTokens),
        }
    }

    return {
        tokenParam,
        requestedMaxTokens,
        effectiveMaxTokens: requestedMaxTokens,
        clamped: false,
        param: buildChatCompletionsTokenParam(model, requestedMaxTokens),
    }
}

export type ExtractedChatCompletionText =
    | { text: string; source: 'message.content' | 'message.content.parts' | 'message.refusal' | 'message.tool_calls.arguments' }
    | { text: null; source: 'missing' }

export function extractChatCompletionsText(data: any): ExtractedChatCompletionText {
    const choice = data?.choices?.[0]
    const message = choice?.message

    const refusal = message?.refusal
    if (typeof refusal === 'string' && refusal.trim().length > 0) {
        return { text: refusal.trim(), source: 'message.refusal' }
    }

    const content = message?.content
    if (typeof content === 'string') {
        const trimmed = content.trim()
        if (trimmed.length > 0) return { text: trimmed, source: 'message.content' }
        // empty string => treat as missing (try other fallbacks)
    } else if (Array.isArray(content)) {
        const parts = content
            .map((p: any) => {
                if (typeof p === 'string') return p
                if (p && typeof p.text === 'string') return p.text
                if (p && typeof p.content === 'string') return p.content
                return ''
            })
            .join('')
            .trim()
        if (parts.length > 0) {
            return { text: parts, source: 'message.content.parts' }
        }
    }

    const toolCalls = message?.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const args = toolCalls?.[0]?.function?.arguments
        if (typeof args === 'string' && args.trim().length > 0) {
            return { text: args.trim(), source: 'message.tool_calls.arguments' }
        }
    }

    return { text: null, source: 'missing' }
}

export type ChatModelPricing = {
    inputPer1M: number
    cachedInputPer1M: number
    outputPer1M: number
}

export type ChatUsageForCost = {
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
}

const DEFAULT_CHAT_PRICING: Record<string, ChatModelPricing> = {
    // Keep only broadly stable defaults; override with CSE_OPENAI_CHAT_PRICING_JSON when needed.
    'gpt-4o': { inputPer1M: 2.5, cachedInputPer1M: 1.25, outputPer1M: 10 },
    'gpt-4o-mini': { inputPer1M: 0.15, cachedInputPer1M: 0.075, outputPer1M: 0.6 },
}

let cachedParsedPricingEnvRaw: string | null = null
let cachedParsedPricingEnvValue: Record<string, ChatModelPricing> | null = null

function parsePricingEnv(): Record<string, ChatModelPricing> {
    const raw = (process.env.CSE_OPENAI_CHAT_PRICING_JSON || '').trim()
    if (!raw) return {}
    if (cachedParsedPricingEnvRaw === raw && cachedParsedPricingEnvValue) {
        return cachedParsedPricingEnvValue
    }

    try {
        const parsed = JSON.parse(raw)
        const normalized: Record<string, ChatModelPricing> = {}
        if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
                const inputPer1M = Number(v?.inputPer1M)
                const cachedInputPer1M = Number(v?.cachedInputPer1M)
                const outputPer1M = Number(v?.outputPer1M)
                if (
                    Number.isFinite(inputPer1M) &&
                    Number.isFinite(cachedInputPer1M) &&
                    Number.isFinite(outputPer1M) &&
                    inputPer1M >= 0 &&
                    cachedInputPer1M >= 0 &&
                    outputPer1M >= 0
                ) {
                    normalized[k.toLowerCase()] = { inputPer1M, cachedInputPer1M, outputPer1M }
                }
            }
        }
        cachedParsedPricingEnvRaw = raw
        cachedParsedPricingEnvValue = normalized
        return normalized
    } catch {
        return {}
    }
}

export function resolveChatModelPricing(model: string): ChatModelPricing | null {
    const normalizedModel = model.trim().toLowerCase()
    const envPricing = parsePricingEnv()
    const pricingTable = { ...DEFAULT_CHAT_PRICING, ...envPricing }

    if (pricingTable[normalizedModel]) return pricingTable[normalizedModel]

    // Match versioned model names (e.g. gpt-5.2-2025-12-11).
    let bestMatch: string | null = null
    for (const key of Object.keys(pricingTable)) {
        if (normalizedModel === key || normalizedModel.startsWith(`${key}-`)) {
            if (!bestMatch || key.length > bestMatch.length) bestMatch = key
        }
    }
    return bestMatch ? pricingTable[bestMatch] : null
}

export function estimateChatCompletionsCostUsd(
    model: string,
    usage: ChatUsageForCost
): {
    estimatedCostUsd: number | null
    pricingApplied: ChatModelPricing | null
    uncachedPromptTokens: number
    cachedPromptTokens: number
} {
    const promptTokens = Number.isFinite(usage.promptTokens) ? Math.max(0, Number(usage.promptTokens)) : 0
    const completionTokens = Number.isFinite(usage.completionTokens) ? Math.max(0, Number(usage.completionTokens)) : 0
    const cachedPromptTokens = Number.isFinite(usage.cachedTokens)
        ? Math.min(promptTokens, Math.max(0, Number(usage.cachedTokens)))
        : 0
    const uncachedPromptTokens = Math.max(0, promptTokens - cachedPromptTokens)

    const pricing = resolveChatModelPricing(model)
    if (!pricing) {
        return {
            estimatedCostUsd: null,
            pricingApplied: null,
            uncachedPromptTokens,
            cachedPromptTokens,
        }
    }

    const inputCost = (uncachedPromptTokens / 1_000_000) * pricing.inputPer1M
    const cachedInputCost = (cachedPromptTokens / 1_000_000) * pricing.cachedInputPer1M
    const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M

    return {
        estimatedCostUsd: inputCost + cachedInputCost + outputCost,
        pricingApplied: pricing,
        uncachedPromptTokens,
        cachedPromptTokens,
    }
}
