'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
import { buildExamScheduleDisplay } from '@/lib/exam-timezone'
import {
    Loader2,
    Clock,
    FileQuestion,
    CheckCircle,
    XCircle,
    Trophy,
    Play,
    AlertCircle,
    Calendar,
    Eye,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam } from '@/types'

type ExamListItem = Exam & {
    // Backward/forward compatibility with API responses.
    // Newer API returns `questionCount` and `userStatus` instead of `userAttempts/bestScore/hasPassed`.
    questionCount?: number
    userStatus?: {
        completedAttempts: number
        remainingAttempts: number
        hasInProgressAttempt: boolean
        inProgressAttemptId?: string | null
        bestScore?: number | null
        hasPassed: boolean
    }
    userAttempts?: number
    bestScore?: number | null
    hasPassed?: boolean
    attemptResults?: Array<{
        id: string
        attemptNumber: number
        status: string
        percentageScore: number | null
        passed: boolean | null
        submittedAt: string | null
    }>
}

type RawExamListItem = Exam & {
    questionCount?: number
    _count?: { questions?: number }
    userStatus?: {
        completedAttempts: number
        remainingAttempts: number
        hasInProgressAttempt: boolean
        inProgressAttemptId?: string | null
        bestScore?: number | null
        hasPassed: boolean
    }
    userAttempts?: number
    bestScore?: number | null
    hasPassed?: boolean
    attemptResults?: Array<{
        id: string
        attemptNumber: number
        status: string
        percentageScore: number | null
        passed: boolean | null
        submittedAt: string | null
    }>
}

