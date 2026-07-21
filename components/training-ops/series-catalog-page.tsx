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
import { FileJson, Loader2, Plus, Trash2 } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'

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
    const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null)

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
                setError(err instanceof Error ? err.message : 'Failed to load learning Programs')
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

    const deleteSeries = async (item: LearningSeriesSummary) => {
        if (item.counts.events > 0 || item.counts.exams > 0) return
        if (!window.confirm(`Delete Program "${item.name}"? This action cannot be undone.`)) return

        try {
            setDeletingSeriesId(item.id)
            setError(null)
            await ApiClient.deleteTrainingOpsSeries(item.id)
            setSeries((current) => current.filter((candidate) => candidate.id !== item.id))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete Learning Program')
        } finally {
            setDeletingSeriesId(null)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className={isAdmin ? 'flex items-center gap-4' : ''}>
                        {isAdmin ? (
                            <BackButton fallbackHref="/admin/training-ops" />
                        ) : null}
                        <div>
                            <h1 className="text-3xl font-bold">
                                Learning Programs
                            </h1>
                            <p className="mt-1 text-muted-foreground">
                                {isAdmin
                                    ? 'Manage reusable learning programs across all domains, including ownership, cadence, and schedulable state.'
                                    : 'Programs in your SME scope, including cadence and downstream event or exam activity.'}
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
                                        Create Program
                                    </Button>
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link href="/sme/training-ops/series/new">
                                    <Button>Create Program</Button>
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
                    <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Configured learning programs.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Available for current scheduling.</p></CardContent></Card>
                </div>

                {isAdmin ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Search Programs</CardTitle>
                            <CardDescription>Search by program name, slug, or description.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learning programs..." />
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>{isAdmin ? 'All Programs' : 'Scoped Programs'}</CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? 'Open a Program to manage settings, associate existing content, and review execution in one workspace.'
                                : 'Use programs as reusable operating templates for weekly drills, case studies, release readiness work, and final assessments.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading learning programs...</div>
                        ) : series.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                {isAdmin ? 'No learning programs found.' : 'No learning programs are currently assigned to your SME scope.'}
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
                                                        <Button variant="outline">Open Program</Button>
                                                    </Link>
                                                    <Link href={`/admin/exams/create?learningSeriesId=${item.id}${item.domain?.id ? `&productDomainId=${item.domain.id}` : ''}`}>
                                                        <Button variant="outline">Create Exam</Button>
                                                    </Link>
                                                    <Link href={`/admin/training-ops/events/new?seriesId=${item.id}`}>
                                                        <Button variant="outline">Create Event</Button>
                                                    </Link>
                                                    <Button
                                                        variant="destructive"
                                                        disabled={
                                                            deletingSeriesId === item.id ||
                                                            item.counts.events > 0 ||
                                                            item.counts.exams > 0
                                                        }
                                                        title={
                                                            item.counts.events > 0 || item.counts.exams > 0
                                                                ? 'Remove all linked Events, Courses, and Exams before deleting this Program.'
                                                                : 'Delete Program'
                                                        }
                                                        onClick={() => void deleteSeries(item)}
                                                    >
                                                        {deletingSeriesId === item.id ? (
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                        )}
                                                        Delete
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Link href={`/sme/training-ops/series/${item.id}`}>
                                                        <Button variant="outline">Open Program</Button>
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
