import { normalizeKnowledgeAnchorTimestampSeconds } from '@/lib/services/knowledge-context.service'

describe('normalizeKnowledgeAnchorTimestampSeconds', () => {
  test('keeps normal seconds values', () => {
    const res = normalizeKnowledgeAnchorTimestampSeconds(123.45678)
    expect(res.seconds).toBe(123.457)
    expect(res.normalizedFrom).toBe('seconds')
    expect(res.clamped).toBe(false)
    expect(res.timestampStr).toBe('00:02:03')
  })

  test('converts large millisecond values to seconds', () => {
    const res = normalizeKnowledgeAnchorTimestampSeconds(7_200_000) // 2h in ms
    expect(res.seconds).toBe(7200)
    expect(res.normalizedFrom).toBe('milliseconds')
    expect(res.clamped).toBe(false)
    expect(res.timestampStr).toBe('02:00:00')
  })

  test('clamps values that still exceed DB max', () => {
    const res = normalizeKnowledgeAnchorTimestampSeconds(9_999_999_999_999) // absurd ms
    expect(res.seconds).toBe(9_999_999.999)
    expect(res.clamped).toBe(true)
  })
})

