'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, FileText, FileQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TranscriptItem {
    time: number
    text: string
}

interface TranscriptPanelProps {
    transcript: TranscriptItem[]
    currentTime?: number
    onSeek?: (time: number) => void
    isLoading?: boolean
}

export function TranscriptPanel({
    transcript,
    currentTime = 0,
    onSeek,
    isLoading = false
}: TranscriptPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    const handleTranscriptClick = (time: number) => {
        onSeek?.(time)
    }

    // Loading state
    if (isLoading) {
        return (
            <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div className="flex items-center space-x-2">
                        <FileText className="h-5 w-5" />
                        <CardTitle className="text-lg">Transcript</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={`skeleton-${i}`} className="animate-pulse">
                                <div className="flex items-start space-x-3">
                                    <div className="h-4 w-12 bg-muted rounded" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-muted rounded w-full" />
                                        <div className="h-4 bg-muted rounded w-3/4" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Empty state
    if (!transcript || transcript.length === 0) {
        return (
            <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div className="flex items-center space-x-2">
                        <FileText className="h-5 w-5" />
                        <CardTitle className="text-lg">Transcript</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileQuestion className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                            No transcript available for this lesson.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <CardTitle className="text-lg">Transcript</CardTitle>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </CardHeader>
            {isExpanded && (
                <CardContent className="max-h-96 overflow-y-auto">
                    <div className="space-y-3">
                        {transcript.map((item, index) => {
                            const isActive = currentTime >= item.time &&
                                (index === transcript.length - 1 || currentTime < transcript[index + 1].time)

                            return (
                                <button
                                    key={`transcript-${index}-${item.time.toFixed(2)}`}
                                    onClick={() => handleTranscriptClick(item.time)}
                                    className={cn(
                                        "w-full text-left p-3 rounded-lg transition-colors hover:bg-accent",
                                        isActive && "bg-primary/10 border-l-4 border-primary"
                                    )}
                                >
                                    <div className="flex items-start space-x-3">
                                        <span className="text-xs text-muted-foreground font-mono min-w-[50px]">
                                            {Math.floor(item.time / 60)}:{(item.time % 60).toString().padStart(2, '0')}
                                        </span>
                                        <p className={cn(
                                            "text-sm",
                                            isActive ? "font-medium text-foreground" : "text-muted-foreground"
                                        )}>
                                            {item.text}
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </CardContent>
            )}
        </Card>
    )
}
