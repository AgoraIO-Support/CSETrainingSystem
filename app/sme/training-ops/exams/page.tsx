'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Edit, FileQuestion, Loader2, Send, Trash2, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiClient } from '@/lib/api-client'
import type { TrainingOpsExamSummary } from '@/types'

export default function SmeTrainingOpsExamsPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [exams, setExams] = useState<TrainingOpsExamSummary[]>([])
    const [deleteTarget, setDeleteTarget] = useState<TrainingOpsExamSummary | null>(null)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        void load()
    }, [])

    const load = async () => {
        try {
            setLoading(true)
            const response = await ApiClient.getSmeTrainingOpsExams()
            setExams(response.data)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load exams')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return

        try {
            setDeleting(true)
            setError(null)
            await ApiClient.deleteExam(deleteTarget.id)
            setDeleteTarget(null)
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete exam')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Managed Exams</h1>
                    <p className="mt-1 text-muted-foreground">
                        Exams you created through the SME workflow. You can create and edit only your own exams; Admin can access all exams.
                    </p>
                </div>

                {error ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Managed Exams</CardDescription>
                            <CardTitle className="text-3xl">{exams.length}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Draft</CardDescription>
                            <CardTitle className="text-3xl">{exams.filter((exam) => exam.status === 'DRAFT').length}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Published</CardDescription>
                            <CardTitle className="text-3xl">{exams.filter((exam) => exam.status === 'PUBLISHED').length}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>My Created Exams</CardTitle>
                        <CardDescription>Create, edit, and monitor the draft and published assessments you own.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-4 flex justify-end">
                            <Link href="/admin/exams/create?sme=1">
                                <Button>Create Exam</Button>
                            </Link>
                        </div>
                        {loading ? (
                            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading exams...
                            </div>
                        ) : exams.length === 0 ? (
                            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                                No SME-managed exams yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {exams.map((exam) => (
                                    <div key={exam.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold">{exam.title}</h3>
                                                <Badge variant="outline">{exam.status}</Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <span>{exam.invitationCount ?? 0} invitations</span>
                                                <span>{exam.attemptCount ?? 0} attempts</span>
                                                <span>{exam.passRate ?? 0}% pass rate</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Link href={`/admin/exams/${exam.id}/questions?sme=1`}>
                                                <Button variant="ghost" size="icon" title="Manage Questions">
                                                    <FileQuestion className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Link href={`/admin/exams/${exam.id}/invitations?sme=1`}>
                                                <Button variant="ghost" size="icon" title="Manage Invitations">
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Link href={`/admin/exams/${exam.id}/attempts?sme=1`}>
                                                <Button variant="ghost" size="icon" title="View Attempts">
                                                    <Users className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Link href={`/admin/exams/${exam.id}/analytics?sme=1`}>
                                                <Button variant="ghost" size="icon" title="View Analytics">
                                                    <BarChart3 className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Link href={`/admin/exams/${exam.id}/edit?sme=1`}>
                                                <Button variant="ghost" size="icon" title="Edit Exam">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Delete Exam"
                                                className="text-red-500 hover:text-red-600"
                                                onClick={() => setDeleteTarget(exam)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <ConfirmDialog
                    open={Boolean(deleteTarget)}
                    onOpenChange={(open) => {
                        if (!open && !deleting) setDeleteTarget(null)
                    }}
                    title="Delete Exam"
                    description={
                        deleteTarget
                            ? `Delete "${deleteTarget.title}"? This action cannot be undone.`
                            : 'Delete this exam?'
                    }
                    confirmLabel={deleting ? 'Deleting...' : 'Delete'}
                    confirmVariant="destructive"
                    confirmDisabled={deleting}
                    onConfirm={handleDelete}
                />
            </div>
        </DashboardLayout>
    )
}
