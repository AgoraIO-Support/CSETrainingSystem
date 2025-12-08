'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Settings,
    Subtitles
} from 'lucide-react'

interface VideoPlayerProps {
    videoUrl: string
    subtitleUrl?: string
    onTimeUpdate?: (currentTime: number) => void
    initialTime?: number
}

export function VideoPlayer({ videoUrl, subtitleUrl, onTimeUpdate, initialTime }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showSubtitles, setShowSubtitles] = useState(true)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime)
            onTimeUpdate?.(video.currentTime)
        }

        const handleLoadedMetadata = () => {
            setDuration(video.duration)
        }

        video.addEventListener('timeupdate', handleTimeUpdate)
        video.addEventListener('loadedmetadata', handleLoadedMetadata)

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate)
            video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        }
    }, [onTimeUpdate])

    useEffect(() => {
        if (initialTime === undefined) return
        const video = videoRef.current
        if (!video) return

        const seekToInitialTime = () => {
            video.currentTime = initialTime
            setCurrentTime(initialTime)
        }

        if (video.readyState >= 1) {
            seekToInitialTime()
        } else {
            video.addEventListener('loadedmetadata', seekToInitialTime, { once: true } as any)
        }

        return () => {
            video.removeEventListener('loadedmetadata', seekToInitialTime)
        }
    }, [initialTime])

    const togglePlay = () => {
        const video = videoRef.current
        if (!video) return

        if (isPlaying) {
            video.pause()
        } else {
            video.play()
        }
        setIsPlaying(!isPlaying)
    }

    const handleSeek = (value: number[]) => {
        const video = videoRef.current
        if (!video) return
        video.currentTime = value[0]
        setCurrentTime(value[0])
    }

    const handleVolumeChange = (value: number[]) => {
        const video = videoRef.current
        if (!video) return
        const newVolume = value[0]
        video.volume = newVolume
        setVolume(newVolume)
        setIsMuted(newVolume === 0)
    }

    const toggleMute = () => {
        const video = videoRef.current
        if (!video) return

        if (isMuted) {
            video.volume = volume || 0.5
            setIsMuted(false)
        } else {
            video.volume = 0
            setIsMuted(true)
        }
    }

    const toggleFullscreen = () => {
        const video = videoRef.current
        if (!video) return

        if (!isFullscreen) {
            video.requestFullscreen?.()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen?.()
            setIsFullscreen(false)
        }
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className="relative bg-black rounded-lg overflow-hidden group">
            <video
                ref={videoRef}
                className="w-full aspect-video"
                src={videoUrl}
                crossOrigin="anonymous"
            >
                {subtitleUrl && showSubtitles && (
                    <track
                        kind="subtitles"
                        src={subtitleUrl}
                        srcLang="en"
                        label="English"
                        default
                    />
                )}
            </video>

            {/* Controls Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Progress Bar */}
                <div className="mb-4">
                    <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="cursor-pointer"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={togglePlay}
                            className="text-white hover:bg-white/20"
                        >
                            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                        </Button>

                        <div className="flex items-center space-x-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleMute}
                                className="text-white hover:bg-white/20"
                            >
                                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                            </Button>
                            <Slider
                                value={[isMuted ? 0 : volume]}
                                max={1}
                                step={0.1}
                                onValueChange={handleVolumeChange}
                                className="w-24 cursor-pointer"
                            />
                        </div>

                        <span className="text-white text-sm">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>

                    <div className="flex items-center space-x-2">
                        {subtitleUrl && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowSubtitles(!showSubtitles)}
                                className={`text-white hover:bg-white/20 ${showSubtitles ? 'bg-white/20' : ''}`}
                            >
                                <Subtitles className="h-5 w-5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-white hover:bg-white/20"
                        >
                            <Settings className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleFullscreen}
                            className="text-white hover:bg-white/20"
                        >
                            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
