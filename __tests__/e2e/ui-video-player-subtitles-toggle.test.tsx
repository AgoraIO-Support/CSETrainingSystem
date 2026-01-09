/** @jest-environment jsdom */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { VideoJSPlayer } from '@/components/video/videojs-player'

jest.mock('video.js', () => {
  const videojs = jest.fn((_: any, __: any, onReady?: any) => {
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

    ;(globalThis as any).__videojs_player = player
    ;(globalThis as any).__videojs_textTrack = textTrack

    if (typeof onReady === 'function') onReady.call(player)
    return player
  })

  return videojs
})

describe('Frontend E2E: Video subtitles UI', () => {
  it('does not render an extra Subtitles button overlay (uses Video.js controls)', async () => {
    render(
      <VideoJSPlayer
        videoUrl="https://example.com/video.mp4"
        subtitleUrl="https://example.com/subtitles/test.vtt?X-Amz-Signature=abc"
      />
    )

    expect(screen.queryByRole('button', { name: 'Subtitles' })).toBeNull()
  })
})
