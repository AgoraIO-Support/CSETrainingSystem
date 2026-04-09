'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Award, CalendarDays, Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { BadgeMilestoneSummary, Exam, LearningEventSummary, LearningSeriesSummary } from '@/types'

export default function TrainingOpsSeriesDetailPage() {
    const params = useParams<{ id: string }>()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [series, setSeries] = useState<LearningSeriesSummary | null>(null)
    const [events, setEvents] = useState<LearningEventSummary[]>([])
    const [exams, setExams] = useState<Exam[]>([])
    const [badges, setBadges] = useState<BadgeMilestoneSummary[]>([])

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [seriesRes, eventsRes, examsRes, badgesRes] = await Promise.all([
                    ApiClient.getTrainingOpsSeriesById(params.id),
                    ApiClient.getTrainingOpsEvents({ limit: 100, seriesId: params.id }),
                    ApiClient.getAdminExams({ limit: 200 }),
                    ApiClient.getTrainingOpsBadgeMilestones({ limit: 100, learningSeriesId: params.id }),
                ])

                setSeries(seriesRes.data)
                setEvents(eventsRes.data)
                setExams(examsRes.data.filter((exam) => exam.learningSeriesId === params.id))
                setBadges(badgesRes.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learning series overview')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [params.id])

    const recentEvents = useMemo(
        () =>
            [...events]
                .sort((a, b) => new Date(b.scheduledAt ?? b.createdAt).getTime() - new Date(a.scheduledAt ?? a.createdAt).getTime())
                .slice(0, 5),
        [events]
    )

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading learning series...
                </div>
            </DashboardLayout>
        )
    }

    if (!series) {
        return (
            <DashboardLayout>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error || 'Learning series not found'}
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/training-ops/series">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">{series.name}</h1>
                            <p className="mt-1 text-muted-foreground">Series overview for cadence, event execution, linked exams, and inherited reward behavior.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href={`/admin/training-ops/events/new?seriesId=${series.id}`}>
                            <Button>Create Event</Button>
                        </Link>
                        <Link href={`/admin/training-ops/series/${series.id}/edit`}>
                            <Button variant="outline">Edit Series</Button>
                        </Link>
                    </div>
                </div>

                {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Series Overview</CardTitle>
                            <CardDescription>Default rules that events and exams inherit from this training series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge>{series.type}</Badge>
                                {series.domain ? <Badge variant="outline">{series.domain.name}</Badge> : null}
                                {!series.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                                {series.countsTowardPerformance ? <Badge variant="outline">Performance</Badge> : null}
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Owner</p>
                                    <p className="mt-2 font-medium">{series.owner?.name ?? 'Unassigned'}</p>
                                    <p className="text-sm text-muted-foreground">{series.owner?.email ?? 'No owner configured'}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cadence</p>
                                    <p className="mt-2 font-medium">{series.cadence ?? 'Not set'}</p>
                                    <p className="text-sm text-muted-foreground">Default stars: {series.defaultStarValue ?? 0}</p>
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{series.description || 'No description provided yet.'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Reward Defaults</CardTitle>
                            <CardDescription>Badge eligibility and reward output currently associated to this series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                Badge eligible
                                <p className="mt-2 text-lg font-semibold text-foreground">{series.badgeEligible ? 'Yes' : 'No'}</p>
                            </div>
                            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                Counts toward performance
                                <p className="mt-2 text-lg font-semibold text-foreground">{series.countsTowardPerformance ? 'Yes' : 'No'}</p>
                            </div>
                            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                Reward output
                                <p className="mt-2 text-lg font-semibold text-foreground">
                                    {series.rewards?.starAwards ?? 0} stars · {series.rewards?.badgeAwards ?? 0} badges
                                </p>
                                <p className="mt-2">{series.rewards?.recognizedLearners ?? 0} recognized learners</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Events</CardDescription><CardTitle className="text-3xl">{events.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Events currently in this series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl">{exams.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Exams inheriting this series mapping.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Available Badges</CardDescription><CardTitle className="text-3xl">{badges.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Badges explicitly scoped to this learning series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Last Reward Output</CardDescription><CardTitle className="text-3xl">{series.rewards?.recognizedLearners ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Learners recognized through this series.</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Events</CardTitle>
                            <CardDescription>Latest sessions scheduled under this series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {recentEvents.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No events scheduled for this series yet.</div>
                            ) : recentEvents.map((event) => (
                                <div key={event.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{event.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">{event.format} · {event.status}</p>
                                            <p className="mt-2 text-sm text-muted-foreground"><CalendarDays className="mr-1 inline h-4 w-4" />{event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Not scheduled'}</p>
                                        </div>
                                        <Link href={`/admin/training-ops/events/${event.id}`}>
                                            <Button variant="outline">Open</Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Relevant Badges and Exams</CardTitle>
                            <CardDescription>Recognition rules and exam assets currently aligned to this series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {badges.slice(0, 3).map((badge) => (
                                <div key={badge.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{badge.name}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Unlocks at {badge.thresholdStars} stars · {badge.learningSeries?.name ?? badge.domain?.name ?? 'Global'}</p>
                                        </div>
                                        <Award className="h-5 w-5 text-[#006688]" />
                                    </div>
                                </div>
                            ))}
                            {exams.slice(0, 3).map((exam) => (
                                <div key={exam.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{exam.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">{exam.status} · {exam.assessmentKind ?? 'UNCLASSIFIED'}</p>
                                        </div>
                                        <Link href={`/admin/exams/${exam.id}`}>
                                            <Button variant="outline">Exam</Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                            {badges.length === 0 && exams.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No badges or exams linked to this series yet.</div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
