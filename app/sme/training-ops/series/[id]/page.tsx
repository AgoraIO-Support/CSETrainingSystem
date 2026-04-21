'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Award, CalendarDays, ChevronRight, Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { LearningEventSummary, LearningSeriesSummary, SmeBadgeLadderOverview, TrainingOpsExamSummary } from '@/types'

type SeriesCourse = LearningEventSummary['courses'][number] & {
    eventId: string
    eventTitle: string
}

type SeriesExam = {
    id: string
    title: string
    status: string
    publishedAt?: string | Date | null
    invitationCount?: number
    attemptCount?: number
    gradedAttemptCount?: number
    passRate?: number
    eventId?: string
    eventTitle?: string
    accessible: boolean
}

export default function SmeTrainingOpsSeriesDetailPage() {
    const params = useParams<{ id: string }>()
    const seriesId = params.id

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [series, setSeries] = useState<LearningSeriesSummary | null>(null)
    const [events, setEvents] = useState<LearningEventSummary[]>([])
    const [badges, setBadges] = useState<SmeBadgeLadderOverview | null>(null)
    const [scopedExams, setScopedExams] = useState<TrainingOpsExamSummary[]>([])

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [seriesRes, eventsRes, badgesRes, examsRes] = await Promise.all([
                    ApiClient.getSmeTrainingOpsSeries(),
                    ApiClient.getSmeTrainingOpsEvents({ seriesId }),
                    ApiClient.getSmeTrainingOpsBadges(),
                    ApiClient.getSmeTrainingOpsExams(),
                ])

                const currentSeries = seriesRes.data.find((item) => item.id === seriesId) ?? null

                setSeries(currentSeries)
                setEvents(eventsRes.data)
                setBadges(badgesRes.data)
                setScopedExams(examsRes.data)
                setError(currentSeries ? null : 'Learning series not found')
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME learning series overview')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [seriesId])

    const recentEvents = useMemo(
        () =>
            [...events]
                .sort(
                    (a, b) =>
                        new Date(b.scheduledAt ?? b.createdAt).getTime() -
                        new Date(a.scheduledAt ?? a.createdAt).getTime()
                )
                .slice(0, 5),
        [events]
    )

    const relatedCourses = useMemo(() => {
        const courseMap = new Map<string, SeriesCourse>()

        for (const event of events) {
            for (const course of event.courses) {
                if (!courseMap.has(course.id)) {
                    courseMap.set(course.id, {
                        ...course,
                        eventId: event.id,
                        eventTitle: event.title,
                    })
                }
            }
        }

        return Array.from(courseMap.values())
    }, [events])

    const relatedExams = useMemo(() => {
        const accessibleExamIds = new Set(scopedExams.map((exam) => exam.id))
        const examMap = new Map<string, SeriesExam>()

        for (const exam of scopedExams.filter((item) => item.learningSeriesId === seriesId)) {
            examMap.set(exam.id, {
                id: exam.id,
                title: exam.title,
                status: exam.status,
                publishedAt: exam.publishedAt,
                invitationCount: exam.invitationCount,
                attemptCount: exam.attemptCount,
                gradedAttemptCount: exam.gradedAttemptCount,
                passRate: exam.passRate,
                accessible: true,
            })
        }

        for (const event of events) {
            for (const exam of event.exams) {
                const existing = examMap.get(exam.id)
                examMap.set(exam.id, {
                    id: exam.id,
                    title: exam.title,
                    status: existing?.status ?? exam.status,
                    publishedAt: existing?.publishedAt ?? exam.publishedAt,
                    invitationCount: existing?.invitationCount ?? exam.invitationCount,
                    attemptCount: existing?.attemptCount ?? exam.attemptCount,
                    gradedAttemptCount: existing?.gradedAttemptCount ?? exam.gradedAttemptCount,
                    passRate: existing?.passRate ?? exam.passRate,
                    eventId: existing?.eventId ?? event.id,
                    eventTitle: existing?.eventTitle ?? event.title,
                    accessible: existing?.accessible ?? accessibleExamIds.has(exam.id),
                })
            }
        }

        return Array.from(examMap.values())
    }, [events, scopedExams, seriesId])

    const badgeLadder = useMemo(() => {
        const domainId = series?.domain?.id
        if (!domainId) return null
        return badges?.domainLadders.find((item) => item.domain.id === domainId) ?? null
    }, [badges, series?.domain?.id])

    const recentUnlocks = useMemo(
        () => {
            const domainId = series?.domain?.id
            if (!domainId) return []
            return (badges?.recentUnlocks ?? []).filter((item) => item.domain.id === domainId).slice(0, 5)
        },
        [badges, series?.domain?.id]
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
                <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Link href="/sme/training-ops/domains" className="transition-colors hover:text-foreground">
                        My Domains
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    <Link href="/sme/training-ops/series" className="transition-colors hover:text-foreground">
                        My Series
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    <span className="font-medium text-foreground">{series.name}</span>
                </nav>

                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/sme/training-ops/series">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">{series.name}</h1>
                            <p className="mt-1 text-muted-foreground">
                                Navigate the full SME path from this series into its events, linked courses, and linked exams.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href={`/sme/training-ops/series/${series.id}/edit`}>
                            <Button variant="outline">Edit Series</Button>
                        </Link>
                        <Link href={`/sme/training-ops/events?seriesId=${series.id}`}>
                            <Button variant="outline">View Events</Button>
                        </Link>
                        <Link href={`/sme/training-ops/events/new?seriesId=${series.id}`}>
                            <Button>Create Event</Button>
                        </Link>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Series Overview</CardTitle>
                            <CardDescription>Default rules that this series passes down to events and related training assets.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge>{series.type}</Badge>
                                {series.domain ? <Badge variant="outline">{series.domain.name}</Badge> : null}
                                {!series.isActive ? <Badge variant="outline">Inactive</Badge> : null}
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
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                    {series.description || 'No description provided yet.'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Reward Output</CardTitle>
                            <CardDescription>Recognition activity associated with this series inside its owning domain.</CardDescription>
                        </CardHeader>
                        <CardContent>
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
                    <Card><CardHeader className="pb-2"><CardDescription>Related Courses</CardDescription><CardTitle className="text-3xl">{relatedCourses.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Courses linked through events in this series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Related Exams</CardDescription><CardTitle className="text-3xl">{relatedExams.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Exams aligned to this series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Domain Badges</CardDescription><CardTitle className="text-3xl">{badgeLadder?.milestones.length ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Badge milestones inherited from this series&apos;s domain.</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Events</CardTitle>
                            <CardDescription>Latest sessions scheduled under this series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {recentEvents.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No events scheduled for this series yet.
                                </div>
                            ) : recentEvents.map((event) => (
                                <div key={event.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{event.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">{event.format} · {event.status}</p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                <CalendarDays className="mr-1 inline h-4 w-4" />
                                                {event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Not scheduled'}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Link href={`/sme/training-ops/events/${event.id}?seriesId=${series.id}`}>
                                                <Button variant="outline">Open Event</Button>
                                            </Link>
                                            <Link href={`/sme/training-ops/events/${event.id}/edit?seriesId=${series.id}`}>
                                                <Button variant="outline">Edit</Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Domain Badge Ladder</CardTitle>
                            <CardDescription>
                                Recognition milestones inherited from {series.domain?.name ?? 'this series domain'}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {badgeLadder?.milestones.length ? badgeLadder.milestones.map((badge) => (
                                <div key={badge.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{badge.name}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                Unlocks at {badge.thresholdStars} stars · {badge.awardCount} awards
                                            </p>
                                        </div>
                                        <Award className="h-5 w-5 text-[#006688]" />
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No domain badge milestones are available for this series yet.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Related Courses</CardTitle>
                            <CardDescription>Courses linked to events inside this series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {relatedCourses.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No courses linked to this series yet.
                                </div>
                            ) : relatedCourses.map((course) => (
                                <div key={course.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{course.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {course.status} · {course.enrolledCount ?? 0} enrolled
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                Via event: {course.eventTitle}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Link href={`/sme/training-ops/events/${course.eventId}?seriesId=${series.id}`}>
                                                <Button variant="outline">Event</Button>
                                            </Link>
                                            <Link href={`/sme/training-ops/courses/${course.id}?eventId=${course.eventId}&seriesId=${series.id}`}>
                                                <Button variant="outline">Course</Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Related Exams</CardTitle>
                            <CardDescription>Exams aligned to this series, including event-linked assessments.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {relatedExams.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No exams linked to this series yet.
                                </div>
                            ) : relatedExams.map((exam) => (
                                <div key={exam.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{exam.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {exam.status} · {exam.attemptCount ?? 0} attempts · {exam.passRate ?? 0}% pass rate
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {exam.eventTitle ? `Via event: ${exam.eventTitle}` : 'Series-scoped exam'}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {exam.eventId ? (
                                                <Link href={`/sme/training-ops/events/${exam.eventId}?seriesId=${series.id}`}>
                                                    <Button variant="outline">Event</Button>
                                                </Link>
                                            ) : null}
                                            {exam.accessible ? (
                                                <Link href={exam.eventId ? `/sme/training-ops/exams/${exam.id}?eventId=${exam.eventId}&seriesId=${series.id}` : `/sme/training-ops/exams/${exam.id}?seriesId=${series.id}`}>
                                                    <Button variant="outline">Exam</Button>
                                                </Link>
                                            ) : (
                                                <Button variant="outline" disabled>
                                                    Exam owned by another SME
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {recentUnlocks.length > 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Unlocks</CardTitle>
                            <CardDescription>Most recent domain badge unlocks relevant to this series.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {recentUnlocks.map((unlock) => (
                                <div key={unlock.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{unlock.badge.name}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {unlock.user.name} · {new Date(unlock.awardedAt).toLocaleString()}
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {unlock.event ? `Event: ${unlock.event.title}` : unlock.exam ? `Exam: ${unlock.exam.title}` : 'Series reward'}
                                            </p>
                                        </div>
                                        <Award className="h-5 w-5 text-[#006688]" />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </DashboardLayout>
    )
}
