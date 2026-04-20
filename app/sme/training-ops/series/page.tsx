'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { LearningSeriesSummary } from '@/types'
import { Loader2 } from 'lucide-react'

export default function SmeTrainingOpsSeriesPage() {
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsSeries()
                setSeries(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load scoped series')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    const stats = useMemo(() => ({
        total: series.length,
        active: series.filter((item) => item.isActive).length,
        badgeEligible: series.filter((item) => item.badgeEligible).length,
    }), [series])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Series</h1>
                        <p className="mt-1 text-muted-foreground">
                            Training series inside your SME scope, including cadence, star defaults, and reward output.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/sme/training-ops/series/new">
                            <Button>Create Series</Button>
                        </Link>
                        <Link href="/sme/training-ops/events/new">
                            <Button variant="outline">Create Event</Button>
                        </Link>
                        <Link href="/sme/training-ops/events">
                            <Button variant="outline">My Events</Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Series in your SME scope.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Currently schedulable series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Domain Badge Enabled</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.badgeEligible}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Series that can contribute stars toward domain badges.</p></CardContent></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Scoped Series</CardTitle>
                        <CardDescription>Use these series as the base for weekly drills, release readiness, and final assessments.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading series...</div>
                        ) : series.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No learning series are currently assigned to your SME scope.</div>
                        ) : (
                            series.map((item) => (
                                <div key={item.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge>{item.type}</Badge>
                                                {item.domain ? <Badge variant="outline">{item.domain.name}</Badge> : null}
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold">{item.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {item.cadence ?? 'No cadence'} · {item.owner?.name ?? 'No owner'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link href={`/sme/training-ops/series/${item.id}`}>
                                                <Button variant="outline">Open Series</Button>
                                            </Link>
                                            <Link href={`/sme/training-ops/series/${item.id}/edit`}>
                                                <Button variant="outline">Edit Series</Button>
                                            </Link>
                                            <Link href={`/sme/training-ops/events?seriesId=${item.id}`}>
                                                <Button variant="outline">View Events</Button>
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm text-muted-foreground">
                                        <div>Default stars: {item.defaultStarValue ?? '—'}</div>
                                        <div>Domain badges: {item.badgeEligible ? 'Enabled' : 'Disabled'}</div>
                                        <div>{item.counts.events} events</div>
                                        <div>{item.counts.exams} exams</div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                                        <div>
                                            Recent event:{' '}
                                            {item.recentEvent
                                                ? `${item.recentEvent.title}${item.recentEvent.scheduledAt ? ` · ${new Date(item.recentEvent.scheduledAt).toLocaleDateString()}` : ''}`
                                                : 'No recent event'}
                                        </div>
                                        <div>
                                            Rewards: {item.rewards?.starAwards ?? 0} stars · {item.rewards?.badgeAwards ?? 0} badges · {item.rewards?.recognizedLearners ?? 0} learners
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
