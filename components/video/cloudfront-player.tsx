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
