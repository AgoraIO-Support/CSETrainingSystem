'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
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
            const normalized = (response.data as any[]).map((exam) => {
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

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return null
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
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
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">My Exams</h1>
                    <p className="text-muted-foreground mt-1">
                        View available exams and track your progress
                    </p>
                </div>

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Available Exams</CardTitle>
                            <FileQuestion className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{availableExams.length}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Exams Passed</CardTitle>
                            <Trophy className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{passedCount}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
                            <Play className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {exams.reduce((sum, e) => sum + (e.userAttempts ?? 0), 0)}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Exam List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Available Exams</CardTitle>
                        <CardDescription>Exams you can take</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {availableExams.length === 0 ? (
                            <div className="text-center py-12">
                                <FileQuestion className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No exams available at this time</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {availableExams.map(exam => (
                                    <div
                                        key={exam.id}
                                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-semibold text-lg">{exam.title}</h3>
                                                {exam.hasPassed && (
                                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200">
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
                                                    Attempts: {exam.userAttempts}/{exam.maxAttempts}
                                                </span>
                                                {exam.deadline && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-4 w-4" />
                                                        Due: {formatDate(exam.deadline)}
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
                                        </div>

                                        <div className="ml-4">
                                            <Link href={`/exams/${exam.id}`}>
                                                <Button
                                                    disabled={exam.userAttempts >= exam.maxAttempts && !exam.hasPassed}
                                                >
                                                    {exam.userAttempts === 0 ? (
                                                        <>
                                                            <Play className="h-4 w-4 mr-2" />
                                                            Start Exam
                                                        </>
                                                    ) : exam.userAttempts >= exam.maxAttempts ? (
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
                                <Trophy className="h-5 w-5 text-yellow-500" />
                                Completed Exams
                            </CardTitle>
                            <CardDescription>Exams you have passed</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {completedExams.map(exam => (
                                    <div
                                        key={exam.id}
                                        className="flex items-center justify-between p-3 border rounded-lg bg-green-50 dark:bg-green-900/10"
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
                                        <Link href={`/exams/${exam.id}/result`}>
                                            <Button variant="outline" size="sm">
                                                View Certificate
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
