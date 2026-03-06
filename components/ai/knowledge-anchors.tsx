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
        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        borderColor: 'border-l-blue-500',
    },
    EXAMPLE: {
        icon: Code,
        label: 'Example',
        color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        borderColor: 'border-l-green-500',
    },
    DEMO: {
        icon: PlayCircle,
        label: 'Demo',
        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
        borderColor: 'border-l-purple-500',
    },
    KEY_TAKEAWAY: {
        icon: Star,
        label: 'Key Takeaway',
        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        borderColor: 'border-l-amber-500',
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

    const normalizeTitleForDisplay = (value: string) => {
        const raw = (value || '').trim()
        const withoutPrefix = raw.replace(/^Section\\s+\\d+\\s*:\\s*/i, '')
        const withoutTrailingEllipsis = withoutPrefix.replace(/\\s*(…|\\.\\.\\.)\\s*$/g, '').trim()
        return withoutTrailingEllipsis
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Star className="h-5 w-5 text-amber-500" />
                        <CardTitle className="text-base">Key Moments</CardTitle>
                        <Badge variant="secondary" className="text-xs">
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
                                <Skeleton key={i} className="h-9 w-full" />
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
                                const safeTitle = normalizeTitleForDisplay(anchor.title)
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
                                            'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                                            'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
                                            isCurrent && 'bg-muted/50 ring-1 ring-ring/30'
                                        )}
                                    >
                                        <div className="flex items-start gap-2 min-w-0">
                                            <Badge
                                                variant="outline"
                                                className={cn('shrink-0 text-[10px] px-1.5 py-0.5', config.color)}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    <Icon className="h-3 w-3" />
                                                    {config.label}
                                                </span>
                                            </Badge>

                                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {anchor.timestampStr}
                                                </span>
                                            </span>

                                            <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-5">
                                                {safeTitle}
                                            </span>

                                            {isCurrent && (
                                                <Badge variant="default" className="shrink-0 text-[10px] px-1.5 py-0.5">
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