export default function ExamsPage() {
    const [exams, setExams] = useState<ExamListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadExams()
    }, [])

    const loadExams = async () => {
        setLoading(true)
        try {
            const response = await ApiClient.getAvailableExams()
            const normalized = (response.data as RawExamListItem[]).map((exam) => {
                const attemptsUsed = Number.isFinite(exam.userAttempts)
                    ? exam.userAttempts
                    : exam.userStatus
                        ? exam.userStatus.completedAttempts + (exam.userStatus.hasInProgressAttempt ? 1 : 0)
                        : 0
                const bestScore = exam.bestScore ?? exam.userStatus?.bestScore ?? null
                const hasPassed = exam.hasPassed ?? exam.userStatus?.hasPassed ?? false
                const questionCount = exam._count?.questions ?? exam.questionCount ?? exam.questionCount ?? 0

                return {
                    ...exam,
                    userAttempts: attemptsUsed,
                    bestScore,
                    hasPassed,
                    attemptResults: exam.attemptResults ?? [],
                    _count: exam._count ?? { questions: questionCount },
                } as ExamListItem
            })
            setExams(normalized)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load exams')
        } finally {
            setLoading(false)
        }
    }

    const isDeadlineSoon = (deadline: string | Date | null | undefined) => {
        if (!deadline) return false
        const deadlineDate = new Date(deadline)
        const now = new Date()
        const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return daysLeft <= 3 && daysLeft > 0
    }

    const isDeadlinePassed = (deadline: string | Date | null | undefined) => {
        if (!deadline) return false
        return new Date(deadline) < new Date()
    }

    const formatAttemptSubmittedAt = (date: string | Date | null | undefined) => {
        if (!date) return 'Pending grading'
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
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

    const availableExams = exams.filter(e => !isDeadlinePassed(e.deadline))
    const completedExams = exams.filter(e => e.hasPassed)
    const passedCount = completedExams.length

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[1.75fr_1fr]">
                    <Card className="overflow-hidden">
                        <CardContent className="p-7 md:p-8">
                            <div className="space-y-4">
                                <Badge className="w-fit">Assessment Workspace</Badge>
                                <div className="space-y-3">
                                    <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
                                        My exams
                                    </h1>
                                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                                        Review assigned assessments, track attempts, and open graded results from one streamlined queue.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Current status</CardTitle>
                            <CardDescription>Snapshot of your exam workload</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Available now
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{availableExams.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Passed
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-emerald-700">{passedCount}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {error && (
                    <div className="flex items-center gap-2 rounded-2xl border border-destructive/15 bg-destructive/5 p-4 text-destructive">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Available Exams</CardTitle>
                            <FileQuestion className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em]">{availableExams.length}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Exams Passed</CardTitle>
                            <Trophy className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em] text-emerald-700">{passedCount}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Total Attempts</CardTitle>
                            <Play className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em]">
                                {exams.reduce((sum, e) => sum + (e.userAttempts ?? 0), 0)}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Assigned exams</CardTitle>
                        <CardDescription>All assigned assessments, including historical and expired items.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {exams.length === 0 ? (
                            <div className="py-12 text-center">
                                <FileQuestion className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No exams available at this time</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {exams.map(exam => (
                                    <div
                                        key={exam.id}
                                        className="flex flex-col gap-4 rounded-[1.35rem] border border-slate-200/70 bg-white p-5 transition-all duration-200 hover:border-[#00c2ff]/10 hover:shadow-lg hover:shadow-[#006688]/5 md:flex-row md:items-start md:justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-semibold tracking-[-0.03em]">{exam.title}</h3>
                                                {exam.hasPassed && (
                                                    <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 dark:bg-green-900/20 dark:text-green-200">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Passed
                                                    </Badge>
                                                )}
                                                {isDeadlineSoon(exam.deadline) && !exam.hasPassed && (
                                                    <Badge variant="destructive">
                                                        <AlertCircle className="h-3 w-3 mr-1" />
                                                        Deadline Soon
                                                    </Badge>
                                                )}
                                                {isDeadlinePassed(exam.deadline) && (
                                                    <Badge variant="outline">
                                                        Expired
                                                    </Badge>
                                                )}
                                            </div>

                                            {exam.description && (
                                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                                    {exam.description}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-6 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <FileQuestion className="h-4 w-4" />
                                                    {exam._count?.questions ?? 0} questions
                                                </span>
                                                {exam.timeLimit && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-4 w-4" />
                                                        {exam.timeLimit} min
                                                    </span>
                                                )}
                                                <span>
                                                    Pass: {exam.passingScore}/{exam.totalScore}
                                                </span>
                                                <span>
                                                    Attempts: {(exam.userAttempts ?? 0)}/{exam.maxAttempts}
                                                </span>
                                                {exam.deadline && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-4 w-4" />
                                                        Due (your local time): {buildExamScheduleDisplay(exam.deadline, exam.timezone)?.localLabel}
                                                    </span>
                                                )}
                                            </div>

                                            {exam.bestScore !== null && (
                                                <div className="mt-3">
                                                    <div className="flex items-center justify-between text-sm mb-1">
                                                        <span>Best Score</span>
                                                        <span className="font-medium">{exam.bestScore}%</span>
                                                    </div>
                                                    <Progress
                                                        value={exam.bestScore}
                                                        className={exam.hasPassed ? '[&>div]:bg-green-500' : ''}
                                                    />
                                                </div>
                                            )}

                                            {exam.course && (
                                                <div className="mt-2">
                                                    <Badge variant="secondary" className="text-xs">
                                                        Course: {exam.course.title}
                                                    </Badge>
                                                </div>
                                            )}

                                            {exam.attemptResults && exam.attemptResults.length > 0 && (
                                                <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                        Attempt Results
                                                    </p>
                                                    <div className="mt-3 space-y-2">
                                                        {exam.attemptResults.map((attempt) => (
                                                            <div
                                                                key={attempt.id}
                                                                className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/80 px-4 py-3 md:flex-row md:items-center md:justify-between"
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                                                    <span className="font-medium">
                                                                        Attempt #{attempt.attemptNumber}
                                                                    </span>
                                                                    {attempt.passed === true ? (
                                                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200">
                                                                            Passed
                                                                        </Badge>
                                                                    ) : attempt.passed === false ? (
                                                                        <Badge variant="secondary">
                                                                            Not Passed
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="outline">
                                                                            {attempt.status === 'GRADED' ? 'Graded' : 'Submitted'}
                                                                        </Badge>
                                                                    )}
                                                                    {attempt.percentageScore !== null && (
                                                                        <span className="text-muted-foreground">
                                                                            Score: {attempt.percentageScore}%
                                                                        </span>
                                                                    )}
                                                                    <span className="text-muted-foreground">
                                                                        Submitted: {formatAttemptSubmittedAt(attempt.submittedAt)}
                                                                    </span>
                                                                </div>
                                                                <Link href={`/exams/${exam.id}/result?attemptId=${attempt.id}`}>
                                                                    <Button variant="outline" size="sm">
                                                                        <Eye className="h-4 w-4 mr-2" />
                                                                        Answer Review
                                                                    </Button>
                                                                </Link>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-1 md:ml-4">
                                            <Link href={`/exams/${exam.id}`}>
                                                <Button
                                                    className="w-full md:w-auto"
                                                    disabled={isDeadlinePassed(exam.deadline) || (exam.userAttempts ?? 0) >= exam.maxAttempts && !exam.hasPassed}
                                                >
                                                    {isDeadlinePassed(exam.deadline) ? (
                                                        'Deadline Passed'
                                                    ) : (exam.userAttempts ?? 0) === 0 ? (
                                                        <>
                                                            <Play className="h-4 w-4 mr-2" />
                                                            Start Exam
                                                        </>
                                                    ) : (exam.userAttempts ?? 0) >= exam.maxAttempts ? (
                                                        'View Results'
                                                    ) : (
                                                        <>
                                                            <Play className="h-4 w-4 mr-2" />
                                                            Retry
                                                        </>
                                                    )}
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Completed Exams */}
                {completedExams.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Trophy className="h-5 w-5 text-primary" />
                                Completed exams
                            </CardTitle>
                            <CardDescription>Assessments already cleared.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {completedExams.map(exam => (
                                    <div
                                        key={exam.id}
                                        className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 dark:bg-green-900/10"
                                    >
                                        <div className="flex items-center gap-3">
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                            <div>
                                                <p className="font-medium">{exam.title}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Best Score: {exam.bestScore}%
                                                </p>
                                            </div>
                                        </div>
                                        <Link href={`/exams/${exam.id}`}>
                                            <Button variant="outline" size="sm">
                                                View Exam
                                            </Button>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    )
}
