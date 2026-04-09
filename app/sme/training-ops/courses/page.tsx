'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiClient } from '@/lib/api-client'
import type { TrainingOpsCourseSummary } from '@/types'

export default function SmeTrainingOpsCoursesPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [courses, setCourses] = useState<TrainingOpsCourseSummary[]>([])

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsCourses()
                setCourses(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load courses')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Managed Courses</h1>
                    <p className="mt-1 text-muted-foreground">
                        Courses you created or manage through your SME workflow.
                    </p>
                </div>

                {error ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                    <Card><CardHeader className="pb-2"><CardDescription>Managed Courses</CardDescription><CardTitle className="text-3xl">{courses.length}</CardTitle></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Draft</CardDescription><CardTitle className="text-3xl">{courses.filter((course) => course.status === 'DRAFT').length}</CardTitle></CardHeader></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Published</CardDescription><CardTitle className="text-3xl">{courses.filter((course) => course.status === 'PUBLISHED').length}</CardTitle></CardHeader></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>My Created Courses</CardTitle>
                        <CardDescription>Use these read-only views to track course drafts and published delivery assets.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading courses...
                            </div>
                        ) : courses.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                                No SME-managed courses yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {courses.map((course) => (
                                    <div key={course.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold">{course.title}</h3>
                                                <Badge variant="outline">{course.status}</Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <span>{course.enrolledCount ?? 0} enrolled</span>
                                                <span>{course.slug}</span>
                                            </div>
                                        </div>
                                        <Link href={`/sme/training-ops/courses/${course.id}`}>
                                            <Button variant="outline">
                                                <BookOpen className="mr-2 h-4 w-4" />
                                                Open Course
                                            </Button>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
