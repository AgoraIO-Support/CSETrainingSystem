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
