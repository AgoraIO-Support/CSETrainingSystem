'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ApiClient } from '@/lib/api-client'
import {
    Lightbulb,
    Code,
    PlayCircle,
    Star,
    Clock,
    ChevronDown,
    ChevronUp
} from 'lucide-react'

interface KnowledgeAnchor {
    id: string
    timestamp: number
    timestampStr: string
    title: string
    summary: string
    keyTerms: string[]
    anchorType: 'CONCEPT' | 'EXAMPLE' | 'DEMO' | 'KEY_TAKEAWAY'
    sequenceIndex: number
}

interface KnowledgeAnchorsProps {
    lessonId: string
    currentTime?: number
    onSeekToTimestamp?: (timestamp: string) => void
}

const anchorTypeConfig = {
    CONCEPT: {
        icon: Lightbulb,
        label: 'Concept',
        color: 'bg-[#e8f8ff] text-[#006688]',
        borderColor: 'border-l-[#00c2ff]',
    },
    EXAMPLE: {
        icon: Code,
        label: 'Example',
        color: 'bg-[#eef7f8] text-[#0f5f73]',
        borderColor: 'border-l-[#0f5f73]',
    },
    DEMO: {
        icon: PlayCircle,
        label: 'Demo',
        color: 'bg-[#eff6ff] text-[#1d4d8f]',
        borderColor: 'border-l-[#1d4d8f]',
    },
    KEY_TAKEAWAY: {
        icon: Star,
        label: 'Key Takeaway',
        color: 'bg-[#fff5dc] text-[#9a6a00]',
        borderColor: 'border-l-[#d9a300]',
    },
}

export function KnowledgeAnchors({
    lessonId,
    currentTime = 0,
    onSeekToTimestamp
}: KnowledgeAnchorsProps) {
    const [anchors, setAnchors] = useState<KnowledgeAnchor[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState(true)
    const retryCountRef = useRef(0)
    const retryTimerRef = useRef<number | null>(null)

    useEffect(() => {
        let cancelled = false

        const fetchAnchors = async () => {
            try {
                setLoading(true)
                // ApiClient already prefixes `/api`, so do not include `/api` here.
                const response: any = await ApiClient.request(`/lessons/${lessonId}/anchors`)
                if (!response?.success) {
                    throw new Error(response?.error?.message ?? 'Failed to load key moments')
                }

                const nextAnchors = Array.isArray(response?.data?.anchors) ? response.data.anchors : []
                setAnchors(nextAnchors)

                const status = response?.data?.status as string | undefined
                const shouldRetry =
                    nextAnchors.length === 0 &&
                    (status === 'PROCESSING' || status === 'PENDING' || status === 'MISSING' || status == null)

                if (shouldRetry && retryCountRef.current < 24 && !cancelled) {
                    retryCountRef.current += 1
                    if (retryTimerRef.current) {
                        window.clearTimeout(retryTimerRef.current)
                    }
                    retryTimerRef.current = window.setTimeout(fetchAnchors, 5000)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load key moments')
            } finally {
                setLoading(false)
            }
        }

        if (lessonId) {
            retryCountRef.current = 0
            fetchAnchors()
        }

        return () => {
            cancelled = true
            if (retryTimerRef.current) {
                window.clearTimeout(retryTimerRef.current)
                retryTimerRef.current = null
            }
        }
    }, [lessonId])

    // Find the current anchor based on video time
    const currentAnchorIndex = anchors.findIndex((anchor, index) => {
        const nextAnchor = anchors[index + 1]
        const isAfterStart = currentTime >= anchor.timestamp
        const isBeforeNext = !nextAnchor || currentTime < nextAnchor.timestamp
        return isAfterStart && isBeforeNext
    })

    const handleAnchorClick = (anchor: KnowledgeAnchor) => {
        onSeekToTimestamp?.(anchor.timestampStr)
    }

    return (
        <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-white pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#006688]">
                            <Star className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-base font-semibold text-slate-900">Key Moments</CardTitle>
                        <Badge variant="secondary" className="rounded-full border border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                            {anchors.length}
                        </Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded(!expanded)}
                        className="h-8 w-8 p-0"
                    >
                        {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="pt-0">
                    {loading && (
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map(i => (
                                <Skeleton key={i} className="h-11 w-full rounded-xl" />
                            ))}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="text-sm text-muted-foreground">
                            {error}
                        </div>
                    )}

                    {!loading && !error && anchors.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                            Lesson knowledge preparing…
                        </div>
                    )}

                    {!loading && !error && anchors.length > 0 && (
                        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                            {anchors.map((anchor, index) => {
                                const config = anchorTypeConfig[anchor.anchorType]
                                const Icon = config.icon
                                const isCurrent = index === currentAnchorIndex
                                const safeTitle = (anchor.title || '').trim()
                                const tooltip = [
                                    anchor.title,
                                    anchor.keyTerms?.length ? `Key terms: ${anchor.keyTerms.join(', ')}` : null,
                                ]
                                    .filter(Boolean)
                                    .join('\n')

                                return (
                                    <button
                                        key={anchor.id}
                                        onClick={() => handleAnchorClick(anchor)}
                                        title={tooltip}
                                        className={cn(
                                            'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors',
                                            'hover:border-[#b8ecff] hover:bg-[#f8fdff] focus:outline-none focus:ring-2 focus:ring-[#00c2ff]/25',
                                            isCurrent && 'border-[#7ddfff] bg-[#effbff] ring-1 ring-[#00c2ff]/20'
                                        )}
                                    >
                                        <div className="flex items-start gap-2 min-w-0">
                                            <Badge
                                                variant="outline"
                                                className={cn('shrink-0 border-0 px-1.5 py-0.5 text-[10px]', config.color)}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    <Icon className="h-3 w-3" />
                                                    {config.label}
                                                </span>
                                            </Badge>

                                            <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {anchor.timestampStr}
                                                </span>
                                            </span>

                                            <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-5 text-slate-800">
                                                {safeTitle}
                                            </span>

                                            {isCurrent && (
                                                <Badge variant="default" className="shrink-0 bg-[#006688] px-1.5 py-0.5 text-[10px] text-white">
                                                    Now
                                                </Badge>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    )
}
