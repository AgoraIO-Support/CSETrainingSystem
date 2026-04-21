'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiClient } from '@/lib/api-client'
import type { LearningSeriesSummary } from '@/types'
import { ArrowLeft, FileJson, Loader2, Plus } from 'lucide-react'

export default function TrainingOpsSeriesPage() {
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const loadSeries = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getTrainingOpsSeries({ limit: 100, search: search || undefined })
                setSeries(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learning series')
            } finally {
                setLoading(false)
            }
        }

        void loadSeries()
    }, [search])

    const stats = useMemo(() => {
        const active = series.filter((item) => item.isActive).length
        return { total: series.length, active }
    }, [series])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/training-ops">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Learning Series</h1>
                            <p className="mt-1 text-muted-foreground">Configure reusable training programs that events and exams can inherit from.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/admin/training-ops/badges">
                            <Button variant="outline">Badge Milestones</Button>
                        </Link>
                        <Link href="/admin/training-ops/events">
                            <Button variant="outline">Learning Events</Button>
                        </Link>
                        <Link href="/admin/training-ops/series/import">
                            <Button variant="outline">
                                <FileJson className="mr-2 h-4 w-4" />
                                Import JSON
                            </Button>
                        </Link>
                        <Link href="/admin/training-ops/series/new">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Series
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Configured learning series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Available for current scheduling.</p></CardContent></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Search Series</CardTitle>
                        <CardDescription>Search by series name, slug, or description.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learning series..." />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Series Catalog</CardTitle>
                        <CardDescription>Open a learning series to adjust defaults like cadence, owner, and active scheduling state.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading learning series...</div>
                        ) : series.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No learning series found.</div>
                        ) : (
                            series.map((item) => (
                                <div key={item.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge>{item.type}</Badge>
                                                {item.domain ? <Badge variant="outline">{item.domain.name}</Badge> : null}
                                                {!item.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold">{item.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {item.owner?.name ?? 'No owner'} · {item.cadence ?? 'No cadence'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link href={`/admin/training-ops/series/${item.id}`}>
                                                <Button variant="outline">Overview</Button>
                                            </Link>
                                            <Link href={`/admin/exams/create?learningSeriesId=${item.id}${item.domain?.id ? `&productDomainId=${item.domain.id}` : ''}`}>
                                                <Button variant="outline">Create Exam</Button>
                                            </Link>
                                            <Link href={`/admin/training-ops/events/new?seriesId=${item.id}`}>
                                                <Button variant="outline">Create Event</Button>
                                            </Link>
                                            <Link href={`/admin/training-ops/series/${item.id}/edit`}>
                                                <Button variant="outline">Edit</Button>
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                                        <div>{item.counts.events} events</div>
                                        <div>{item.counts.exams} exams</div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                                        <div>
                                            Recent event:{' '}
                                            {item.recentEvent
                                                ? `${item.recentEvent.title}${item.recentEvent.scheduledAt ? ` · ${new Date(item.recentEvent.scheduledAt).toLocaleDateString()}` : ''}`
                                                : 'No scheduled event yet'}
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
