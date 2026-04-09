'use client'

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { RichTextContent } from '@/components/ui/rich-text-content'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    CheckCircle,
    XCircle,
    Trophy,
    Award,
    Clock,
    Target,
    RotateCcw,
    AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { ExamQuestionType } from '@/types'

interface ResultData {
    attemptId: string
    examId: string
    examTitle: string
    attemptNumber: number
    status: string
    startedAt: string
    submittedAt: string | null
    rawScore: number | null
    percentageScore: number | null
    passed: boolean | null
    totalScore: number
    passingScore: number
    allowReview: boolean
    assessmentKind?: 'PRACTICE' | 'READINESS' | 'FORMAL' | null
    awardsStars: boolean
    starValue?: number | null
    countsTowardPerformance: boolean
    maxAttempts: number
    attemptsUsed: number
    reviewUnlocked: boolean
    reviewUnlockedByPassing?: boolean
    reviewUnlockedByAttempts?: boolean
    reviewUnlockedByDeadline?: boolean
    rewardOutcome: {
        starsEarned: number
        badgesUnlocked: Array<{
            id: string
            name: string
            slug: string
            description: string | null
            learningSeries?: {
                id: string
                name: string
                slug: string
            } | null
        }>
        certificate: {
            eligible: boolean
            issued: boolean
            id: string | null
            title: string | null
            certificateNumber: string | null
        }
    }
    answers?: Array<{
        questionId: string
        question: string
        type: ExamQuestionType
        userAnswer: string | null
        selectedOption: number | null
        correctAnswer: string | null
        isCorrect: boolean | null
        pointsAwarded: number | null
        maxPoints: number
        explanation: string | null
        feedback?: string | null
    }>
}

