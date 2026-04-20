'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronRight, Loader2, PencilLine } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiClient } from '@/lib/api-client'
import type { SmeManagedCourseDetail } from '@/types'

function SmeTrainingOpsCourseDetailPageContent() {
    const params = useParams<{ id: string }>()
    const searchParams = useSearchParams()
    const courseId = params.id

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [course, setCourse] = useState<SmeManagedCourseDetail | null>(null)
    const eventContextId = searchParams.get('eventId')
    const seriesContextId = searchParams.get('seriesId')
    const backHref = eventContextId
        ? `/sme/training-ops/events/${eventContextId}${seriesContextId ? `?seriesId=${seriesContextId}` : ''}`
        : seriesContextId
            ? `/sme/training-ops/series/${seriesContextId}`
            : '/sme/training-ops/courses'

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsCourse(courseId)
                setCourse(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load course')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [courseId])

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading course...
                </div>
            </DashboardLayout>
        )
    }

    if (!course) {
        return (
            <DashboardLayout>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error || 'Course not found'}
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {seriesContextId ? (
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
                                Series
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    ) : null}
                    {course.event?.id ? (
                        <>
                            <Link
                                href={`/sme/training-ops/events/${course.event.id}${seriesContextId ? `?seriesId=${seriesContextId}` : ''}`}
                                className="transition-colors hover:text-foreground"
                            >
                                {course.event.title}
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    ) : !seriesContextId ? (
                        <>
                            <Link href="/sme/training-ops/courses" className="transition-colors hover:text-foreground">
                                Managed Courses
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    ) : null}
                    <span className="font-medium text-foreground">{course.title}</span>
                </nav>

                <div className="flex items-center gap-4">
                    <Link href={backHref}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">{course.title}</h1>
                        <p className="mt-1 text-muted-foreground">
                            Overview for a course you created through the SME workflow.
                        </p>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>Course Overview</CardTitle>
                        <CardDescription>Core metadata and linked training context.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Badge>{course.status}</Badge>
                            <Badge variant="outline">{course.level}</Badge>
                            <Badge variant="outline">{course.category}</Badge>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Card><CardHeader className="pb-2"><CardDescription>Chapters</CardDescription><CardTitle className="text-3xl">{course.chapterCount}</CardTitle></CardHeader></Card>
                            <Card><CardHeader className="pb-2"><CardDescription>Enrollments</CardDescription><CardTitle className="text-3xl">{course.enrollmentCount}</CardTitle></CardHeader></Card>
                            <Card><CardHeader className="pb-2"><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl">{course.linkedExamCount}</CardTitle></CardHeader></Card>
                            <Card><CardHeader className="pb-2"><CardDescription>Slug</CardDescription><CardTitle className="text-lg">{course.slug}</CardTitle></CardHeader></Card>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Instructor</p>
                                <p className="mt-2 font-medium">{course.instructor.name}</p>
                                <p className="text-sm text-muted-foreground">{course.instructor.email}</p>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Linked Event</p>
                                <p className="mt-2 font-medium">{course.event?.title || 'Not linked to a learning event'}</p>
                                <p className="text-sm text-muted-foreground">
                                    {course.event ? `${course.event.format} · ${course.event.status}` : 'No event metadata'}
                                </p>
                                {course.event?.id ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/sme/training-ops/events/${course.event.id}${seriesContextId ? `?seriesId=${seriesContextId}` : ''}`}>Open Event</Link>
                                        </Button>
                                        {seriesContextId ? (
                                            <Button asChild variant="outline" size="sm">
                                                <Link href={`/sme/training-ops/series/${seriesContextId}`}>Open Series</Link>
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button asChild>
                                <Link href={`/admin/courses/${course.id}/edit?sme=1`}>
                                    <PencilLine className="mr-2 h-4 w-4" />
                                    Open Full Editor
                                </Link>
                            </Button>
                        </div>

                        <div className="rounded-lg border p-4">
                            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Learning Outcomes</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {course.learningOutcomes.length > 0 ? course.learningOutcomes.map((item) => (
                                        <Badge key={item} variant="outline">{item}</Badge>
                                    )) : <span className="text-sm text-muted-foreground">No learning outcomes yet.</span>}
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Requirements</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {course.requirements.length > 0 ? course.requirements.map((item) => (
                                        <Badge key={item} variant="outline">{item}</Badge>
                                    )) : <span className="text-sm text-muted-foreground">No requirements yet.</span>}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}

export default function SmeTrainingOpsCourseDetailPage() {
    return (
        <Suspense fallback={null}>
            <SmeTrainingOpsCourseDetailPageContent />
        </Suspense>
    )
}
