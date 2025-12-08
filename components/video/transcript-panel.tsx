'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TranscriptItem {
    time: number
    text: string
}

interface TranscriptPanelProps {
    transcript?: TranscriptItem[]
    currentTime?: number
    onSeek?: (time: number) => void
}

// Mock transcript data
const mockTranscript: TranscriptItem[] = [
    { time: 0, text: "Welcome to this lesson on Agora SDK fundamentals." },
    { time: 5, text: "In this video, we'll cover the basic concepts you need to know." },
    { time: 12, text: "First, let's talk about what the Agora SDK is and why it's important." },
    { time: 20, text: "The Agora SDK provides real-time video and audio communication capabilities." },
    { time: 30, text: "You can integrate it into your web, mobile, or desktop applications." },
    { time: 40, text: "Let's look at the key components of the SDK." },
    { time: 50, text: "The main components include the RTC engine, channel management, and user roles." },
    { time: 65, text: "We'll dive deeper into each of these in the upcoming sections." },
]

export function TranscriptPanel({
    transcript = mockTranscript,
    currentTime = 0,
    onSeek
}: TranscriptPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    const handleTranscriptClick = (time: number) => {
        onSeek?.(time)
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
                                    key={index}
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