const questionTypeLabels: Record<ExamQuestionType, string> = {
    SINGLE_CHOICE: 'Single Choice',
    MULTIPLE_CHOICE: 'Multiple Choice',
    TRUE_FALSE: 'True/False',
    FILL_IN_BLANK: 'Fill in Blank',
    ESSAY: 'Essay',
    EXERCISE: 'Exercise',
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function ExamResultPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const searchParams = useSearchParams()
    const attemptId = searchParams.get('attemptId')

    const [result, setResult] = useState<ResultData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showAnswers, setShowAnswers] = useState(false)

    useEffect(() => {
        loadResult()
    }, [examId, attemptId])

    useEffect(() => {
        if (!result?.reviewUnlocked && showAnswers) {
            setShowAnswers(false)
        }
    }, [result?.reviewUnlocked, showAnswers])

    const loadResult = async () => {
        setLoading(true)
        try {
            const response = await ApiClient.getExamResult(examId, attemptId || undefined)
            setResult(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load results')
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return '-'
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    const formatDuration = (start: string, end: string | null) => {
        if (!end) return '-'
        const startTime = new Date(start).getTime()
        const endTime = new Date(end).getTime()
        const minutes = Math.round((endTime - startTime) / 60000)
        if (minutes < 60) return `${minutes} min`
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

    if (error || !result) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <p className="text-muted-foreground">{error || 'Results not found'}</p>
                    <Link href="/exams">
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const isPending = result.status === 'SUBMITTED' && result.percentageScore === null
    const attemptsRemaining = Math.max(0, (result.maxAttempts ?? 0) - (result.attemptsUsed ?? 0))
    const earnedStarsLabel = result.rewardOutcome.starsEarned > 0
        ? `+${result.rewardOutcome.starsEarned} star${result.rewardOutcome.starsEarned > 1 ? 's' : ''} earned`
        : result.awardsStars
            ? 'No stars earned on this attempt'
            : 'This assessment does not award stars'
    const certificateStatusLabel = result.rewardOutcome.certificate.issued
        ? 'Certificate awarded'
        : result.rewardOutcome.certificate.eligible
            ? result.passed
                ? 'Certificate will be available after issuance completes'
                : 'Certificate is only awarded if you pass'
            : 'No certificate for this assessment'
    const reviewUnlockDescription = result.reviewUnlocked
        ? result.reviewUnlockedByPassing
            ? 'Review unlocked because you passed this attempt'
            : result.reviewUnlockedByAttempts
                ? 'Review unlocked because you used all available attempts'
                : 'Review unlocked because the exam deadline has passed'
        : `Unlocks after you pass, use all attempts, or the deadline passes (${result.attemptsUsed}/${result.maxAttempts} used)`
    const reviewUnlockTitle = !result.reviewUnlocked
        ? `Answer review unlocks after you pass, use all attempts, or the deadline passes (${attemptsRemaining} remaining)`
        : undefined

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-4">
                    <Link href="/exams">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">Exam Results</h1>
                        <p className="text-muted-foreground mt-1">{result.examTitle}</p>
                    </div>
                </div>

                {/* Result Summary */}
                {isPending ? (
                    <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                        <CardContent className="p-8 text-center">
                            <Clock className="h-16 w-16 text-amber-600 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold mb-2">Grading in Progress</h2>
                            <p className="text-muted-foreground mb-4">
                                Your exam has been submitted and is being graded.
                                Results will be available once grading is complete.
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Submitted: {formatDate(result.submittedAt)}
                            </p>
                        </CardContent>
                    </Card>
                ) : result.passed ? (
                    <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                        <CardContent className="p-8 text-center">
                            <Trophy className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
                            <h2 className="text-3xl font-bold text-green-700 dark:text-green-300 mb-2">
                                Congratulations!
                            </h2>
                            <p className="text-xl text-green-600 dark:text-green-400 mb-4">
                                You passed the exam!
                            </p>
                            <div className="text-5xl font-bold text-green-700 dark:text-green-300 mb-2">
                                {result.percentageScore}%
                            </div>
                            <p className="text-muted-foreground">
                                {result.rawScore} / {result.totalScore} points
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800">
                        <CardContent className="p-8 text-center">
                            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                            <h2 className="text-3xl font-bold text-red-700 dark:text-red-300 mb-2">
                                Not Passed
                            </h2>
                            <p className="text-xl text-red-600 dark:text-red-400 mb-4">
                                Keep trying, you can do it!
                            </p>
                            <div className="text-5xl font-bold text-red-700 dark:text-red-300 mb-2">
                                {result.percentageScore}%
                            </div>
                            <p className="text-muted-foreground">
                                {result.rawScore} / {result.totalScore} points
                                (Passing: {result.passingScore})
                            </p>
                        </CardContent>
                    </Card>
                )}

                {!isPending && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Rewards & Recognition</CardTitle>
                            <CardDescription>
                                This assessment is marked as {result.assessmentKind ?? 'PRACTICE'}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-lg border bg-background/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stars</p>
                                <p className="mt-2 text-lg font-semibold">{earnedStarsLabel}</p>
                                {result.awardsStars && result.starValue ? (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Passing this exam can award up to {result.starValue} star{result.starValue > 1 ? 's' : ''}.
                                    </p>
                                ) : null}
                            </div>
                            <div className="rounded-lg border bg-background/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Badges</p>
                                <p className="mt-2 text-lg font-semibold">
                                    {result.rewardOutcome.badgesUnlocked.length > 0
                                        ? `${result.rewardOutcome.badgesUnlocked.length} unlocked`
                                        : 'No new badge unlocked'}
                                </p>
                                {result.rewardOutcome.badgesUnlocked.length > 0 ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {result.rewardOutcome.badgesUnlocked.map((badge) => (
                                            <Badge key={badge.id} variant="secondary">
                                                {badge.name}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Keep progressing in this series to unlock the next milestone.
                                    </p>
                                )}
                            </div>
                            <div className="rounded-lg border bg-background/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certificate</p>
                                <p className="mt-2 text-lg font-semibold">{certificateStatusLabel}</p>
                                {result.rewardOutcome.certificate.issued && result.rewardOutcome.certificate.id ? (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">
                                            {result.rewardOutcome.certificate.title || 'Certificate'}
                                        </Badge>
                                        {result.rewardOutcome.certificate.certificateNumber ? (
                                            <span className="text-sm text-muted-foreground">
                                                #{result.rewardOutcome.certificate.certificateNumber}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Formal assessments may issue certificates when certificate-on-pass is enabled.
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Stats Cards */}
                {!isPending && (
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Target className="h-4 w-4" />
                                    Score
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {result.rawScore}/{result.totalScore}
                                </div>
                                <Progress
                                    value={result.percentageScore || 0}
                                    className={`mt-2 ${result.passed ? '[&>div]:bg-green-500' : '[&>div]:bg-red-500'}`}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4" />
                                    Passing Score
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {result.passingScore}/{result.totalScore}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {Math.round((result.passingScore / result.totalScore) * 100)}% required
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Time Taken
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {formatDuration(result.startedAt, result.submittedAt)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <RotateCcw className="h-4 w-4" />
                                    Attempt
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">#{result.attemptNumber}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatDate(result.submittedAt)}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Answer Review */}
                {result.allowReview && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Answer Review</CardTitle>
                                    <CardDescription>{reviewUnlockDescription}</CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    disabled={!result.reviewUnlocked || !result.answers || result.answers.length === 0}
                                    title={reviewUnlockTitle}
                                    onClick={() => setShowAnswers(!showAnswers)}
                                >
                                    {showAnswers ? 'Hide Answers' : 'Show Answers'}
                                </Button>
                            </div>
                        </CardHeader>
                        {!result.reviewUnlocked && (
                            <CardContent>
                                <div className="p-3 rounded-lg bg-muted text-sm text-muted-foreground">
                                    Pass the exam, use all attempts, or wait until the deadline passes to unlock answer review. Remaining attempts: {attemptsRemaining}.
                                </div>
                            </CardContent>
                        )}
                        {result.reviewUnlocked && showAnswers && result.answers && result.answers.length > 0 && (
                            <CardContent className="space-y-6">
                                {result.answers.map((answer, index) => (
                                    <div
                                        key={answer.questionId}
                                        className={`space-y-4 p-5 border rounded-xl ${
                                            answer.isCorrect === true
                                                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                                                : answer.isCorrect === false
                                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                                                    : ''
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-medium">
                                                    {index + 1}
                                                </span>
                                                <Badge variant="secondary">
                                                    {questionTypeLabels[answer.type]}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {answer.isCorrect === true ? (
                                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                                ) : answer.isCorrect === false ? (
                                                    <XCircle className="h-5 w-5 text-red-600" />
                                                ) : answer.pointsAwarded !== null ? (
                                                    <Target className="h-5 w-5 text-blue-600" />
                                                ) : (
                                                    <Clock className="h-5 w-5 text-muted-foreground" />
                                                )}
                                                <span className="font-medium">
                                                    {answer.pointsAwarded ?? '?'}/{answer.maxPoints}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="rounded-lg border bg-background/80 p-4">
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Question
                                            </p>
                                            {answer.type === 'ESSAY' ? (
                                                <RichTextContent html={answer.question} className="text-base" />
                                            ) : (
                                                <p className="font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                                    {answer.question}
                                                </p>
                                            )}
                                        </div>

                                        <div className={`grid gap-4 ${answer.type !== 'ESSAY' && answer.type !== 'EXERCISE' ? 'md:grid-cols-2' : ''}`}>
                                            <div className="rounded-lg border bg-background/70 p-4">
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    Your Answer
                                                </p>
                                                {answer.type === 'ESSAY' ? (
                                                    answer.userAnswer ? (
                                                        <RichTextContent
                                                            html={answer.userAnswer}
                                                            className={answer.isCorrect === false ? 'text-red-700 dark:text-red-300' : ''}
                                                        />
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground">No answer provided</p>
                                                    )
                                                ) : (
                                                    <p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${answer.isCorrect === false ? 'text-red-700 dark:text-red-300' : ''}`}>
                                                        {answer.userAnswer || 'No answer provided'}
                                                    </p>
                                                )}
                                            </div>
                                            {answer.type !== 'ESSAY' && answer.type !== 'EXERCISE' && (
                                                <div className="rounded-lg border bg-green-50/70 p-4 dark:bg-green-950/20">
                                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
                                                        Correct Answer
                                                    </p>
                                                    <p className="whitespace-pre-wrap break-words text-green-700 dark:text-green-300 [overflow-wrap:anywhere]">
                                                        {answer.correctAnswer || '-'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {answer.explanation && (
                                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">
                                                    Explanation
                                                </p>
                                                <RichTextContent
                                                    html={answer.explanation}
                                                    className="text-sm text-blue-800 dark:text-blue-200"
                                                />
                                            </div>
                                        )}

                                        {answer.feedback && (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                                    Grading Feedback
                                                </p>
                                                <p className="whitespace-pre-wrap break-words text-sm text-amber-900 dark:text-amber-100 [overflow-wrap:anywhere]">
                                                    {answer.feedback}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        )}
                    </Card>
                )}

                {/* Actions */}
                <div className="flex items-center justify-center gap-4 pt-4">
                    <Link href="/exams">
                        <Button variant="outline" size="lg">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Exams
                        </Button>
                    </Link>

                    {result.rewardOutcome.certificate.issued && result.rewardOutcome.certificate.id && (
                        <Link href="/certificates">
                            <Button size="lg">
                                <Award className="h-4 w-4 mr-2" />
                                View Certificate
                            </Button>
                        </Link>
                    )}

                    {!result.passed && !isPending && (
                        <Link href={`/exams/${examId}`}>
                            <Button size="lg">
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Try Again
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
