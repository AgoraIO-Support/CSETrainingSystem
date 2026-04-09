'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import { buildExamScheduleDisplay } from '@/lib/exam-timezone'
import {
    ArrowLeft,
    Loader2,
    Clock,
    FileQuestion,
    CheckCircle,
    XCircle,
    Play,
    AlertCircle,
    Calendar,
    Target,
    RotateCcw,
    Info,
    Award,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam } from '@/types'

interface ExamDetails extends Exam {
    questionsCount: number
    userAttempts: Array<{
        id: string
        attemptNumber: number
        status: string
        percentageScore: number | null
        passed: boolean | null
        submittedAt: string | null
    }>
    canAttempt: boolean
    remainingAttempts: number
    accessReason?: string
}

type RawExamDetails = Exam & {
    questionCount?: number
    questionsCount?: number
    canTake?: boolean
    canAttempt?: boolean
    remainingAttempts?: number
    accessReason?: string
    userAttempts?: Array<{
        id: string
        attemptNumber: number
        status: string
        percentageScore: number | null
        passed: boolean | null
        submittedAt: string | null
    }>
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function ExamIntroPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const router = useRouter()
    const [exam, setExam] = useState<ExamDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadExam()
    }, [examId])

    const loadExam = async () => {
        setLoading(true)
        try {
            const [examRes, attemptsRes] = await Promise.all([
                ApiClient.getExamDetails(examId),
                ApiClient.getUserExamAttempts(examId),
            ])

            const rawExam = examRes?.data as RawExamDetails
            const attempts = attemptsRes?.data ?? []

            // Backward/forward compatible normalization:
            // - API may return `questionCount` + `canTake`
            // - UI expects `questionsCount` + `canAttempt` + `userAttempts[]`
            setExam({
                ...rawExam,
                questionsCount: rawExam?.questionsCount ?? rawExam?.questionCount ?? 0,
                canAttempt: rawExam?.canAttempt ?? rawExam?.canTake ?? false,
                remainingAttempts: rawExam?.remainingAttempts ?? 0,
                accessReason: rawExam?.accessReason,
                userAttempts: Array.isArray(rawExam?.userAttempts) ? rawExam.userAttempts : attempts,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load exam')
        } finally {
            setLoading(false)
        }
    }

    const handleStartExam = async () => {
        setStarting(true)
        setError(null)
        try {
            // Check for existing in-progress attempt first
            const currentResponse = await ApiClient.getCurrentAttempt(examId)
            if (currentResponse.data) {
                // Resume existing attempt
                router.push(`/exams/${examId}/take`)
            } else {
                // Start new attempt
                await ApiClient.startExamAttempt(examId)
                router.push(`/exams/${examId}/take`)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start exam')
            setStarting(false)
        }
    }

    const formatLocalDateTime = (date: string | Date | null | undefined) => {
        if (!date) return '-'
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

    if (!exam) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">{error || 'Exam not found'}</p>
                    <Link href="/exams">
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const hasPassed = exam.userAttempts.some(a => a.passed === true)
    const availableFromSchedule = buildExamScheduleDisplay(exam.availableFrom, exam.timezone)
    const deadlineSchedule = buildExamScheduleDisplay(exam.deadline, exam.timezone)
    const bestAttempt = exam.userAttempts.reduce((best, current) => {
        if (current.percentageScore === null) return best
        if (!best || (best.percentageScore ?? 0) < current.percentageScore) return current
        return best
    }, null as typeof exam.userAttempts[0] | null)

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-4">
                    <Link href="/exams">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold">{exam.title}</h1>
                            {hasPassed && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Passed
                                </Badge>
                            )}
                        </div>
                        {exam.course && (
                            <p className="text-muted-foreground mt-1">
                                Course: {exam.course.title}
                            </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline">{exam.assessmentKind ?? 'PRACTICE'}</Badge>
                            {exam.countsTowardPerformance ? <Badge>Performance</Badge> : null}
                            {exam.awardsStars && exam.starValue ? <Badge variant="secondary">+{exam.starValue} stars on pass</Badge> : null}
                            {exam.certificateEligible ? <Badge variant="outline">Certificate on pass</Badge> : null}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {exam.accessReason === 'EXAM_DEADLINE_PASSED' && (
                    <div className="p-4 bg-amber-50 text-amber-800 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        This exam is still assigned to you, but the deadline has passed.
                    </div>
                )}

                {exam.accessReason === 'EXAM_NOT_AVAILABLE_YET' && (
                    <div className="p-4 bg-blue-50 text-blue-800 rounded-lg flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        This exam is assigned to you, but it is not available yet.
                    </div>
                )}

                {/* Exam Info Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <FileQuestion className="h-4 w-4" />
                                Questions
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{exam.questionsCount}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Time Limit
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {exam.timeLimit ? `${exam.timeLimit} min` : 'No limit'}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Target className="h-4 w-4" />
                                Passing Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {exam.passingScore}/{exam.totalScore}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {Math.round((exam.passingScore / exam.totalScore) * 100)}% required
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <RotateCcw className="h-4 w-4" />
                                Attempts
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {exam.userAttempts.length}/{exam.maxAttempts}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {exam.remainingAttempts} remaining
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Description & Instructions */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5" />
                            About This Exam
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {exam.description && (
                            <div>
                                <h4 className="font-medium mb-2">Description</h4>
                                <p className="text-muted-foreground">{exam.description}</p>
                            </div>
                        )}

                        {exam.instructions && (
                            <div>
                                <h4 className="font-medium mb-2">Instructions</h4>
                                <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                                    {exam.instructions}
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            {availableFromSchedule && (
                                <div className="flex items-start gap-2 text-sm">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p>Available from (your local time): {availableFromSchedule.localLabel}</p>
                                        {availableFromSchedule.viewerTimeZone !== availableFromSchedule.examTimeZone && (
                                            <p className="text-xs text-muted-foreground">
                                                Exam timezone ({availableFromSchedule.examTimeZone}): {availableFromSchedule.examLabel}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                            {deadlineSchedule && (
                                <div className="flex items-start gap-2 text-sm">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p>Deadline (your local time): {deadlineSchedule.localLabel}</p>
                                        {deadlineSchedule.viewerTimeZone !== deadlineSchedule.examTimeZone && (
                                            <p className="text-xs text-muted-foreground">
                                                Exam timezone ({deadlineSchedule.examTimeZone}): {deadlineSchedule.examLabel}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
                            <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                                Important Notes
                            </h4>
                            <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
                                {exam.timeLimit && (
                                    <li>You have {exam.timeLimit} minutes to complete this exam</li>
                                )}
                                <li>You have {exam.remainingAttempts} attempt(s) remaining</li>
                                {exam.awardsStars && exam.starValue ? (
                                    <li>Passing this exam earns {exam.starValue} star{exam.starValue > 1 ? 's' : ''}</li>
                                ) : (
                                    <li>This assessment does not award stars</li>
                                )}
                                {exam.certificateEligible ? (
                                    <li>A certificate will be issued automatically if you pass</li>
                                ) : (
                                    <li>No certificate is issued for this assessment</li>
                                )}
                                {exam.randomizeQuestions && <li>Questions will be presented in random order</li>}
                                {exam.showResultsImmediately ? (
                                    <li>Results will be shown immediately after submission</li>
                                ) : (
                                    <li>Results will be available after grading is complete</li>
                                )}
                                <li>Your progress is saved automatically</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>

                {/* Previous Attempts */}
                {exam.userAttempts.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Previous Attempts</CardTitle>
                            <CardDescription>Your exam history</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {exam.userAttempts.map(attempt => (
                                    <div
                                        key={attempt.id}
                                        className={`flex items-center justify-between p-3 border rounded-lg ${
                                            attempt.passed
                                                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                                                : attempt.passed === false
                                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                                                    : ''
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {attempt.passed === true ? (
                                                <CheckCircle className="h-5 w-5 text-green-600" />
                                            ) : attempt.passed === false ? (
                                                <XCircle className="h-5 w-5 text-red-600" />
                                            ) : (
                                                <Clock className="h-5 w-5 text-muted-foreground" />
                                            )}
                                            <div>
                                                <p className="font-medium">Attempt #{attempt.attemptNumber}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {attempt.submittedAt
                                                        ? formatLocalDateTime(attempt.submittedAt)
                                                        : 'In progress'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {attempt.percentageScore !== null && (
                                                <span className={`text-lg font-bold ${
                                                    attempt.passed ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                    {attempt.percentageScore}%
                                                </span>
                                            )}
                                            {attempt.status !== 'IN_PROGRESS' && (
                                                <Link href={`/exams/${examId}/result?attemptId=${attempt.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        View Details
                                                    </Button>
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Best Score Card */}
                {bestAttempt && bestAttempt.passed && (
                    <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <Award className="h-12 w-12 text-yellow-600" />
                                    <div>
                                        <h3 className="font-bold text-lg">Congratulations!</h3>
                                        <p className="text-muted-foreground">
                                            You passed with a score of {bestAttempt.percentageScore}%
                                        </p>
                                    </div>
                                </div>
                                <Link href={`/certificates`}>
                                    <Button>
                                        <Award className="h-4 w-4 mr-2" />
                                        View Certificate
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Start Button */}
                <div className="flex items-center justify-center gap-4 pt-4">
                    <Link href="/exams">
                        <Button variant="outline" size="lg">
                            Back to Exams
                        </Button>
                    </Link>

                    {exam.canAttempt ? (
                        <Button size="lg" onClick={handleStartExam} disabled={starting}>
                            {starting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Starting...
                                </>
                            ) : exam.userAttempts.some(a => a.status === 'IN_PROGRESS') ? (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Resume Exam
                                </>
                            ) : exam.userAttempts.length > 0 ? (
                                <>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Retry Exam
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Start Exam
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button size="lg" disabled>
                            {exam.accessReason === 'EXAM_DEADLINE_PASSED'
                                ? 'Deadline Passed'
                                : exam.accessReason === 'EXAM_NOT_AVAILABLE_YET'
                                    ? 'Not Available Yet'
                                    : exam.remainingAttempts === 0
                                        ? 'No attempts remaining'
                                        : 'Exam not available'}
                        </Button>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
