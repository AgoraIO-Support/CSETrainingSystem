'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

let seekButtonsRegistered = false

const registerSeekButtons = () => {
    if (seekButtonsRegistered) return

    const VjsButton = videojs.getComponent('Button') as any
    if (!VjsButton) return

    class SeekBackwardFiveButton extends VjsButton {
        constructor(player: Player, options: any) {
            super(player, options)
            this.controlText('Back 5 seconds')
            this.addClass('vjs-seek-backward-5')
        }

        handleClick() {
            const player = this.player_ as Player
            const current = Number(player.currentTime()) || 0
            player.currentTime(Math.max(0, current - 5))
        }
    }

    class SeekForwardFiveButton extends VjsButton {
        constructor(player: Player, options: any) {
            super(player, options)
            this.controlText('Forward 5 seconds')
            this.addClass('vjs-seek-forward-5')
        }

        handleClick() {
            const player = this.player_ as Player
            const current = Number(player.currentTime()) || 0
            const duration = Number(player.duration())
            if (Number.isFinite(duration) && duration > 0) {
                player.currentTime(Math.min(duration, current + 5))
                return
            }
            player.currentTime(current + 5)
        }
    }

    videojs.registerComponent('SeekBackwardFiveButton', SeekBackwardFiveButton as any)
    videojs.registerComponent('SeekForwardFiveButton', SeekForwardFiveButton as any)
    seekButtonsRegistered = true
}

interface VideoJSPlayerProps {
    videoUrl: string
    subtitleUrl?: string
    posterUrl?: string
    onTimeUpdate?: (currentTime: number) => void
    onEnded?: () => void
    onReady?: (player: Player) => void
    initialTime?: number
    autoplay?: boolean
}

export function VideoJSPlayer({
    videoUrl,
    subtitleUrl,
    posterUrl,
    onTimeUpdate,
    onEnded,
    onReady,
    initialTime = 0,
    autoplay = false
}: VideoJSPlayerProps) {
    const videoRef = useRef<HTMLDivElement>(null)
    const playerRef = useRef<Player | null>(null)
    const [isReady, setIsReady] = useState(false)

    // Store callbacks in refs to avoid re-initialization when they change
    const onTimeUpdateRef = useRef(onTimeUpdate)
    const onEndedRef = useRef(onEnded)
    const onReadyRef = useRef(onReady)

    // Keep refs updated with latest callbacks
    useEffect(() => {
        onTimeUpdateRef.current = onTimeUpdate
    }, [onTimeUpdate])

    useEffect(() => {
        onEndedRef.current = onEnded
    }, [onEnded])

    useEffect(() => {
        onReadyRef.current = onReady
    }, [onReady])

    // Determine source type based on URL
    const getSourceType = useCallback((url: string): string => {
        const lowercaseUrl = url.toLowerCase()
        if (lowercaseUrl.includes('.m3u8')) {
            return 'application/x-mpegURL'
        } else if (lowercaseUrl.includes('.mpd')) {
            return 'application/dash+xml'
        } else if (lowercaseUrl.includes('.webm')) {
            return 'video/webm'
        } else if (lowercaseUrl.includes('.ogg') || lowercaseUrl.includes('.ogv')) {
            return 'video/ogg'
        }
        return 'video/mp4'
    }, [])

    // Initialize player only once
    useEffect(() => {
        if (!videoRef.current) return

        // Prevent double initialization
        if (playerRef.current) {
            return
        }

        registerSeekButtons()

        const videoElement = document.createElement('video-js')
        videoElement.classList.add('vjs-big-play-centered', 'vjs-theme-cse')
        videoRef.current.appendChild(videoElement)

        const options: any = {
            autoplay,
            controls: true,
            crossOrigin: 'anonymous',
            responsive: true,
            fluid: true,
            playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
            poster: posterUrl,
            sources: [{
                src: videoUrl,
                type: getSourceType(videoUrl)
            }],
            tracks: subtitleUrl ? [{
                kind: 'subtitles',
                label: 'English',
                srclang: 'en',
                src: subtitleUrl,
                default: false,
            }] : [],
            html5: {
                vhs: {
                    overrideNative: true
                },
                nativeVideoTracks: false,
                nativeAudioTracks: false,
                nativeTextTracks: false
            },
            controlBar: {
                children: [
                    'playToggle',
                    'SeekBackwardFiveButton',
                    'SeekForwardFiveButton',
                    'volumePanel',
                    'currentTimeDisplay',
                    'timeDivider',
                    'durationDisplay',
                    'progressControl',
                    'playbackRateMenuButton',
                    'subsCapsButton',
                    'fullscreenToggle'
                ]
            }
        }

        const player = playerRef.current = videojs(videoElement, options, function onPlayerReady() {
            setIsReady(true)

            // Set initial time
            if (initialTime > 0) {
                this.currentTime(initialTime)
            }

            // Call onReady callback via ref
            onReadyRef.current?.(this)
        })

        // Event handlers - use refs to always get latest callbacks
        player.on('timeupdate', () => {
            const time = player.currentTime()
            if (typeof time === 'number') {
                onTimeUpdateRef.current?.(time)
            }
        })

        player.on('ended', () => {
            onEndedRef.current?.()
        })

        // Error handling
        player.on('error', () => {
            const error = player.error()
            console.error('Video.js error:', error)
            console.error('Video.js error details:', {
                code: error?.code,
                message: error?.message,
                videoUrl
            })
        })

        return () => {
            if (playerRef.current && !playerRef.current.isDisposed()) {
                playerRef.current.dispose()
                playerRef.current = null
            }
        }
    // Only re-initialize if the container ref changes (which it shouldn't)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Handle video URL changes separately
    useEffect(() => {
        const player = playerRef.current
        if (!player || !isReady) return

        player.src({
            src: videoUrl,
            type: getSourceType(videoUrl)
        })
    }, [videoUrl, isReady, getSourceType])

    // Handle subtitle track changes
    useEffect(() => {
        const player = playerRef.current
        if (!player || !isReady) return

        // Remove existing text tracks
        const existingTracks = player.remoteTextTracks() as any
        const trackLength = existingTracks?.length || 0
        for (let i = trackLength - 1; i >= 0; i--) {
            player.removeRemoteTextTrack(existingTracks[i])
        }

        // Add subtitle track if provided
        if (subtitleUrl) {
            player.addRemoteTextTrack({
                kind: 'subtitles',
                label: 'English',
                srclang: 'en',
                src: subtitleUrl,
                default: false
            }, false)
        }
    }, [subtitleUrl, isReady])

    return (
        <div className="relative rounded-lg overflow-hidden bg-black">
            <div data-vjs-player ref={videoRef} />
        </div>
    )
}

export default VideoJSPlayer
