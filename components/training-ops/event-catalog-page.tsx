'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import type { LearningEventSummary, LearningSeriesSummary } from '@/types'
import { ArrowLeft, CalendarDays, Loader2, Plus } from 'lucide-react'

const EMPTY_OPTION = '__all__'

type EventCatalogView = 'admin' | 'sme'

interface EventCatalogPageProps {
    view: EventCatalogView
}

function EventCatalogPageContent({ view }: EventCatalogPageProps) {
    const isAdmin = view === 'admin'
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const seriesIdFromUrl = searchParams.get('seriesId') || ''

    const [loading, setLoading] = useState(true)
    const [seriesLoading, setSeriesLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [events, setEvents] = useState<LearningEventSummary[]>([])
    const [seriesOptions, setSeriesOptions] = useState<LearningSeriesSummary[]>([])
    const [filters, setFilters] = useState({
        search: '',
        status: EMPTY_OPTION,
        format: EMPTY_OPTION,
        seriesId: seriesIdFromUrl || EMPTY_OPTION,
    })

    useEffect(() => {
        setFilters((current) => {
            const nextSeriesId = seriesIdFromUrl || EMPTY_OPTION
            if (current.seriesId === nextSeriesId) {
                return current
            }

            return {
                ...current,
                seriesId: nextSeriesId,
            }
        })
    }, [seriesIdFromUrl])

    useEffect(() => {
        const loadSeries = async () => {
            try {
                setSeriesLoading(true)
                const response = isAdmin
                    ? await ApiClient.getTrainingOpsSeries({ limit: 100 })
                    : await ApiClient.getSmeTrainingOpsSeries()
                setSeriesOptions(response.data)
            } catch {
                setSeriesOptions([])
            } finally {
                setSeriesLoading(false)
            }
        }

        void loadSeries()
    }, [isAdmin])

    useEffect(() => {
        const loadEvents = async () => {
            try {
                setLoading(true)
                setError(null)

                const response = isAdmin
                    ? await ApiClient.getTrainingOpsEvents({
                        limit: 100,
                        search: filters.search || undefined,
                        status: filters.status === EMPTY_OPTION ? undefined : filters.status,
                        format: filters.format === EMPTY_OPTION ? undefined : filters.format,
                        seriesId: filters.seriesId === EMPTY_OPTION ? undefined : filters.seriesId,
                    })
                    : await ApiClient.getSmeTrainingOpsEvents({
                        search: filters.search || undefined,
                        status: filters.status === EMPTY_OPTION ? undefined : filters.status,
                        format: filters.format === EMPTY_OPTION ? undefined : filters.format,
                        seriesId: filters.seriesId === EMPTY_OPTION ? undefined : filters.seriesId,
                    })

                setEvents(response.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : `Failed to load ${isAdmin ? 'learning events' : 'SME events'}`)
            } finally {
                setLoading(false)
            }
        }

        void loadEvents()
    }, [filters, isAdmin])

    const selectedSeries = useMemo(
        () => seriesOptions.find((item) => item.id === filters.seriesId) ?? null,
        [filters.seriesId, seriesOptions]
    )

    const stats = useMemo(() => {
        const scheduled = events.filter((event) => event.status === 'SCHEDULED').length
        const linkedExams = events.reduce((count, event) => count + event.exams.length, 0)
        const performanceEvents = events.filter((event) => event.countsTowardPerformance).length

        return {
            total: events.length,
            scheduled,
            linkedExams,
            performanceEvents,
        }
    }, [events])

    const updateSeriesFilter = (value: string) => {
        setFilters((prev) => ({ ...prev, seriesId: value }))

        const nextSeriesId = value === EMPTY_OPTION ? '' : value
        const nextSearch = new URLSearchParams(searchParams.toString())

        if (nextSeriesId) {
            nextSearch.set('seriesId', nextSeriesId)
        } else {
            nextSearch.delete('seriesId')
        }

        const query = nextSearch.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }

    const seriesHrefPrefix = isAdmin ? '/admin/training-ops/series' : '/sme/training-ops/series'
    const eventHrefPrefix = isAdmin ? '/admin/training-ops/events' : '/sme/training-ops/events'
    const createEventHref = selectedSeries ? `${eventHrefPrefix}/new?seriesId=${selectedSeries.id}` : `${eventHrefPrefix}/new`

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
                                {isAdmin ? 'Event Operations' : 'My Learning Events'}
                            </h1>
                            <p className="mt-1 text-muted-foreground">
                                {selectedSeries
                                    ? `Showing events inside "${selectedSeries.name}"${isAdmin ? ' so you can review governance and linked exam activity.' : ' and the execution activity inside your SME scope.'}`
                                    : isAdmin
                                        ? 'Review scheduled learning activity across all domains, then open events to manage linked exams and scheduling state.'
                                        : 'Manage the events inside your SME scope and connect them to existing exams.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {isAdmin ? (
                            <Link href="/admin/training-ops-prototype/scheduling">
                                <Button variant="outline">Scheduling View</Button>
                            </Link>
                        ) : (
                            <Link href="/sme/training-ops/effectiveness">
                                <Button variant="outline">Effectiveness</Button>
                            </Link>
                        )}
                        <Link href={createEventHref}>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Learning Event
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Total Events</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Current list after global filters are applied.' : 'Scoped to your owned domains and series.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Scheduled</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.scheduled}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Events with a fixed calendar slot.' : 'Upcoming events already on the calendar.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.linkedExams}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Existing exams currently attached to events.' : 'Existing exams attached to your events.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Performance Events</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.performanceEvents}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Sessions that count toward formal assessment.' : 'Sessions mapped to formal performance tracking.'}</p></CardContent></Card>
                </div>

                {selectedSeries ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                        <span>
                            Showing events for series: <span className="font-semibold">{selectedSeries.name}</span>
                        </span>
                        <Button variant="outline" size="sm" onClick={() => updateSeriesFilter(EMPTY_OPTION)}>
                            Clear Series Filter
                        </Button>
                    </div>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>Filters</CardTitle>
                        <CardDescription>Search by title or narrow the list by series, status, and format.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="search">Search</Label>
                            <Input
                                id="search"
                                value={filters.search}
                                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                                placeholder="Search event title..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="seriesId">Series</Label>
                            <select
                                id="seriesId"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={filters.seriesId}
                                onChange={(e) => updateSeriesFilter(e.target.value)}
                                disabled={seriesLoading}
                            >
                                <option value={EMPTY_OPTION}>All series</option>
                                {seriesOptions.map((series) => (
                                    <option key={series.id} value={series.id}>
                                        {series.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <select
                                id="status"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={filters.status}
                                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value={EMPTY_OPTION}>All statuses</option>
                                <option value="DRAFT">Draft</option>
                                <option value="SCHEDULED">Scheduled</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="CANCELED">Canceled</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="format">Format</Label>
                            <select
                                id="format"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={filters.format}
                                onChange={(e) => setFilters((prev) => ({ ...prev, format: e.target.value }))}
                            >
                                <option value={EMPTY_OPTION}>All formats</option>
                                <option value="CASE_STUDY">Case Study</option>
                                <option value="KNOWLEDGE_SHARING">Knowledge Sharing</option>
                                <option value="FAQ_SHARE">FAQ Share</option>
                                <option value="RELEASE_BRIEFING">Release Briefing</option>
                                <option value="QUIZ_REVIEW">Quiz Review</option>
                                <option value="FINAL_EXAM">Final Exam</option>
                                <option value="WORKSHOP">Workshop</option>
                            </select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{isAdmin ? 'All Events' : 'Event Catalog'}</CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? 'Open an event to review linked exams, scheduling state, and cross-domain training activity.'
                                : 'Open an event to attach exams, review scope, and update scheduling metadata.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {error}
                            </div>
                        ) : null}

                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Loading learning events...
                            </div>
                        ) : events.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                {selectedSeries
                                    ? `No events in "${selectedSeries.name}" match the current filters.`
                                    : isAdmin
                                        ? 'No learning events match the current filters.'
                                        : 'No SME-scoped learning events match the current filters.'}
                            </div>
                        ) : (
                            events.map((event) => {
                                const eventDetailHref = selectedSeries
                                    ? `${eventHrefPrefix}/${event.id}?seriesId=${selectedSeries.id}`
                                    : `${eventHrefPrefix}/${event.id}`
                                const eventEditHref = selectedSeries
                                    ? `${eventHrefPrefix}/${event.id}/edit?seriesId=${selectedSeries.id}`
                                    : `${eventHrefPrefix}/${event.id}/edit`
                                const linkedSeriesHref = event.series ? `${seriesHrefPrefix}/${event.series.id}` : null

                                return (
                                    <div key={event.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge>{event.format}</Badge>
                                                    <Badge variant="outline">{event.status}</Badge>
                                                    {event.domain ? <Badge variant="outline">{event.domain.name}</Badge> : null}
                                                </div>
                                                <div>
                                                    <p className="text-lg font-semibold">{event.title}</p>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {linkedSeriesHref ? (
                                                            <Link href={linkedSeriesHref} className="font-medium text-[#006688] hover:underline">
                                                                {event.series?.name}
                                                            </Link>
                                                        ) : 'No learning series'}
                                                        {event.host ? ` · Host ${event.host.name}` : ' · No host assigned'}
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                                    <span>
                                                        <CalendarDays className="mr-1 inline h-4 w-4" />
                                                        {event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Not scheduled'}
                                                    </span>
                                                    <span>{event.exams.length} linked exam{event.exams.length === 1 ? '' : 's'}</span>
                                                    <span>{event.countsTowardPerformance ? 'Counts toward performance' : 'Practice / readiness only'}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Link href={eventDetailHref}>
                                                    <Button variant="outline">{isAdmin ? 'Open Event' : 'Open Event'}</Button>
                                                </Link>
                                                <Link href={eventEditHref}>
                                                    <Button variant="outline">Edit</Button>
                                                </Link>
                                                {isAdmin ? (
                                                    <Link href={`/admin/exams/create?learningEventId=${event.id}`}>
                                                        <Button>Create Exam</Button>
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}

export function EventCatalogPage({ view }: EventCatalogPageProps) {
    return (
        <Suspense fallback={null}>
            <EventCatalogPageContent view={view} />
        </Suspense>
    )
}
