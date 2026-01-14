'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2, Clock, FileText, RefreshCw } from 'lucide-react'
import { ApiClient } from '@/lib/api-client'

type KnowledgeContextJob = {
    id: string
    state: string
    stage: string
    attempt: number
    maxAttempts: number
    progress: number
    scheduledAt: string
    startedAt: string | null
    finishedAt: string | null
    lastHeartbeatAt: string | null
    workerId: string | null
    errorMessage: string | null
}

type KnowledgeContextStatus = {
    exists: boolean
    status: string | null
    message?: string
    tokenCount?: number
    sectionCount?: number
    anchorCount?: number
    processedAt?: string | null
    errorMessage?: string | null
    job: KnowledgeContextJob | null
    anchors?: Array<{
        id: string
        timestamp: number
        timestampStr: string
        title: string
        anchorType: string
    }>
}

const STATUS_BADGE: Record<string, { label: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    READY: { label: 'Ready', variant: 'default' },
    PROCESSING: { label: 'Processing', variant: 'secondary' },
    PENDING: { label: 'Pending', variant: 'secondary' },
    FAILED: { label: 'Failed', variant: 'destructive' },
}

export function KnowledgeContextStatusCard({ lessonId }: { lessonId: string }) {
    const [status, setStatus] = useState<KnowledgeContextStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reprocessing, setReprocessing] = useState(false)
    const [showLogs, setShowLogs] = useState(false)
    const [logsLoading, setLogsLoading] = useState(false)
    const [logs, setLogs] = useState<Array<{ id: string; level: string; stage: string | null; message: string; createdAt: string }> | null>(
        null
    )

    const fetchStatus = async () => {
        try {
            setLoading(true)
            const response = await ApiClient.request(`/admin/lessons/${lessonId}/knowledge`)
            const { data } = response as any
            setStatus(data)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load knowledge context status')
        } finally {
            setLoading(false)
        }
    }

    const fetchLogs = async () => {
        try {
            setLogsLoading(true)
            const response = await ApiClient.request(`/admin/lessons/${lessonId}/knowledge/events`)
            const { data } = response as any
            setLogs(
                (data?.events || []).map((e: any) => ({
                    id: e.id,
                    level: e.level,
                    stage: e.stage,
                    message: e.message,
                    createdAt: e.createdAt,
                }))
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load job logs')
        } finally {
            setLogsLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()

        const interval = setInterval(() => {
            const job = status?.job
            const jobActive = job && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(job.state)
            const contextActive = status?.status && ['PENDING', 'PROCESSING'].includes(status.status)
            if (jobActive || contextActive) {
                fetchStatus()
            }
        }, 5000)

        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lessonId, status?.job?.state, status?.status])

    const handleProcess = async () => {
        if (!confirm('Generate (or re-generate) the Knowledge Context for this lesson from the latest VTT?')) {
            return
        }

        try {
            setReprocessing(true)
            await ApiClient.request(`/admin/lessons/${lessonId}/knowledge/process`, {
                method: 'POST',
                body: JSON.stringify({ force: true }),
            })
            await fetchStatus()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start processing')
        } finally {
            setReprocessing(false)
        }
    }

    const contextStatus = status?.status ?? null
    const badge = contextStatus ? STATUS_BADGE[contextStatus] : null
    const job = status?.job ?? null
    const lastHeartbeatAgeSeconds = job?.lastHeartbeatAt
        ? Math.floor((Date.now() - new Date(job.lastHeartbeatAt).getTime()) / 1000)
        : null

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Knowledge Context (XML)
                </CardTitle>
                <CardDescription>VTT → XML knowledge base used by the AI assistant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading && !status ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status</span>
                            {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Badge variant="outline">Missing</Badge>}
                        </div>

                        {job && (
                            <div className="space-y-2 rounded-lg border p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Job</span>
                                    <Badge variant="outline">
                                        {job.state} / {job.stage}
                                    </Badge>
                                </div>
                                <div className="space-y-1 text-xs text-muted-foreground">
                                    <div className="flex items-center justify-between">
                                        <span>Progress</span>
                                        <span>{job.progress}%</span>
                                    </div>
                                    <Progress value={job.progress} />
                                    <div className="flex items-center justify-between">
                                        <span>Attempt</span>
                                        <span>
                                            {job.attempt}/{job.maxAttempts}
                                        </span>
                                    </div>
                                    {job.workerId && (
                                        <div className="flex items-center justify-between">
                                            <span>Worker</span>
                                            <span className="font-mono">{job.workerId}</span>
                                        </div>
                                    )}
                                    {lastHeartbeatAgeSeconds != null && (
                                        <div className="flex items-center justify-between">
                                            <span>Heartbeat</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {lastHeartbeatAgeSeconds}s ago
                                            </span>
                                        </div>
                                    )}
                                    {job.errorMessage && (
                                        <div className="text-destructive">
                                            {job.errorMessage}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {status?.exists && (
                            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                <div>
                                    <div>Sections</div>
                                    <div className="text-sm font-medium text-foreground">{status.sectionCount ?? 0}</div>
                                </div>
                                <div>
                                    <div>Anchors</div>
                                    <div className="text-sm font-medium text-foreground">{status.anchorCount ?? 0}</div>
                                </div>
                                <div>
                                    <div>Tokens</div>
                                    <div className="text-sm font-medium text-foreground">{status.tokenCount ?? 0}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <Button onClick={handleProcess} disabled={reprocessing}>
                                {reprocessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Starting...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Process
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={async () => {
                                    setShowLogs(v => !v)
                                    if (!showLogs) {
                                        await fetchLogs()
                                    }
                                }}
                            >
                                {showLogs ? 'Hide Logs' : 'View Logs'}
                            </Button>
                            <Button variant="ghost" onClick={fetchStatus} disabled={loading}>
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            </Button>
                        </div>

                        {showLogs && (
                            <div className="rounded-lg border p-3">
                                {logsLoading ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    </div>
                                ) : !logs?.length ? (
                                    <p className="text-sm text-muted-foreground">No job events yet.</p>
                                ) : (
                                    <div className="max-h-64 space-y-2 overflow-y-auto text-xs">
                                        {logs.map(l => (
                                            <div key={l.id} className="flex items-start gap-2">
                                                <span className="w-14 shrink-0 rounded bg-muted px-1 py-0.5 text-center uppercase">
                                                    {l.level}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate">{l.message}</div>
                                                    <div className="text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</div>
                                                </div>
                                                {l.stage && (
                                                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono">{l.stage}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}

