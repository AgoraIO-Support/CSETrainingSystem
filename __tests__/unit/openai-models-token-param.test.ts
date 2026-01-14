import { buildChatCompletionsTokenParam, getChatCompletionsTokenBudget, getChatCompletionsTokenParamName } from '@/lib/services/openai-models'

describe('OpenAI model token param mapping', () => {
    it('uses max_completion_tokens for gpt-5.x', () => {
        expect(getChatCompletionsTokenParamName('gpt-5.2')).toBe('max_completion_tokens')
        expect(getChatCompletionsTokenParamName('gpt-5.1')).toBe('max_completion_tokens')

        const body = buildChatCompletionsTokenParam('gpt-5.2', 123)
        expect((body as any).max_completion_tokens).toBe(123)
        expect((body as any).max_tokens).toBeUndefined()

        const budget = getChatCompletionsTokenBudget('gpt-5.2', 200)
        expect(budget.tokenParam).toBe('max_completion_tokens')
        expect(budget.requestedMaxTokens).toBe(200)
        expect(budget.effectiveMaxTokens).toBeGreaterThanOrEqual(1024)
        expect(budget.param.max_completion_tokens).toBe(budget.effectiveMaxTokens)
    })

    it('uses max_tokens for gpt-4o variants', () => {
        expect(getChatCompletionsTokenParamName('gpt-4o')).toBe('max_tokens')
        expect(getChatCompletionsTokenParamName('gpt-4o-mini')).toBe('max_tokens')

        const body = buildChatCompletionsTokenParam('gpt-4o-mini', 456)
        expect((body as any).max_tokens).toBe(456)
        expect((body as any).max_completion_tokens).toBeUndefined()

        const budget = getChatCompletionsTokenBudget('gpt-4o-mini', 456)
        expect(budget.tokenParam).toBe('max_tokens')
        expect(budget.clamped).toBe(false)
        expect(budget.param.max_tokens).toBe(456)
    })
})
