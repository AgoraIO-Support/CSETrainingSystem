'use client'

import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

interface Props {
    src: string
    poster?: string
}

export function CloudFrontPlayer({ src, poster }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const isHls = (() => {
            try {
                return new URL(src, window.location.href).pathname.toLowerCase().endsWith('.m3u8')
            } catch {
                return src.toLowerCase().split('?')[0].endsWith('.m3u8')
            }
        })()

        if (!isHls) {
            video.src = src
            return
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src
            return
        }

        if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true })
            hls.loadSource(src)
            hls.attachMedia(video)
            return () => hls.destroy()
        }

        video.src = src
    }, [src])

    return (
        <video
            ref={videoRef}
            className="w-full rounded-lg"
            poster={poster}
            controls
            preload="metadata"
        />
    )
}
