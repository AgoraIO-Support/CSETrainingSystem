describe('AIPromptResolverService', () => {
  it('renders {{vars}} with strings and objects', async () => {
    const { AIPromptResolverService } = await import('@/lib/services/ai-prompt-resolver.service')
    const out = AIPromptResolverService.render('Hello {{name}} {{obj}}', { name: 'Alice', obj: { a: 1 } })
    expect(out).toContain('Hello Alice')
    expect(out).toContain('"a": 1')
  })

  it('falls back safely when DB is unavailable', async () => {
    jest.resetModules()
    jest.doMock('@/lib/prisma', () => ({
      __esModule: true,
      default: {
        courseAIPromptAssignment: { findUnique: jest.fn().mockRejectedValue(new Error('DB down')) },
        examAIPromptAssignment: { findUnique: jest.fn().mockRejectedValue(new Error('DB down')) },
        aIPromptDefault: { findUnique: jest.fn().mockRejectedValue(new Error('DB down')) },
      },
    }))

    const { AIPromptResolverService } = await import('@/lib/services/ai-prompt-resolver.service')
    const { AIPromptUseCase } = await import('@prisma/client')

    const res = await AIPromptResolverService.resolve({ useCase: AIPromptUseCase.VTT_TO_XML_ENRICHMENT })
    expect(res.source).toBe('fallback')
    expect(res.systemPrompt).toMatch(/educational content analyzer/i)
    expect(res.userPrompt).toBeTruthy()

    jest.dontMock('@/lib/prisma')
    jest.resetModules()
  })
})
