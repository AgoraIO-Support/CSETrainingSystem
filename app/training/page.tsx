'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiClient } from '@/lib/api-client'
import type { LearnerTrainingOverview } from '@/types'
import { CalendarClock, CheckCircle2, Clock, Loader2, Star } from 'lucide-react'

export default function TrainingPage() {
    const [overview, setOverview] = useState<LearnerTrainingOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getLearnerTrainingOverview()
                setOverview(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load training overview')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Training</h1>
                        <p className="mt-1 text-muted-foreground">
                            See upcoming sessions, assigned assessments, and your latest completions in one place.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/exams">
                            <Button variant="outline">My Exams</Button>
                        </Link>
                        <Link href="/rewards">
                            <Button variant="outline">My Rewards</Button>
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Loading training...
                    </div>
                ) : error ? (
                    <Card>
                        <CardContent className="py-10 text-center">
                            <p className="font-medium">{error}</p>
                        </CardContent>
                    </Card>
                ) : overview ? (
                    <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <SummaryCard title="Assigned Exams" value={overview.summary.assignedExams} helper="Items in your queue" icon={CalendarClock} />
                            <SummaryCard title="Pending" value={overview.summary.pendingExams} helper="Still available to complete" icon={Clock} />
                            <SummaryCard title="In Progress" value={overview.summary.inProgressExams} helper="Resumable assessments" icon={Clock} />
                            <SummaryCard title="Passed" value={overview.summary.passedExams} helper="Successfully completed" icon={CheckCircle2} />
                            <SummaryCard title="Upcoming Events" value={overview.summary.upcomingEvents} helper="Linked learning sessions" icon={CalendarClock} />
                            <SummaryCard title="Required Items" value={overview.summary.requiredItems} helper="Performance-linked or mandatory" icon={Star} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Upcoming Learning Events</CardTitle>
                                    <CardDescription>Event-linked sessions associated with your assigned training.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {overview.upcomingEvents.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No upcoming linked events.</p>
                                    ) : overview.upcomingEvents.map((event) => (
                                        <div key={event.id} className="rounded-lg border p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">{event.format.replaceAll('_', ' ')}</Badge>
                                                        {event.isRequired ? <Badge>Required</Badge> : null}
                                                    </div>
                                                    <p className="mt-3 font-semibold">{event.title}</p>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {event.domain?.name ?? 'General Training'} · {event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Schedule pending'}
                                                    </p>
                                                </div>
                                                <Badge variant="secondary">{event.linkedExams.length} linked exams</Badge>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {event.linkedExams.slice(0, 3).map((exam) => (
                                                    <Link key={exam.id} href={`/exams/${exam.id}`}>
                                                        <Badge variant="outline">{exam.title}</Badge>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Assigned Assessments</CardTitle>
                                    <CardDescription>Everything currently available in your training queue.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {overview.assignedExams.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No assigned assessments yet.</p>
                                    ) : overview.assignedExams.map((exam) => (
                                        <div key={exam.id} className="rounded-lg border p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">{exam.assessmentKind ?? 'PRACTICE'}</Badge>
                                                        {exam.countsTowardPerformance ? <Badge>Performance</Badge> : null}
                                                        {exam.awardsStars && exam.starValue ? <Badge variant="secondary">+{exam.starValue} stars</Badge> : null}
                                                        {exam.certificateEligible ? <Badge variant="outline">Certificate on pass</Badge> : null}
                                                    </div>
                                                    <p className="mt-3 font-semibold">{exam.title}</p>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {exam.domain?.name ?? 'General Training'}
                                                        {exam.learningEvent?.title ? ` · ${exam.learningEvent.title}` : ''}
                                                        {exam.deadline ? ` · due ${new Date(exam.deadline).toLocaleDateString()}` : ''}
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {exam.userStatus.hasPassed ? <Badge>Passed</Badge> : null}
                                                        {exam.userStatus.hasInProgressAttempt ? <Badge variant="outline">In Progress</Badge> : null}
                                                        {!exam.userStatus.hasPassed && !exam.userStatus.hasInProgressAttempt ? (
                                                            <Badge variant="outline">{exam.userStatus.remainingAttempts} attempts left</Badge>
                                                        ) : null}
                                                        {exam.userStatus.bestScore !== null && exam.userStatus.bestScore !== undefined ? (
                                                            <Badge variant="outline">Best {Math.round(exam.userStatus.bestScore)}%</Badge>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <Link href={`/exams/${exam.id}`}>
                                                    <Button variant="ghost" size="sm">Open</Button>
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Completions</CardTitle>
                                <CardDescription>Your latest submitted or graded attempts.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {overview.recentCompletions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No completed attempts yet.</p>
                                ) : overview.recentCompletions.map((attempt) => (
                                    <div key={attempt.attemptId} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{attempt.assessmentKind ?? 'PRACTICE'}</Badge>
                                                    {attempt.passed ? <Badge>Passed</Badge> : <Badge variant="destructive">Not Passed</Badge>}
                                                </div>
                                                <p className="mt-3 font-semibold">{attempt.examTitle}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {attempt.domainName ?? 'General Training'}
                                                    {attempt.eventTitle ? ` · ${attempt.eventTitle}` : ''}
                                                    {attempt.submittedAt ? ` · ${new Date(attempt.submittedAt).toLocaleDateString()}` : ''}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-semibold">
                                                    {attempt.percentageScore !== null && attempt.percentageScore !== undefined
                                                        ? `${Math.round(attempt.percentageScore)}%`
                                                        : 'Pending'}
                                                </p>
                                                <Link href={`/exams/${attempt.examId}/result?attemptId=${attempt.attemptId}`}>
                                                    <Button variant="ghost" size="sm">Review</Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </>
                ) : null}
            </div>
        </DashboardLayout>
    )
}

function SummaryCard({
    title,
    value,
    helper,
    icon: Icon,
}: {
    title: string
    value: number
    helper: string
    icon: React.ComponentType<{ className?: string }>
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{title}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{helper}</p>
                <Icon className="h-5 w-5 text-[#006688]" />
            </CardContent>
        </Card>
    )
}
