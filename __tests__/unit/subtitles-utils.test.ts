import { getAssetBasename, getUrlBasename, isVttUrl } from '@/lib/video/subtitles'

describe('isVttUrl', () => {
    test('returns true for plain .vtt urls', () => {
        expect(isVttUrl('https://example.com/subtitles/test.vtt')).toBe(true)
        expect(isVttUrl('https://example.com/subtitles/test.VTT')).toBe(true)
        expect(isVttUrl('/subtitles/test.vtt')).toBe(true)
        expect(isVttUrl('test.vtt')).toBe(true)
    })

    test('returns true for signed urls with querystring', () => {
        expect(isVttUrl('https://example.com/subtitles/test.vtt?X-Amz-Signature=abc')).toBe(true)
        expect(isVttUrl('https://example.com/subtitles/test.VTT?Expires=123')).toBe(true)
    })

    test('returns false for non-vtt', () => {
        expect(isVttUrl('https://example.com/videos/test.mp4')).toBe(false)
        expect(isVttUrl('')).toBe(false)
        expect(isVttUrl(null)).toBe(false)
        expect(isVttUrl(undefined)).toBe(false)
    })
})

describe('subtitle basename helpers', () => {
    test('extracts basename from URL', () => {
        expect(getUrlBasename('https://example.com/a/b/ConversationalAIEngineWorkshop.vtt?sig=1')).toBe(
            'conversationalaiengineworkshop'
        )
    })

    test('extracts basename from asset title and matches mp4 vs vtt', () => {
        const video = { title: 'ConversationalAIEngineWorkshop.mp4', url: 'https://example.com/v.mp4' }
        const vtt = { title: 'ConversationalAIEngineWorkshop.vtt', url: 'https://example.com/v.vtt' }
        expect(getAssetBasename(video)).toBe('conversationalaiengineworkshop')
        expect(getAssetBasename(vtt)).toBe('conversationalaiengineworkshop')
    })
})
