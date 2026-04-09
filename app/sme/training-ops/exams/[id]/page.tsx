'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiClient } from '@/lib/api-client'
import type { SmeManagedExamDetail } from '@/types'

export default function SmeTrainingOpsExamDetailPage() {
    const params = useParams<{ id: string }>()
    const examId = params.id

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [exam, setExam] = useState<SmeManagedExamDetail | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsExam(examId)
                setExam(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load exam')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [examId])

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading exam...
                </div>
            </DashboardLayout>
        )
    }

    if (!exam) {
        return (
            <DashboardLayout>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error || 'Exam not found'}
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/sme/training-ops/exams">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">{exam.title}</h1>
                        <p className="mt-1 text-muted-foreground">
                            Manage the exam you created through the SME workflow and continue editing it in the full exam editor.
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
                        <CardTitle>Exam Overview</CardTitle>
                        <CardDescription>Core metadata, reward policy, and linked training context.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Badge>{exam.status}</Badge>
                            {exam.assessmentKind ? <Badge variant="outline">{exam.assessmentKind}</Badge> : null}
                            {exam.domain ? <Badge variant="outline">{exam.domain.name}</Badge> : null}
                            {exam.series ? <Badge variant="outline">{exam.series.name}</Badge> : null}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Card><CardHeader className="pb-2"><CardDescription>Questions</CardDescription><CardTitle className="text-3xl">{exam.questionCount}</CardTitle></CardHeader></Card>
                            <Card><CardHeader className="pb-2"><CardDescription>Invitations</CardDescription><CardTitle className="text-3xl">{exam.invitationCount ?? 0}</CardTitle></CardHeader></Card>
                            <Card><CardHeader className="pb-2"><CardDescription>Attempts</CardDescription><CardTitle className="text-3xl">{exam.attemptCount ?? 0}</CardTitle></CardHeader></Card>
                            <Card><CardHeader className="pb-2"><CardDescription>Pass Rate</CardDescription><CardTitle className="text-3xl">{exam.passRate ?? 0}%</CardTitle></CardHeader></Card>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Linked Event</p>
                                <p className="mt-2 font-medium">{exam.event?.title || 'Not linked to a learning event'}</p>
                                <p className="text-sm text-muted-foreground">
                                    {exam.event ? `${exam.event.format} · ${exam.event.status}` : 'No event metadata'}
                                </p>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Reward Policy</p>
                                <p className="mt-2 font-medium">
                                    {exam.awardsStars ? `${exam.starValue ?? 0} stars on pass` : 'No stars awarded'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {exam.countsTowardPerformance ? 'Counts toward performance tracking' : 'Practice-only assessment'}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border p-4">
                            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {exam.description || exam.instructions || 'No description provided yet.'}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link href={`/admin/exams/${exam.id}/edit?sme=1`}>
                                <Button>Open Full Editor</Button>
                            </Link>
                            <Link href={`/admin/exams/${exam.id}/questions?sme=1`}>
                                <Button variant="outline">Manage Questions</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
