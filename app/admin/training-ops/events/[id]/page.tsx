'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, Link2, Loader2, Unlink2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import type { Course, Exam, LearningEventSummary } from '@/types'

const EMPTY_OPTION = '__none__'

export default function TrainingOpsEventDetailPage() {
    const params = useParams<{ id: string }>()
    const eventId = params.id

    const [loading, setLoading] = useState(true)
    const [linking, setLinking] = useState(false)
    const [detachingExamId, setDetachingExamId] = useState<string | null>(null)
    const [detachingCourseId, setDetachingCourseId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [event, setEvent] = useState<LearningEventSummary | null>(null)
    const [exams, setExams] = useState<Exam[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [selectedExamId, setSelectedExamId] = useState(EMPTY_OPTION)
    const [selectedCourseId, setSelectedCourseId] = useState(EMPTY_OPTION)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [eventRes, examRes, courseRes] = await Promise.all([
                    ApiClient.getTrainingOpsEvent(eventId),
                    ApiClient.getAdminExams({ limit: 200 }),
                    ApiClient.getAdminCourses({ limit: 200, status: 'ALL' }),
                ])

                setEvent(eventRes.data)
                setExams(examRes.data)
                setCourses(courseRes.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load event details')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [eventId])

    const linkedExamIds = useMemo(() => new Set((event?.exams ?? []).map((exam) => exam.id)), [event])
    const linkedCourseIds = useMemo(() => new Set((event?.courses ?? []).map((course) => course.id)), [event])

    const availableExams = useMemo(
        () => exams.filter((exam) => !linkedExamIds.has(exam.id) && exam.status !== 'ARCHIVED'),
        [exams, linkedExamIds]
    )

    const availableCourses = useMemo(
        () => courses.filter((course) => !linkedCourseIds.has(course.id) && course.status !== 'ARCHIVED'),
        [courses, linkedCourseIds]
    )

    const handleAttach = async () => {
        if (!selectedExamId || selectedExamId === EMPTY_OPTION) return

        try {
            setLinking(true)
            setError(null)
            const response = await ApiClient.attachExamToTrainingOpsEvent(eventId, { examId: selectedExamId })
            setEvent(response.data)
            setSelectedExamId(EMPTY_OPTION)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to attach exam')
        } finally {
            setLinking(false)
        }
    }

    const handleDetach = async (examId: string) => {
        try {
            setDetachingExamId(examId)
            setError(null)
            const response = await ApiClient.detachExamFromTrainingOpsEvent(eventId, examId)
            setEvent(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to detach exam')
        } finally {
            setDetachingExamId(null)
        }
    }

    const handleAttachCourse = async () => {
        if (!selectedCourseId || selectedCourseId === EMPTY_OPTION) return

        try {
            setLinking(true)
            setError(null)
            const response = await ApiClient.attachCourseToTrainingOpsEvent(eventId, { courseId: selectedCourseId })
            setEvent(response.data)
            setSelectedCourseId(EMPTY_OPTION)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to attach course')
        } finally {
            setLinking(false)
        }
    }

    const handleDetachCourse = async (courseId: string) => {
        try {
            setDetachingCourseId(courseId)
            setError(null)
            const response = await ApiClient.detachCourseFromTrainingOpsEvent(eventId, courseId)
            setEvent(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to detach course')
        } finally {
            setDetachingCourseId(null)
        }
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading learning event...
                </div>
            </DashboardLayout>
        )
    }

    if (!event) {
        return (
            <DashboardLayout>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error || 'Learning event not found'}
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin/training-ops/events">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">{event.title}</h1>
                        <p className="mt-1 text-muted-foreground">
                            Manage linked exams and prepare the event for scheduling, readiness checks, or final assessment.
                        </p>
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
                            <CardTitle>Event Overview</CardTitle>
                            <CardDescription>Core scheduling and ownership information for this learning event.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge>{event.format}</Badge>
                                <Badge variant="outline">{event.status}</Badge>
                                {event.domain ? <Badge variant="outline">{event.domain.name}</Badge> : null}
                                {event.series ? <Badge variant="outline">{event.series.name}</Badge> : null}
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Host</p>
                                    <p className="mt-2 font-medium">{event.host?.name || 'Unassigned'}</p>
                                    <p className="text-sm text-muted-foreground">{event.host?.email || 'No presenter assigned yet'}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Scheduled At</p>
                                    <p className="mt-2 font-medium">
                                        {event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Not scheduled'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {event.releaseVersion ? `Release ${event.releaseVersion}` : 'No release tag'}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                    {event.description || 'No description provided yet.'}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <Link href={`/admin/training-ops/events/${event.id}/edit`}>
                                    <Button variant="outline">Edit Event</Button>
                                </Link>
                                <Link href="/admin/training-ops/events">
                                    <Button variant="outline">All Events</Button>
                                </Link>
                                <Link href={`/admin/exams/create?learningEventId=${event.id}`}>
                                    <Button>
                                        <CalendarDays className="mr-2 h-4 w-4" />
                                        Create Exam for This Event
                                    </Button>
                                </Link>
                                <Link href={`/admin/courses/create?learningEventId=${event.id}`}>
                                    <Button variant="outline">
                                        Create Course for This Event
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Attach Existing Course</CardTitle>
                                <CardDescription>Link a course so the event can deliver training content and prep work.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="courseId">Existing Course</Label>
                                    <select
                                        id="courseId"
                                        className="h-10 w-full rounded-md border bg-background px-3"
                                        value={selectedCourseId}
                                        onChange={(e) => setSelectedCourseId(e.target.value)}
                                    >
                                        <option value={EMPTY_OPTION}>Select a course</option>
                                        {availableCourses.map((course) => (
                                            <option key={course.id} value={course.id}>
                                                {course.title} · {course.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <Button onClick={handleAttachCourse} disabled={linking || selectedCourseId === EMPTY_OPTION}>
                                    {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    Attach Course
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Attach Existing Exam</CardTitle>
                                <CardDescription>Bind an existing exam so this learning event can reuse the current exam engine.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="examId">Existing Exam</Label>
                                    <select
                                        id="examId"
                                        className="h-10 w-full rounded-md border bg-background px-3"
                                        value={selectedExamId}
                                        onChange={(e) => setSelectedExamId(e.target.value)}
                                    >
                                        <option value={EMPTY_OPTION}>Select an exam</option>
                                        {availableExams.map((exam) => (
                                            <option key={exam.id} value={exam.id}>
                                                {exam.title} · {exam.status}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <Button onClick={handleAttach} disabled={linking || selectedExamId === EMPTY_OPTION}>
                                    {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    Attach Exam
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Linked Courses</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.linkedCourseCount ?? event.courses.length}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Training content grouped under this event.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Linked Exams</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.linkedExamCount ?? event.exams.length}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Current exams grouped under this event.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Invitations</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.invitationCount ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Assigned learners across all linked exams.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Attempts</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.attemptCount ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                {event.analytics?.gradedAttemptCount ?? 0} graded · {event.analytics?.passedCount ?? 0} passed
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Pass Rate</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.passRate ?? 0}%</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Based on graded attempts only.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Stars Awarded</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.starAwardCount ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                {event.analytics?.recognizedLearners ?? 0} recognized learner{(event.analytics?.recognizedLearners ?? 0) === 1 ? '' : 's'}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Badges Unlocked</CardDescription>
                            <CardTitle className="text-3xl">{event.analytics?.badgeAwardCount ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Milestones reached through linked event performance.</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Linked Courses</CardTitle>
                        <CardDescription>These courses currently roll up under this learning event.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {event.courses.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No courses linked yet. Attach an existing course or create a new one from this event.
                            </div>
                        ) : (
                            event.courses.map((course) => (
                                <div key={course.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
                                    <div className="space-y-2">
                                        <p className="font-medium">{course.title}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {course.status}
                                            {course.publishedAt ? ` · Published ${new Date(course.publishedAt).toLocaleString()}` : ''}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline">{course.enrolledCount ?? 0} enrolled</Badge>
                                            <Badge variant="outline">{course.slug}</Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Link href={`/admin/courses/${course.id}/edit`}>
                                            <Button variant="outline">Open Course</Button>
                                        </Link>
                                        <Button
                                            variant="outline"
                                            onClick={() => handleDetachCourse(course.id)}
                                            disabled={detachingCourseId === course.id}
                                        >
                                            {detachingCourseId === course.id ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Unlink2 className="mr-2 h-4 w-4" />
                                            )}
                                            Detach
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Linked Exams</CardTitle>
                        <CardDescription>These exams currently roll up under this learning event.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {event.exams.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No exams linked yet. Attach an existing exam or create a new one from this event.
                            </div>
                        ) : (
                            event.exams.map((exam) => (
                                <div key={exam.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
                                    <div className="space-y-2">
                                        <p className="font-medium">{exam.title}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {exam.status}
                                            {exam.publishedAt ? ` · Published ${new Date(exam.publishedAt).toLocaleString()}` : ''}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline">{exam.invitationCount ?? 0} invitations</Badge>
                                            <Badge variant="outline">{exam.attemptCount ?? 0} attempts</Badge>
                                            <Badge variant="outline">{exam.gradedAttemptCount ?? 0} graded</Badge>
                                            <Badge variant="outline">{exam.passRate ?? 0}% pass rate</Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Link href={`/admin/exams/${exam.id}`}>
                                            <Button variant="outline">Open Exam</Button>
                                        </Link>
                                        <Link href={`/admin/exams/${exam.id}/analytics`}>
                                            <Button variant="outline">Analytics</Button>
                                        </Link>
                                        <Button
                                            variant="outline"
                                            onClick={() => handleDetach(exam.id)}
                                            disabled={detachingExamId === exam.id}
                                        >
                                            {detachingExamId === exam.id ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Unlink2 className="mr-2 h-4 w-4" />
                                            )}
                                            Detach
                                        </Button>
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
