import { VTT_MINIMAL, TEST_COURSE_CONTEXT } from '../__fixtures__/sample-vtt'

describe('VTTToXMLService OpenAI logging', () => {
  const originalFetch = global.fetch
  const originalDbUrl = process.env.DATABASE_URL
  const originalOpenAiLog = process.env.CSE_OPENAI_LOG_CONTENT

  afterEach(() => {
    global.fetch = originalFetch
    process.env.DATABASE_URL = originalDbUrl
    process.env.CSE_OPENAI_LOG_CONTENT = originalOpenAiLog
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('emits OpenAI-category logs for the enrichment call', async () => {
    process.env.DATABASE_URL = '' // force resolver fallback; avoid DB access
    process.env.CSE_OPENAI_LOG_CONTENT = '0'

    const mockLog = jest.fn()
    const mockTimeAsync = async (_category: any, _message: any, _meta: any, fn: any) => fn()

    jest.doMock('@/lib/logger', () => ({
      __esModule: true,
      log: (...args: any[]) => mockLog(...args),
      timeAsync: (...args: any[]) => mockTimeAsync(...args),
    }))

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: '[]' } }],
        usage: { total_tokens: 10, prompt_tokens: 7, completion_tokens: 3 },
      }),
    } as any)

    const { VTTToXMLService } = await import('@/lib/services/vtt-to-xml.service')
    const service = new VTTToXMLService('test-key')

    await service.processVTTToKnowledgeBase(VTT_MINIMAL, TEST_COURSE_CONTEXT)

    expect(mockLog).toHaveBeenCalled()
    const openAiInfoCalls = mockLog.mock.calls.filter((c: any[]) => c[0] === 'OpenAI' && c[1] === 'info')
    expect(openAiInfoCalls.length).toBeGreaterThan(0)
    expect(openAiInfoCalls.some((c: any[]) => String(c[2]).includes('vtt-to-xml chat.completions request'))).toBe(true)
  })
})

