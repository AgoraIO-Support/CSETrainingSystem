'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ExamManagementActions } from '@/components/exam/exam-management-actions'
import { ApiClient } from '@/lib/api-client'
import { formatDateTimeInExamTimeZone } from '@/lib/exam-timezone'
import {
    Search,
    Plus,
    Loader2,
    FileQuestion,
    Users,
    Clock,
    CheckCircle,
    AlertCircle,
    ClipboardList,
    BookOpen,
    GraduationCap,
    TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamStatus } from '@/types'

const statusConfig: Record<ExamStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    DRAFT: { label: 'Draft', variant: 'secondary' },
    PENDING_REVIEW: { label: 'Pending Review', variant: 'outline' },
    APPROVED: { label: 'Approved', variant: 'default' },
    PUBLISHED: { label: 'Published', variant: 'default' },
    CLOSED: { label: 'Closed', variant: 'destructive' },
    ARCHIVED: { label: 'Archived', variant: 'secondary' },
}

interface StatCardProps {
    title: string
    value: string | number
    helper: string
    icon: React.ComponentType<{ className?: string }>
}

function StatCard({ title, value, helper, icon: Icon }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{helper}</p>
            </CardContent>
        </Card>
    )
}

export default function AdminExamsPage() {
    const [exams, setExams] = useState<Exam[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<ExamStatus | 'ALL'>('ALL')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [errorDialogMessage, setErrorDialogMessage] = useState('')

    useEffect(() => {
        let cancelled = false
        const loadExams = async () => {
            setLoading(true)
            setError(null)
            try {
                const params: Record<string, string | number> = { limit: 50 }
                if (statusFilter !== 'ALL') {
                    params.status = statusFilter
                }
                const response = await ApiClient.getAdminExams(params)
                if (!cancelled) {
                    setExams(response.data)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load exams')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadExams()
        return () => {
            cancelled = true
        }
    }, [statusFilter])

    const filteredExams = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()
        return exams.filter((exam) => {
            if (statusFilter === 'ALL') {
                if (exam.status === 'ARCHIVED') return false
            } else if (exam.status !== statusFilter) {
                return false
            }

            if (!query) return true

            return (
                exam.title.toLowerCase().includes(query) ||
                exam.description?.toLowerCase().includes(query) ||
                exam.course?.title?.toLowerCase().includes(query)
            )
        })
    }, [exams, searchQuery, statusFilter])

    const stats = useMemo(() => {
        const visible = exams.filter(e => e.status !== 'ARCHIVED')
        const total = visible.length
        const published = visible.filter(e => e.status === 'PUBLISHED').length
        const draft = visible.filter(e => e.status === 'DRAFT').length
        const totalAttempts = visible.reduce((sum, e) => sum + (e._count?.attempts ?? 0), 0)
        return { total, published, draft, totalAttempts }
    }, [exams])

    const handleDelete = (examId: string) => {
        setPendingDeleteId(examId)
        setConfirmDeleteOpen(true)
    }

    const confirmDelete = async () => {
        const examId = pendingDeleteId
        if (!examId) {
            setConfirmDeleteOpen(false)
            return
        }
        setConfirmDeleteOpen(false)
        setPendingDeleteId(null)

        try {
            await ApiClient.deleteExam(examId)
            setExams(prev => prev.filter(exam => exam.id !== examId))
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete exam'
            setError(message)
            setErrorDialogMessage(message)
            setErrorDialogOpen(true)
        }
    }

    const formatDate = (date: string | Date | null | undefined, timeZone = 'UTC') => {
        if (!date) return '-'
        return formatDateTimeInExamTimeZone(date, timeZone, { includeTimeZoneName: true })
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Exam Management</h1>
                        <p className="text-muted-foreground mt-1">
                            Create and manage exams with AI-powered question generation
                        </p>
                    </div>
                    <Link href="/admin/exams/create">
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Exam
                        </Button>
                    </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Exams" value={stats.total} helper="Across all courses" icon={ClipboardList} />
                    <StatCard title="Published" value={stats.published} helper="Currently available" icon={BookOpen} />
                    <StatCard title="Drafts" value={stats.draft} helper="Needs configuration" icon={GraduationCap} />
                    <StatCard title="Total Attempts" value={stats.totalAttempts} helper="All time" icon={TrendingUp} />
                </div>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search exams..."
                                    className="pl-10"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="h-10 px-3 border rounded-md bg-background"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as ExamStatus | 'ALL')}
                            >
                                <option value="ALL">All Status</option>
                                <option value="DRAFT">Draft</option>
                                <option value="PENDING_REVIEW">Pending Review</option>
                                <option value="APPROVED">Approved</option>
                                <option value="PUBLISHED">Published</option>
                                <option value="CLOSED">Closed</option>
                                <option value="ARCHIVED">Archived</option>
                            </select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>All Exams ({filteredExams.length})</CardTitle>
                        <CardDescription>Manage your exam library</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-12">
                                <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
                                <p className="font-medium mb-2">Unable to load exams</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredExams.map(exam => (
                                    <div
                                        key={exam.id}
                                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className="font-semibold">{exam.title}</h4>
                                                <Badge variant={(statusConfig[exam.status] ?? { variant: 'outline', label: exam.status }).variant}>
                                                    {(statusConfig[exam.status] ?? { variant: 'outline', label: exam.status }).label}
                                                </Badge>
                                            </div>
                                            {exam.description && (
                                                <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                                                    {exam.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-6 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <FileQuestion className="h-4 w-4" />
                                                    {exam._count?.questions ?? 0} questions
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-4 w-4" />
                                                    {exam._count?.attempts ?? 0} attempts
                                                </span>
                                                {exam.timeLimit && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-4 w-4" />
                                                        {exam.timeLimit} min
                                                    </span>
                                                )}
                                                {exam.course && (
                                                    <span className="flex items-center gap-1">
                                                        <BookOpen className="h-4 w-4" />
                                                        {exam.course.title}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <CheckCircle className="h-4 w-4" />
                                                    Pass: {exam.passingScore}/{exam.totalScore}
                                                </span>
                                                {exam.deadline && (
                                                    <span>Deadline: {formatDate(exam.deadline, exam.timezone)}</span>
                                                )}
                                            </div>
                                            {exam.course && (
                                                <div className="mt-2">
                                                    <Badge variant="secondary" className="text-xs">
                                                        Course: {exam.course.title}
                                                    </Badge>
                                                </div>
                                            )}
                                        </div>
                                        <ExamManagementActions
                                            questionsHref={`/admin/exams/${exam.id}/questions`}
                                            invitationsHref={`/admin/exams/${exam.id}/invitations`}
                                            attemptsHref={`/admin/exams/${exam.id}/attempts`}
                                            analyticsHref={`/admin/exams/${exam.id}/analytics`}
                                            editHref={`/admin/exams/${exam.id}/edit`}
                                            onDelete={() => handleDelete(exam.id)}
                                        />
                                    </div>
                                ))}
                                {filteredExams.length === 0 && (
                                    <div className="text-center py-12">
                                        <FileQuestion className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            {searchQuery ? 'No exams match your search.' : 'No exams yet. Create your first exam!'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={(open) => {
                    setConfirmDeleteOpen(open)
                    if (!open) setPendingDeleteId(null)
                }}
                title="Delete exam?"
                description="If the exam already has attempts, it will be archived instead of permanently deleted."
                confirmLabel="Delete"
                confirmVariant="destructive"
                onConfirm={confirmDelete}
            />
            <ConfirmDialog
                open={errorDialogOpen}
                onOpenChange={setErrorDialogOpen}
                title="Unable to delete exam"
                description={errorDialogMessage}
                confirmLabel="OK"
                showCancel={false}
                onConfirm={() => setErrorDialogOpen(false)}
            />
        </DashboardLayout>
    )
}
