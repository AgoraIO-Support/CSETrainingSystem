'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    Tooltip as RechartsTooltip,
    YAxis,
} from 'recharts'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
import type { LearnerTrainingOverview, UserProgressOverview } from '@/types'
import { formatDate } from '@/lib/utils'
import {
    BookOpen,
    CalendarClock,
    CheckCircle2,
    Clock,
    Loader2,
    Play,
    RefreshCcw,
    TrendingUp,
} from 'lucide-react'

export default function TrainingPage() {
    const [trainingOverview, setTrainingOverview] = useState<LearnerTrainingOverview | null>(null)
    const [progressOverview, setProgressOverview] = useState<UserProgressOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshIndex, setRefreshIndex] = useState(0)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setError(null)

            const [trainingRes, progressRes] = await Promise.allSettled([
                ApiClient.getLearnerTrainingOverview(),
                ApiClient.getProgressOverview(),
            ])

            if (cancelled) return

            if (trainingRes.status === 'fulfilled') {
                setTrainingOverview(trainingRes.value.data)
            } else {
                setTrainingOverview(null)
            }

            if (progressRes.status === 'fulfilled') {
                setProgressOverview(progressRes.value.data)
            } else {
                setProgressOverview(null)
            }

            if (trainingRes.status === 'rejected' && progressRes.status === 'rejected') {
                setError('Failed to load learning overview')
            } else if (trainingRes.status === 'rejected' || progressRes.status === 'rejected') {
                setError('Some learning data could not be loaded')
            }

            setLoading(false)
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [refreshIndex])

    const activityChartData = useMemo(() => {
        if (!progressOverview) return []

        return [...progressOverview.recentActivity]
            .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
            .map((entry) => ({
                date: formatDate(entry.updatedAt),
                minutes: Math.round(entry.watchedDuration / 60),
            }))
    }, [progressOverview])

    const handleRefresh = () => setRefreshIndex((prev) => prev + 1)

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Learning</h1>
                        <p className="mt-1 text-muted-foreground">
                            Keep course progress, assigned assessments, upcoming sessions, and recent completions in one place.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
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
                        Loading learning...
                    </div>
                ) : !trainingOverview && !progressOverview ? (
                    <Card>
                        <CardContent className="py-10 text-center">
                            <p className="font-medium">{error || 'Failed to load learning overview'}</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {error ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                {error}
                            </div>
                        ) : null}

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <SummaryCard title="Enrolled Courses" value={progressOverview?.stats.totalEnrolled ?? 0} helper="Courses currently assigned" icon={BookOpen} />
                            <SummaryCard title="In Progress" value={progressOverview?.stats.inProgressCourses ?? 0} helper="Courses actively underway" icon={TrendingUp} />
                            <SummaryCard title="Pending Assessments" value={trainingOverview?.summary.pendingExams ?? 0} helper="Still available to complete" icon={Clock} />
                            <SummaryCard title="Passed" value={trainingOverview?.summary.passedExams ?? 0} helper="Successfully completed assessments" icon={CheckCircle2} />
                            <SummaryCard title="Upcoming Events" value={trainingOverview?.summary.upcomingEvents ?? 0} helper="Linked learning sessions" icon={CalendarClock} />
                            <SummaryCard title="Learning Hours" value={Number((progressOverview?.stats.hoursLearned ?? 0).toFixed(1))} helper="Total study time logged" icon={Clock} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Continue Courses</CardTitle>
                                    <CardDescription>Resume courses you are enrolled in.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {progressOverview?.courses.length ? (
                                        progressOverview.courses.map((course) => (
                                            <div
                                                key={course.courseId}
                                                className="flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center"
                                            >
                                                <div>
                                                    <p className="font-semibold">{course.title}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {course.instructorName} · {course.category} · {course.level}
                                                    </p>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <Badge variant={course.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                                            {course.status === 'COMPLETED' ? 'Completed' : 'In progress'}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            Last accessed {course.lastAccessedAt ? formatDate(course.lastAccessedAt) : 'N/A'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-full md:w-64">
                                                    <div className="mb-1 flex items-center justify-between text-sm">
                                                        <span>Progress</span>
                                                        <span className="font-medium">{course.progress}%</span>
                                                    </div>
                                                    <Progress value={course.progress} />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">You have not enrolled in any courses yet.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Assigned Assessments</CardTitle>
                                    <CardDescription>Everything currently available in your learning queue.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {trainingOverview?.assignedExams.length ? (
                                        trainingOverview.assignedExams.map((exam) => (
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
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No assigned assessments yet.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-5">
                            <Card className="lg:col-span-3">
                                <CardHeader>
                                    <CardTitle>Study Activity</CardTitle>
                                    <CardDescription>Minutes watched per session.</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    {activityChartData.length ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={activityChartData}>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <RechartsTooltip />
                                                <Line type="monotone" dataKey="minutes" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                            No recent activity logged yet.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Recent Learning Activity</CardTitle>
                                    <CardDescription>Latest lessons you interacted with.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="max-h-[280px] space-y-3 overflow-y-auto pr-2">
                                        {progressOverview?.recentActivity.length ? (
                                            progressOverview.recentActivity.map((entry) => (
                                                <div key={entry.id} className="rounded-lg border p-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-medium">{entry.lessonTitle}</p>
                                                        <span className="text-xs text-muted-foreground">{formatDate(entry.updatedAt)}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{entry.courseTitle}</p>
                                                    <div className="mt-2 flex items-center justify-between text-xs">
                                                        <span className="flex items-center gap-1">
                                                            <Play className="h-3 w-3" />
                                                            {Math.round(entry.watchedDuration / 60)} min watched
                                                        </span>
                                                        <Badge variant={entry.completed ? 'default' : 'outline'}>
                                                            {entry.completed ? 'Completed' : 'In progress'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No lessons started yet.</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Upcoming Learning Events</CardTitle>
                                    <CardDescription>Event-linked sessions associated with your assigned learning.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {trainingOverview?.upcomingEvents.length ? (
                                        trainingOverview.upcomingEvents.map((event) => (
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
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No upcoming linked events.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Recent Completions</CardTitle>
                                    <CardDescription>Your latest submitted or graded attempts.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {trainingOverview?.recentCompletions.length ? (
                                        trainingOverview.recentCompletions.map((attempt) => (
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
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No completed attempts yet.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Upcoming Targets</CardTitle>
                                <CardDescription>Suggested completion targets based on enrollment dates.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[280px] space-y-3 overflow-y-auto pr-2">
                                    {progressOverview?.upcomingDeadlines.length ? (
                                        progressOverview.upcomingDeadlines.map((deadline) => {
                                            const daysLeft = Math.max(
                                                0,
                                                Math.ceil(
                                                    (new Date(deadline.deadline).getTime() - Date.now()) /
                                                        (1000 * 60 * 60 * 24)
                                                )
                                            )

                                            return (
                                                <div key={deadline.courseId} className="rounded-lg border p-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium">{deadline.title}</p>
                                                        <Badge variant="outline">
                                                            {formatDate(deadline.deadline)}
                                                        </Badge>
                                                    </div>
                                                    <p className="mb-2 text-xs text-muted-foreground">
                                                        {deadline.status === 'COMPLETED' ? 'Completed' : `${daysLeft} days remaining`}
                                                    </p>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="w-40">
                                                            <div className="mb-1 flex items-center justify-between text-xs">
                                                                <span>Progress</span>
                                                                <span className="font-medium">{deadline.progress}%</span>
                                                            </div>
                                                            <Progress value={deadline.progress} />
                                                        </div>
                                                        {deadline.status !== 'COMPLETED' ? (
                                                            <Badge variant="secondary">In progress</Badge>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            No upcoming targets. Enroll in a course to get started.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
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
