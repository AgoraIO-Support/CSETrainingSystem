'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, CalendarPlus, FileCheck2, Link2, Loader2 } from 'lucide-react'
import { ApiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type {
    Course,
    Exam,
    LearningEventSummary,
    LearningSeriesSummary,
    TrainingOpsCourseSummary,
    TrainingOpsExamSummary,
} from '@/types'

type AssociationView = 'admin' | 'sme'
type ResourceType = 'event' | 'course' | 'exam'
type CourseCandidate = Pick<TrainingOpsCourseSummary, 'id' | 'title' | 'status' | 'learningEventId'>
type ExamCandidate = Pick<TrainingOpsExamSummary, 'id' | 'title' | 'status' | 'learningEventId' | 'learningSeriesId'>
const ASSOCIATED_PAGE_SIZE = 5

export function ProgramAssociationManager({
    view,
    program,
    programEvents,
    onAssociated,
}: {
    view: AssociationView
    program: LearningSeriesSummary
    programEvents: LearningEventSummary[]
    onAssociated: () => void | Promise<void>
}) {
    const [allEvents, setAllEvents] = useState<LearningEventSummary[]>([])
    const [allCourses, setAllCourses] = useState<CourseCandidate[]>([])
    const [allExams, setAllExams] = useState<ExamCandidate[]>([])
    const [eventId, setEventId] = useState('')
    const [courseId, setCourseId] = useState('')
    const [courseEventId, setCourseEventId] = useState('')
    const [examId, setExamId] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState<ResourceType | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [eventPage, setEventPage] = useState(1)
    const [coursePage, setCoursePage] = useState(1)
    const [examPage, setExamPage] = useState(1)

    const loadCandidates = useCallback(async () => {
        setLoading(true)
        try {
            if (view === 'admin') {
                const [eventsResponse, coursesResponse, examsResponse] = await Promise.all([
                    ApiClient.getTrainingOpsEvents({ limit: 200 }),
                    ApiClient.getAdminCourses({ limit: 200, status: 'ALL' }),
                    ApiClient.getAdminExams({ limit: 200 }),
                ])
                setAllEvents(eventsResponse.data)
                setAllCourses(coursesResponse.data.map((course: Course) => ({
                    id: course.id,
                    title: course.title,
                    status: course.status ?? 'DRAFT',
                    learningEventId: course.learningEventId,
                })))
                setAllExams(examsResponse.data.map((exam: Exam) => ({
                    id: exam.id,
                    title: exam.title,
                    status: exam.status,
                    learningEventId: exam.learningEventId,
                    learningSeriesId: exam.learningSeriesId,
                })))
            } else {
                const [eventsResponse, coursesResponse, examsResponse] = await Promise.all([
                    ApiClient.getSmeTrainingOpsEvents(),
                    ApiClient.getSmeTrainingOpsCourses(),
                    ApiClient.getSmeTrainingOpsExams(),
                ])
                setAllEvents(eventsResponse.data)
                setAllCourses(coursesResponse.data)
                setAllExams(examsResponse.data)
            }
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load available resources')
        } finally {
            setLoading(false)
        }
    }, [view])

    useEffect(() => {
        void loadCandidates()
    }, [loadCandidates, program.id])

    useEffect(() => {
        setEventPage(1)
        setCoursePage(1)
        setExamPage(1)
    }, [program.id])

    const availableEvents = useMemo(
        () => allEvents.filter((event) =>
            !event.series &&
            (!program.domain?.id || !event.domain?.id || event.domain.id === program.domain.id)
        ),
        [allEvents, program.domain?.id]
    )
    const availableCourses = useMemo(
        () => allCourses.filter((course) => !course.learningEventId && course.status !== 'ARCHIVED'),
        [allCourses]
    )
    const programEventIds = useMemo(() => new Set(programEvents.map((event) => event.id)), [programEvents])
    const associatedEvents = useMemo(
        () => Array.from(new Map(
            [...programEvents, ...allEvents.filter((event) => event.series?.id === program.id)]
                .map((event) => [event.id, event])
        ).values()),
        [allEvents, program.id, programEvents]
    )
    const associatedEventIds = useMemo(
        () => new Set([...programEventIds, ...associatedEvents.map((event) => event.id)]),
        [associatedEvents, programEventIds]
    )
    const associatedCourses = useMemo(
        () => allCourses.filter((course) => course.learningEventId && associatedEventIds.has(course.learningEventId)),
        [allCourses, associatedEventIds]
    )
    const associatedExams = useMemo(
        () => allExams.filter((exam) =>
            exam.learningSeriesId === program.id ||
            Boolean(exam.learningEventId && associatedEventIds.has(exam.learningEventId))
        ),
        [allExams, associatedEventIds, program.id]
    )
    const availableExams = useMemo(
        () => allExams.filter((exam) =>
            !exam.learningSeriesId &&
            exam.status !== 'ARCHIVED' &&
            (!exam.learningEventId || programEventIds.has(exam.learningEventId))
        ),
        [allExams, programEventIds]
    )

    const associate = async (resourceType: ResourceType) => {
        const resourceId = resourceType === 'event' ? eventId : resourceType === 'course' ? courseId : examId
        if (!resourceId || (resourceType === 'course' && !courseEventId)) return

        setSaving(resourceType)
        setError(null)
        setMessage(null)
        try {
            await ApiClient.associateTrainingOpsProgramResource(program.id, {
                resourceType,
                resourceId,
                ...(resourceType === 'course' ? { eventId: courseEventId } : {}),
            })
            const resourceLabel = resourceType === 'event' ? 'Event' : resourceType === 'course' ? 'Course' : 'Exam'
            setMessage(`${resourceLabel} associated with ${program.name}.`)
            if (resourceType === 'event') setEventId('')
            if (resourceType === 'course') setCourseId('')
            if (resourceType === 'exam') setExamId('')
            await Promise.all([loadCandidates(), onAssociated()])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to associate resource')
        } finally {
            setSaving(null)
        }
    }

    return (
        <Card id="associations" className="scroll-mt-6 overflow-hidden border-[#006688]/20">
            <CardHeader className="border-b bg-[linear-gradient(120deg,rgba(0,102,136,0.08),rgba(247,144,9,0.06))]">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[#006688] p-2.5 text-white shadow-sm">
                        <Link2 className="h-5 w-5" />
                    </div>
                    <div>
                        <CardTitle>Associate Existing Content</CardTitle>
                        <CardDescription className="mt-1">
                            Bring existing Events, Courses, and Exams into this Program without recreating them.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
                {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

                {loading ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading available content...
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <div className="mb-3">
                                <h3 className="font-semibold">Currently Associated</h3>
                                <p className="text-sm text-muted-foreground">Content already connected to this Program.</p>
                            </div>
                            <div className="grid gap-4 xl:grid-cols-3">
                                <AssociatedResourceList
                                    title="Events"
                                    items={associatedEvents}
                                    page={eventPage}
                                    onPageChange={setEventPage}
                                    emptyLabel="No Events associated yet."
                                    renderItem={(event) => ({
                                        title: event.title,
                                        detail: `${event.format} · ${event.status}`,
                                        href: `/${view === 'admin' ? 'admin' : 'sme'}/training-ops/events/${event.id}`,
                                    })}
                                />
                                <AssociatedResourceList
                                    title="Courses"
                                    items={associatedCourses}
                                    page={coursePage}
                                    onPageChange={setCoursePage}
                                    emptyLabel="No Courses associated yet."
                                    renderItem={(course) => ({
                                        title: course.title,
                                        detail: course.status,
                                        href: `/admin/courses/${course.id}/edit${view === 'sme' ? '?sme=1' : ''}`,
                                    })}
                                />
                                <AssociatedResourceList
                                    title="Exams"
                                    items={associatedExams}
                                    page={examPage}
                                    onPageChange={setExamPage}
                                    emptyLabel="No Exams associated yet."
                                    renderItem={(exam) => ({
                                        title: exam.title,
                                        detail: exam.status,
                                        href: `/admin/exams/${exam.id}/edit${view === 'sme' ? '?sme=1' : ''}`,
                                    })}
                                />
                            </div>
                        </div>

                        <div className="border-t pt-6">
                            <div className="mb-3">
                                <h3 className="font-semibold">Add Existing Content</h3>
                                <p className="text-sm text-muted-foreground">Select another resource to associate with this Program.</p>
                            </div>
                            <div className="grid gap-4 xl:grid-cols-3">
                                <AssociationCell
                                    icon={<CalendarPlus className="h-5 w-5" />}
                                    index="01"
                                    title="Existing Event"
                                    description="Assign an unowned Event directly to this Program."
                                >
                                    <Label htmlFor="program-event">Event</Label>
                                    <ResourceSelect id="program-event" value={eventId} onChange={setEventId} emptyLabel="Select an Event" items={availableEvents} />
                                    <Button className="w-full" disabled={!eventId || saving !== null} onClick={() => void associate('event')}>
                                        {saving === 'event' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Associate Event
                                    </Button>
                                </AssociationCell>

                                <AssociationCell
                                    icon={<BookOpen className="h-5 w-5" />}
                                    index="02"
                                    title="Existing Course"
                                    description="Courses belong through an Event; choose both records."
                                >
                                    <Label htmlFor="program-course">Course</Label>
                                    <ResourceSelect id="program-course" value={courseId} onChange={setCourseId} emptyLabel="Select a Course" items={availableCourses} />
                                    <Label htmlFor="course-program-event">Target Program Event</Label>
                                    <ResourceSelect id="course-program-event" value={courseEventId} onChange={setCourseEventId} emptyLabel="Select an Event" items={programEvents} />
                                    {programEvents.length === 0 ? <p className="text-xs text-amber-700">Associate or create an Event first.</p> : null}
                                    <Button className="w-full" disabled={!courseId || !courseEventId || saving !== null} onClick={() => void associate('course')}>
                                        {saving === 'course' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Associate Course
                                    </Button>
                                </AssociationCell>

                                <AssociationCell
                                    icon={<FileCheck2 className="h-5 w-5" />}
                                    index="03"
                                    title="Existing Exam"
                                    description="Map a standalone or Program-event Exam directly to this Program."
                                >
                                    <Label htmlFor="program-exam">Exam</Label>
                                    <ResourceSelect id="program-exam" value={examId} onChange={setExamId} emptyLabel="Select an Exam" items={availableExams} />
                                    <Button className="w-full" disabled={!examId || saving !== null} onClick={() => void associate('exam')}>
                                        {saving === 'exam' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Associate Exam
                                    </Button>
                                </AssociationCell>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function AssociatedResourceList<T extends { id: string }>({
    title,
    items,
    page,
    onPageChange,
    emptyLabel,
    renderItem,
}: {
    title: string
    items: T[]
    page: number
    onPageChange: (page: number) => void
    emptyLabel: string
    renderItem: (item: T) => { title: string; detail: string; href: string }
}) {
    const totalPages = Math.max(1, Math.ceil(items.length / ASSOCIATED_PAGE_SIZE))
    const currentPage = Math.min(page, totalPages)
    const visibleItems = items.slice(
        (currentPage - 1) * ASSOCIATED_PAGE_SIZE,
        currentPage * ASSOCIATED_PAGE_SIZE
    )

    return (
        <section className="rounded-xl border bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="font-semibold">{title}</h4>
                <span className="rounded-full border bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {items.length}
                </span>
            </div>
            <div className="space-y-2">
                {visibleItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-muted-foreground">
                        {emptyLabel}
                    </div>
                ) : visibleItems.map((item) => {
                    const display = renderItem(item)
                    return (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{display.title}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{display.detail}</p>
                            </div>
                            <Button asChild variant="outline" size="sm" className="shrink-0">
                                <Link href={display.href}>Open</Link>
                            </Button>
                        </div>
                    )
                })}
            </div>
            {totalPages > 1 ? (
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => onPageChange(currentPage - 1)}
                    >
                        Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                    >
                        Next
                    </Button>
                </div>
            ) : null}
        </section>
    )
}

function AssociationCell({
    icon,
    index,
    title,
    description,
    children,
}: {
    icon: React.ReactNode
    index: string
    title: string
    description: string
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-[290px] flex-col rounded-xl border bg-slate-50/70 p-4">
            <div className="mb-5 flex items-start justify-between">
                <div className="rounded-lg border bg-white p-2 text-[#006688]">{icon}</div>
                <span className="font-mono text-xs tracking-[0.18em] text-slate-400">{index}</span>
            </div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 min-h-10 text-sm text-muted-foreground">{description}</p>
            <div className="mt-4 flex flex-1 flex-col gap-2">{children}</div>
        </div>
    )
}

function ResourceSelect({
    id,
    value,
    onChange,
    emptyLabel,
    items,
}: {
    id: string
    value: string
    onChange: (value: string) => void
    emptyLabel: string
    items: Array<{ id: string; title?: string; name?: string }>
}) {
    return (
        <select
            id={id}
            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            <option value="">{items.length > 0 ? emptyLabel : `No available ${emptyLabel.replace('Select an ', '')}s`}</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.title ?? item.name}</option>)}
        </select>
    )
}
