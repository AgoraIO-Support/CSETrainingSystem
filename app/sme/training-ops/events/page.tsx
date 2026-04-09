'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import type { LearningEventSummary } from '@/types'
import { CalendarDays, Loader2, Plus } from 'lucide-react'

const EMPTY_OPTION = '__all__'

export default function SmeTrainingOpsEventsPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [events, setEvents] = useState<LearningEventSummary[]>([])
    const [filters, setFilters] = useState({
        search: '',
        status: EMPTY_OPTION,
        format: EMPTY_OPTION,
    })

    useEffect(() => {
        const loadEvents = async () => {
            try {
                setLoading(true)
                setError(null)
                const response = await ApiClient.getSmeTrainingOpsEvents({
                    search: filters.search || undefined,
                    status: filters.status === EMPTY_OPTION ? undefined : filters.status,
                    format: filters.format === EMPTY_OPTION ? undefined : filters.format,
                })
                setEvents(response.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME events')
            } finally {
                setLoading(false)
            }
        }

        void loadEvents()
    }, [filters])

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

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Learning Events</h1>
                        <p className="mt-1 text-muted-foreground">
                            Manage the events inside your SME scope and connect them to existing exams.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link href="/sme/training-ops/effectiveness">
                            <Button variant="outline">Effectiveness</Button>
                        </Link>
                        <Link href="/sme/training-ops/events/new">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Learning Event
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Total Events</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Scoped to your owned domains and series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Scheduled</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.scheduled}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Upcoming events already on the calendar.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.linkedExams}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Existing exams attached to your events.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Performance Events</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.performanceEvents}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Sessions mapped to formal performance tracking.</p></CardContent></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Filters</CardTitle>
                        <CardDescription>Search by title or narrow the list by status and format.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
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
                        <CardTitle>Event Catalog</CardTitle>
                        <CardDescription>Open an event to attach exams, review scope, and update scheduling metadata.</CardDescription>
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
                                No SME-scoped learning events match the current filters.
                            </div>
                        ) : (
                            events.map((event) => (
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
                                                    {event.series?.name || 'No learning series'}
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
                                            <Link href={`/sme/training-ops/events/${event.id}`}>
                                                <Button variant="outline">Open Event</Button>
                                            </Link>
                                            <Link href={`/sme/training-ops/events/${event.id}/edit`}>
                                                <Button variant="outline">Edit</Button>
                                            </Link>
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
