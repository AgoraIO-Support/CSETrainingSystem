'use client'

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    Search,
    Eye,
    Download,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    FileText,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamAttempt, ExamAttemptStatus } from '@/types'

const statusConfig: Record<ExamAttemptStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    IN_PROGRESS: { label: 'In Progress', variant: 'outline' },
    SUBMITTED: { label: 'Submitted', variant: 'secondary' },
    GRADED: { label: 'Graded', variant: 'default' },
    EXPIRED: { label: 'Expired', variant: 'destructive' },
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function ExamAttemptsPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const searchParams = useSearchParams()
    const isSmeMode = searchParams.get('sme') === '1'
    const [exam, setExam] = useState<Exam | null>(null)
    const [attempts, setAttempts] = useState<ExamAttempt[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<ExamAttemptStatus | 'ALL'>('ALL')
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        loadData()
    }, [examId, statusFilter])

    const loadData = async () => {
        setLoading(true)
        try {
            const params: Record<string, string | number> = { limit: 100 }
            if (statusFilter !== 'ALL') {
                params.status = statusFilter
            }
            const [examRes, attemptsRes] = await Promise.all([
                ApiClient.getAdminExam(examId),
                ApiClient.getExamAttempts(examId, params),
            ])
            setExam(examRes.data)
            setAttempts(attemptsRes.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            const blob = await ApiClient.exportExamResults(examId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `exam-results-${examId}.csv`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export results')
        } finally {
            setExporting(false)
        }
    }

    const filteredAttempts = attempts.filter(attempt => {
        const query = searchQuery.toLowerCase()
        return !query ||
            attempt.user?.name?.toLowerCase().includes(query) ||
            attempt.user?.email?.toLowerCase().includes(query)
    })

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return '-'
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    const formatDuration = (start: string | Date, end: string | Date | null | undefined) => {
        if (!end) return '-'
        const startTime = new Date(start).getTime()
        const endTime = new Date(end).getTime()
        const minutes = Math.round((endTime - startTime) / 60000)
        if (minutes < 60) return `${minutes}m`
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${hours}h ${mins}m`
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        )
    }

    if (!exam) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Exam not found</p>
                    <Link href={isSmeMode ? '/sme/training-ops/exams' : '/admin/exams'}>
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const stats = {
        total: attempts.length,
        submitted: attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'GRADED').length,
        passed: attempts.filter(a => a.passed === true).length,
        avgScore: attempts.filter(a => a.percentageScore !== null).length > 0
            ? Math.round(
                attempts.filter(a => a.percentageScore !== null)
                    .reduce((sum, a) => sum + (a.percentageScore || 0), 0) /
                attempts.filter(a => a.percentageScore !== null).length
            )
            : 0,
    }

    const needsGrading = attempts.filter(a => a.hasEssays && !a.essaysGraded && a.status === 'SUBMITTED')

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={isSmeMode ? '/sme/training-ops/exams' : '/admin/exams'}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Exam Attempts</h1>
                            <p className="text-muted-foreground mt-1">{exam.title}</p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={handleExport} disabled={exporting || attempts.length === 0}>
                        {exporting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        Export CSV
                    </Button>
                </div>

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {needsGrading.length > 0 && (
                    <div className="p-4 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            <span className="font-medium">{needsGrading.length} attempt(s) need essay grading</span>
                        </div>
                        <Link href={`/admin/exams/${examId}/attempts/${needsGrading[0].id}${isSmeMode ? '?sme=1' : ''}`}>
                            <Button variant="outline" size="sm">
                                <FileText className="h-4 w-4 mr-2" />
                                Start Grading
                            </Button>
                        </Link>
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.total}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Submitted</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.submitted}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Passed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{stats.passed}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.avgScore}%</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search by user name or email..."
                                    className="pl-10"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="h-10 px-3 border rounded-md bg-background"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as ExamAttemptStatus | 'ALL')}
                            >
                                <option value="ALL">All Status</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="SUBMITTED">Submitted</option>
                                <option value="GRADED">Graded</option>
                                <option value="EXPIRED">Expired</option>
                            </select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Attempts ({filteredAttempts.length})</CardTitle>
                        <CardDescription>All exam attempts</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {filteredAttempts.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">
                                    {searchQuery ? 'No attempts match your search' : 'No attempts yet'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-muted-foreground border-b">
                                            <th className="py-3 pr-4 font-medium">User</th>
                                            <th className="py-3 pr-4 font-medium">Attempt</th>
                                            <th className="py-3 pr-4 font-medium">Status</th>
                                            <th className="py-3 pr-4 font-medium">Started</th>
                                            <th className="py-3 pr-4 font-medium">Duration</th>
                                            <th className="py-3 pr-4 font-medium">Score</th>
                                            <th className="py-3 pr-4 font-medium">Result</th>
                                            <th className="py-3 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAttempts.map(attempt => (
                                            <tr key={attempt.id} className="border-b last:border-none">
                                                <td className="py-3 pr-4">
                                                    <div>
                                                        <p className="font-medium">{attempt.user?.name || 'Unknown'}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {attempt.user?.email}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="py-3 pr-4">
                                                    #{attempt.attemptNumber}
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <Badge variant={statusConfig[attempt.status].variant}>
                                                        {statusConfig[attempt.status].label}
                                                    </Badge>
                                                    {attempt.hasEssays && !attempt.essaysGraded && attempt.status === 'SUBMITTED' && (
                                                        <Badge variant="outline" className="ml-2 text-amber-600">
                                                            Needs Grading
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-3 pr-4 text-muted-foreground">
                                                    {formatDate(attempt.startedAt)}
                                                </td>
                                                <td className="py-3 pr-4 text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-4 w-4" />
                                                        {formatDuration(attempt.startedAt, attempt.submittedAt)}
                                                    </span>
                                                </td>
                                                <td className="py-3 pr-4">
                                                    {attempt.percentageScore !== null ? (
                                                        <span className="font-medium">
                                                            {attempt.rawScore}/{exam.totalScore} ({attempt.percentageScore}%)
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </td>
                                                <td className="py-3 pr-4">
                                                    {attempt.passed === true && (
                                                        <span className="flex items-center gap-1 text-green-600">
                                                            <CheckCircle className="h-4 w-4" />
                                                            Passed
                                                        </span>
                                                    )}
                                                    {attempt.passed === false && (
                                                        <span className="flex items-center gap-1 text-red-600">
                                                            <XCircle className="h-4 w-4" />
                                                            Failed
                                                        </span>
                                                    )}
                                                    {attempt.passed === null && attempt.status !== 'IN_PROGRESS' && (
                                                        <span className="text-muted-foreground">Pending</span>
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    <Link href={`/admin/exams/${examId}/attempts/${attempt.id}${isSmeMode ? '?sme=1' : ''}`}>
                                                        <Button variant="ghost" size="sm">
                                                            <Eye className="h-4 w-4 mr-1" />
                                                            View
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
