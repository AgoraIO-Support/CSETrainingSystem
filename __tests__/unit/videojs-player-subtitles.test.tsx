/**
 * @jest-environment jsdom
 */

import { render, waitFor } from '@testing-library/react'
import { VideoJSPlayer } from '@/components/video/videojs-player'

jest.mock('video.js', () => {
    const videojs = jest.fn((_: any, options: any, onReady?: any) => {
        ;(globalThis as any).__videojs_lastOptions = options

        const textTrack = { mode: 'disabled' }

        const player = {
            on: jest.fn(),
            src: jest.fn(),
            remoteTextTracks: jest.fn(() => ({ length: 0 })),
            removeRemoteTextTrack: jest.fn(),
            addRemoteTextTrack: jest.fn(() => ({ track: textTrack })),
            isDisposed: jest.fn(() => false),
            dispose: jest.fn(),
            currentTime: jest.fn(),
            paused: jest.fn(() => true),
            play: jest.fn(),
            error: jest.fn(() => null),
        }

        ;(globalThis as any).__videojs_lastPlayer = player

        if (typeof onReady === 'function') {
            onReady.call(player)
        }
        return player
    })

    return videojs
})

describe('VideoJSPlayer subtitles', () => {
    test('shows subs/caps toggle and does not auto-enable subtitles', async () => {
        render(
            <VideoJSPlayer
                videoUrl="https://example.com/video.mp4"
                subtitleUrl="https://example.com/subtitles/test.vtt?X-Amz-Signature=abc"
            />
        )

        await waitFor(() => {
            expect((globalThis as any).__videojs_lastOptions).toBeTruthy()
        })

        const options = (globalThis as any).__videojs_lastOptions
        expect(options.controlBar.children).toContain('subsCapsButton')
        expect(options.tracks).toHaveLength(1)
        expect(options.tracks[0].src).toContain('test.vtt')

        const player = (globalThis as any).__videojs_lastPlayer
        await waitFor(() => {
            expect(player.addRemoteTextTrack).toHaveBeenCalled()
        })

        const [track] = player.addRemoteTextTrack.mock.calls[0]
        expect(track.kind).toBe('subtitles')
        expect(track.default).toBe(false)
    })
})
