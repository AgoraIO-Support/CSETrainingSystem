'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronRight, Link2, Loader2, Trash2, Unlink2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import type { LearningEventSummary, TrainingOpsCourseSummary, TrainingOpsExamSummary } from '@/types'

const EMPTY_OPTION = '__none__'

function SmeTrainingOpsEventDetailPageContent() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const searchParams = useSearchParams()
    const eventId = params.id

    const [loading, setLoading] = useState(true)
    const [linking, setLinking] = useState(false)
    const [creatingDraftExam, setCreatingDraftExam] = useState(false)
    const [creatingDraftCourse, setCreatingDraftCourse] = useState(false)
    const [deletingEvent, setDeletingEvent] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [cascadeDraftAssets, setCascadeDraftAssets] = useState(false)
    const [detachingExamId, setDetachingExamId] = useState<string | null>(null)
    const [detachingCourseId, setDetachingCourseId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [event, setEvent] = useState<LearningEventSummary | null>(null)
    const [exams, setExams] = useState<TrainingOpsExamSummary[]>([])
    const [courses, setCourses] = useState<TrainingOpsCourseSummary[]>([])
    const [selectedExamId, setSelectedExamId] = useState(EMPTY_OPTION)
    const [selectedCourseId, setSelectedCourseId] = useState(EMPTY_OPTION)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [eventRes, examRes, courseRes] = await Promise.all([
                    ApiClient.getSmeTrainingOpsEvent(eventId),
                    ApiClient.getSmeTrainingOpsExams(),
                    ApiClient.getSmeTrainingOpsCourses(),
                ])

                setEvent(eventRes.data)
                setExams(examRes.data)
                setCourses(courseRes.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME event details')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [eventId])

    const linkedExamIds = useMemo(() => new Set((event?.exams ?? []).map((exam) => exam.id)), [event])
    const linkedCourseIds = useMemo(() => new Set((event?.courses ?? []).map((course) => course.id)), [event])
    const accessibleExamIds = useMemo(() => new Set(exams.map((exam) => exam.id)), [exams])
    const availableExams = useMemo(
        () => exams.filter((exam) => !linkedExamIds.has(exam.id) && exam.status !== 'ARCHIVED'),
        [exams, linkedExamIds]
    )
    const availableCourses = useMemo(
        () => courses.filter((course) => !linkedCourseIds.has(course.id) && course.status !== 'ARCHIVED'),
        [courses, linkedCourseIds]
    )
    const seriesContextId = searchParams.get('seriesId') ?? event?.series?.id ?? null
    const backHref = seriesContextId ? `/sme/training-ops/series/${seriesContextId}` : '/sme/training-ops/events'
    const allEventsHref = seriesContextId ? `/sme/training-ops/events?seriesId=${seriesContextId}` : '/sme/training-ops/events'

    const handleAttach = async () => {
        if (!selectedExamId || selectedExamId === EMPTY_OPTION) return

        try {
            setLinking(true)
            setError(null)
            setSuccess(null)
            const response = await ApiClient.attachExamToSmeTrainingOpsEvent(eventId, { examId: selectedExamId })
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
            setSuccess(null)
            const response = await ApiClient.detachExamFromSmeTrainingOpsEvent(eventId, examId)
            setEvent(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to detach exam')
        } finally {
            setDetachingExamId(null)
        }
    }

    const handleCreateDraftExam = async () => {
        try {
            setCreatingDraftExam(true)
            setError(null)
            setSuccess(null)
            const examResponse = await ApiClient.createDraftExamFromSmeTrainingOpsEvent(eventId)
            const [eventRes, examRes] = await Promise.all([
                ApiClient.getSmeTrainingOpsEvent(eventId),
                ApiClient.getSmeTrainingOpsExams(),
            ])
            setEvent(eventRes.data)
            setExams(examRes.data)
            setSuccess(`Draft exam created: ${examResponse.data.title}`)
            router.push(`/admin/exams/${examResponse.data.id}/edit?sme=1`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create draft exam')
        } finally {
            setCreatingDraftExam(false)
        }
    }

    const handleAttachCourse = async () => {
        if (!selectedCourseId || selectedCourseId === EMPTY_OPTION) return

        try {
            setLinking(true)
            setError(null)
            setSuccess(null)
            const response = await ApiClient.attachCourseToSmeTrainingOpsEvent(eventId, { courseId: selectedCourseId })
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
            setSuccess(null)
            const response = await ApiClient.detachCourseFromSmeTrainingOpsEvent(eventId, courseId)
            setEvent(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to detach course')
        } finally {
            setDetachingCourseId(null)
        }
    }

    const handleCreateDraftCourse = async () => {
        try {
            setCreatingDraftCourse(true)
            setError(null)
            setSuccess(null)
            const courseResponse = await ApiClient.createDraftCourseFromSmeTrainingOpsEvent(eventId)
            const [eventRes, courseRes] = await Promise.all([
                ApiClient.getSmeTrainingOpsEvent(eventId),
                ApiClient.getSmeTrainingOpsCourses(),
            ])
            setEvent(eventRes.data)
            setCourses(courseRes.data)
            setSuccess(`Draft course created: ${courseResponse.data.title}`)
            router.push(`/admin/courses/${courseResponse.data.id}/edit?sme=1`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create draft course')
        } finally {
            setCreatingDraftCourse(false)
        }
    }

    const handleDeleteEvent = async () => {
        try {
            setDeletingEvent(true)
            setError(null)
            setSuccess(null)
            await ApiClient.deleteSmeTrainingOpsEvent(eventId, {
                cascadeDraftAssets,
            })
            setDeleteDialogOpen(false)
            router.push(allEventsHref)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete learning event')
        } finally {
            setDeletingEvent(false)
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

    const eligibleCourses = event.courses.filter((course) => course.cascadeDeleteEligible)
    const eligibleExams = event.exams.filter((exam) => exam.cascadeDeleteEligible)
    const detachableCourses = event.courses.filter((course) => !course.cascadeDeleteEligible)
    const detachableExams = event.exams.filter((exam) => !exam.cascadeDeleteEligible)
    const hasEligibleDraftAssets = eligibleCourses.length > 0 || eligibleExams.length > 0

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {seriesContextId && event.series ? (
                        <>
                            <Link href="/sme/training-ops/domains" className="transition-colors hover:text-foreground">
                                My Domains
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                            <Link href="/sme/training-ops/series" className="transition-colors hover:text-foreground">
                                My Series
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                            <Link href={`/sme/training-ops/series/${seriesContextId}`} className="transition-colors hover:text-foreground">
                                {event.series.name}
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    ) : (
                        <>
                            <Link href="/sme/training-ops/events" className="transition-colors hover:text-foreground">
                                My Events
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    )}
                    <span className="font-medium text-foreground">{event.title}</span>
                </nav>

                <div className="flex items-center gap-4">
                    <Link href={backHref}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">{event.title}</h1>
                        <p className="mt-1 text-muted-foreground">
                            Review the session and manage its linked exams within your SME scope.
                        </p>
                    </div>
                    <div className="ml-auto">
                        <Button
                            variant="destructive"
                            onClick={() => {
                                setCascadeDraftAssets(false)
                                setDeleteDialogOpen(true)
                            }}
                            disabled={deletingEvent}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Event
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}
                {success ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {success}
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
                                {event.series ? (
                                    <Link href={`/sme/training-ops/series/${event.series.id}`}>
                                        <Button variant="outline">Open Series</Button>
                                    </Link>
                                ) : null}
                                <Link href={`/sme/training-ops/events/${event.id}/edit${seriesContextId ? `?seriesId=${seriesContextId}` : ''}`}>
                                    <Button variant="outline">Edit Event</Button>
                                </Link>
                                <Button variant="outline" onClick={handleCreateDraftCourse} disabled={creatingDraftCourse}>
                                    {creatingDraftCourse ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    Create Draft Course
                                </Button>
                                <Button variant="outline" onClick={handleCreateDraftExam} disabled={creatingDraftExam}>
                                    {creatingDraftExam ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    Create Draft Exam
                                </Button>
                                <Link href={allEventsHref}>
                                    <Button variant="outline">{seriesContextId ? 'Series Events' : 'All Events'}</Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Attach Existing Course</CardTitle>
                                <CardDescription>Reuse a scoped course that you already own or manage.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="courseId">Scoped Course</Label>
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
                                <Button variant="outline" onClick={handleCreateDraftCourse} disabled={creatingDraftCourse}>
                                    {creatingDraftCourse ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    Create Draft Course
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Attach Existing Exam</CardTitle>
                                <CardDescription>Reuse an exam already inside your SME scope.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="examId">Scoped Exam</Label>
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
                                <Button variant="outline" onClick={handleCreateDraftExam} disabled={creatingDraftExam}>
                                    {creatingDraftExam ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    Create Draft Exam
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Linked Courses</CardDescription><CardTitle className="text-3xl">{event.analytics?.linkedCourseCount ?? event.courses.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Current courses grouped under this event.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl">{event.analytics?.linkedExamCount ?? event.exams.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Current exams grouped under this event.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Invitations</CardDescription><CardTitle className="text-3xl">{event.analytics?.invitationCount ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Assigned learners across all linked exams.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Attempts</CardDescription><CardTitle className="text-3xl">{event.analytics?.attemptCount ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{event.analytics?.gradedAttemptCount ?? 0} graded · {event.analytics?.passedCount ?? 0} passed</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Pass Rate</CardDescription><CardTitle className="text-3xl">{event.analytics?.passRate ?? 0}%</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Based on graded attempts only.</p></CardContent></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Linked Courses</CardTitle>
                        <CardDescription>These courses currently roll up under this learning event.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {event.courses.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No courses linked yet. Attach an existing scoped course or create a new one from this event.
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
                                    <div className="flex flex-wrap gap-2">
                                        <Link href={`/sme/training-ops/courses/${course.id}?eventId=${event.id}${seriesContextId ? `&seriesId=${seriesContextId}` : ''}`}>
                                            <Button variant="outline" size="sm">Open Course</Button>
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
                                No exams linked yet. Attach an existing scoped exam when you are ready.
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
                                    <div className="flex flex-wrap gap-2">
                                        {accessibleExamIds.has(exam.id) ? (
                                            <Link href={`/sme/training-ops/exams/${exam.id}?eventId=${event.id}${seriesContextId ? `&seriesId=${seriesContextId}` : ''}`}>
                                                <Button variant="outline">Open Exam</Button>
                                            </Link>
                                        ) : (
                                            <Button variant="outline" disabled>
                                                Exam owned by another SME
                                            </Button>
                                        )}
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

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Delete Learning Event</DialogTitle>
                        <DialogDescription>
                            Deleting the event always removes the event record itself. Existing attached courses and exams are kept and unlinked.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 text-sm">
                        <div className="rounded-lg border p-4">
                            <p className="font-medium text-foreground">Default behavior</p>
                            <p className="mt-1 text-muted-foreground">
                                Courses and exams that do not qualify for cascade delete will remain in the system and only lose their link to this event.
                            </p>
                        </div>

                        {hasEligibleDraftAssets ? (
                            <label className="flex items-start gap-3 rounded-lg border p-4">
                                <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 rounded border-slate-300"
                                    checked={cascadeDraftAssets}
                                    onChange={(e) => setCascadeDraftAssets(e.target.checked)}
                                />
                                <span>
                                    <span className="block font-medium text-foreground">
                                        Also delete eligible draft assets
                                    </span>
                                    <span className="mt-1 block text-muted-foreground">
                                        {eligibleCourses.length} course(s) and {eligibleExams.length} exam(s) were created from this event, are still draft, and have no learner activity.
                                    </span>
                                </span>
                            </label>
                        ) : null}

                        {eligibleCourses.length > 0 || eligibleExams.length > 0 ? (
                            <div className="rounded-lg border p-4">
                                <p className="font-medium text-foreground">Eligible For Cascade Delete</p>
                                <div className="mt-3 space-y-2 text-muted-foreground">
                                    {eligibleCourses.map((course) => (
                                        <div key={`delete-course-${course.id}`} className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                                            <span>Course: {course.title}</span>
                                            <Badge variant="outline">Draft</Badge>
                                        </div>
                                    ))}
                                    {eligibleExams.map((exam) => (
                                        <div key={`delete-exam-${exam.id}`} className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                                            <span>Exam: {exam.title}</span>
                                            <Badge variant="outline">Draft</Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {detachableCourses.length > 0 || detachableExams.length > 0 ? (
                            <div className="rounded-lg border p-4">
                                <p className="font-medium text-foreground">Will Be Unlinked Only</p>
                                <div className="mt-3 space-y-2 text-muted-foreground">
                                    {detachableCourses.map((course) => (
                                        <div key={`detach-course-${course.id}`} className="rounded-md bg-slate-50 px-3 py-2">
                                            <p>Course: {course.title}</p>
                                            <p className="mt-1 text-xs">{course.cascadeDeleteReason}</p>
                                        </div>
                                    ))}
                                    {detachableExams.map((exam) => (
                                        <div key={`detach-exam-${exam.id}`} className="rounded-md bg-slate-50 px-3 py-2">
                                            <p>Exam: {exam.title}</p>
                                            <p className="mt-1 text-xs">{exam.cascadeDeleteReason}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deletingEvent}>
                            Cancel
                        </Button>
                        <Button type="button" variant="destructive" onClick={handleDeleteEvent} disabled={deletingEvent}>
                            {deletingEvent ? 'Deleting…' : cascadeDraftAssets ? 'Delete Event And Eligible Draft Assets' : 'Delete Event'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    )
}

export default function SmeTrainingOpsEventDetailPage() {
    return (
        <Suspense fallback={null}>
            <SmeTrainingOpsEventDetailPageContent />
        </Suspense>
    )
}
