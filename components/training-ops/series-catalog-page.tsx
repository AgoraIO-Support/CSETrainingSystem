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

type SeriesCatalogView = 'admin' | 'sme'

interface SeriesCatalogPageProps {
    view: SeriesCatalogView
}

export function SeriesCatalogPage({ view }: SeriesCatalogPageProps) {
    const isAdmin = view === 'admin'
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const loadSeries = async () => {
            try {
                setLoading(true)
                const response = isAdmin
                    ? await ApiClient.getTrainingOpsSeries({ limit: 100, search: search || undefined })
                    : await ApiClient.getSmeTrainingOpsSeries()
                setSeries(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learning series')
            } finally {
                setLoading(false)
            }
        }

        void loadSeries()
    }, [isAdmin, search])

    const stats = useMemo(() => {
        const active = series.filter((item) => item.isActive).length
        return { total: series.length, active }
    }, [series])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className={isAdmin ? 'flex items-center gap-4' : ''}>
                        {isAdmin ? (
                            <Link href="/admin/training-ops">
                                <Button variant="ghost" size="icon">
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            </Link>
                        ) : null}
                        <div>
                            <h1 className="text-3xl font-bold">
                                {isAdmin ? 'Series Governance' : 'My Series'}
                            </h1>
                            <p className="mt-1 text-muted-foreground">
                                {isAdmin
                                    ? 'Manage reusable training programs across all domains, including ownership, cadence, and schedulable state.'
                                    : 'Training series inside your SME scope, including cadence and downstream event or exam activity.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {isAdmin ? (
                            <>
                                <Link href="/admin/training-ops/events">
                                    <Button variant="outline">All Events</Button>
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
                            </>
                        ) : (
                            <>
                                <Link href="/sme/training-ops/series/new">
                                    <Button>Create Series</Button>
                                </Link>
                                <Link href="/sme/training-ops/events/new">
                                    <Button variant="outline">Create Event</Button>
                                </Link>
                                <Link href="/sme/training-ops/events">
                                    <Button variant="outline">My Events</Button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Configured learning series.' : 'Series in your SME scope.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Available for current scheduling.' : 'Currently schedulable series.'}</p></CardContent></Card>
                </div>

                {isAdmin ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Search Series</CardTitle>
                            <CardDescription>Search by series name, slug, or description.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learning series..." />
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>{isAdmin ? 'All Series' : 'Scoped Series'}</CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? 'Open a learning series to govern cadence, owner assignment, and downstream event or exam creation.'
                                : 'Use these series as the base for weekly drills, case studies, release readiness work, and final assessments.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading learning series...</div>
                        ) : series.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                {isAdmin ? 'No learning series found.' : 'No learning series are currently assigned to your SME scope.'}
                            </div>
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
                                                    {isAdmin
                                                        ? `${item.owner?.name ?? 'No owner'} · ${item.cadence ?? 'No cadence'}`
                                                        : `${item.cadence ?? 'No cadence'} · ${item.owner?.name ?? 'No owner'}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {isAdmin ? (
                                                <>
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
                                                </>
                                            ) : (
                                                <>
                                                    <Link href={`/sme/training-ops/series/${item.id}`}>
                                                        <Button variant="outline">Open Series</Button>
                                                    </Link>
                                                    <Link href={`/sme/training-ops/series/${item.id}/edit`}>
                                                        <Button variant="outline">Edit Series</Button>
                                                    </Link>
                                                    <Link href={`/sme/training-ops/events?seriesId=${item.id}`}>
                                                        <Button variant="outline">View Events</Button>
                                                    </Link>
                                                </>
                                            )}
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
                                                : isAdmin ? 'No scheduled event yet' : 'No recent event'}
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
