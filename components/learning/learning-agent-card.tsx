'use client'

import { useState } from 'react'
import { Bot, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type LearningAgentPayload =
    | {
        action: 'lesson_coach'
        courseId: string
        lessonId: string
        currentTimestamp?: number
    }
    | {
        action: 'exam_mistake_review'
        examId: string
        attemptId?: string | null
    }
    | {
        action: 'learning_plan'
    }

type LearningAgentCardProps = {
    title: string
    description?: string
    actionLabel?: string
    payload: LearningAgentPayload
    className?: string
}

function renderMarkdownLite(content: string) {
    return content
        .split('\n')
        .map((line, index) => {
            const trimmed = line.trim()
            if (!trimmed) return <br key={index} />
            if (/^#{1,3}\s+/.test(trimmed)) {
                return (
                    <p key={index} className="mt-3 font-semibold text-slate-950 first:mt-0">
                        {trimmed.replace(/^#{1,3}\s+/, '')}
                    </p>
                )
            }
            if (/^[-*]\s+/.test(trimmed)) {
                return (
                    <p key={index} className="pl-4 text-sm leading-6 text-slate-700 before:mr-2 before:content-['-']">
                        {trimmed.replace(/^[-*]\s+/, '')}
                    </p>
                )
            }
            return (
                <p key={index} className="text-sm leading-6 text-slate-700">
                    {trimmed}
                </p>
            )
        })
}

export function LearningAgentCard({
    title,
    description,
    actionLabel = 'Generate',
    payload,
    className,
}: LearningAgentCardProps) {
    const [answer, setAnswer] = useState<string | null>(null)
    const [provider, setProvider] = useState<string | null>(null)
    const [model, setModel] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const run = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await ApiClient.runLearningAgentAction(payload)
            setAnswer(response.data.answer)
            setProvider(response.data.provider)
            setModel(response.data.model)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Learning Agent failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className={cn('border-slate-200 shadow-none', className)}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Bot className="h-4 w-4 text-[#006688]" />
                        {title}
                    </CardTitle>
                    {description && <CardDescription className="mt-1">{description}</CardDescription>}
                </div>
                <Button size="sm" onClick={run} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {answer ? 'Refresh' : actionLabel}
                </Button>
            </CardHeader>
            {(error || answer) && (
                <CardContent className="space-y-3">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {answer && (
                        <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
                            <div className="prose prose-sm max-w-none">
                                {renderMarkdownLite(answer)}
                            </div>
                            {(provider || model) && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {provider && <Badge variant="outline">{provider}</Badge>}
                                    {model && <Badge variant="secondary">{model}</Badge>}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    )
}
