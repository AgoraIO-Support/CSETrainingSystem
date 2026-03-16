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
    Download,
    AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { ExamQuestionType } from '@/types'

interface ResultData {
    attemptId: string
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
    maxAttempts: number
    attemptsUsed: number
    reviewUnlocked: boolean
    reviewUnlockedByPassing?: boolean
    reviewUnlockedByAttempts?: boolean
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
    const reviewUnlockDescription = result.reviewUnlocked
        ? result.reviewUnlockedByPassing
            ? 'Review unlocked because you passed this attempt'
            : 'Review unlocked because you used all available attempts'
        : `Unlocks after you pass or use all attempts (${result.attemptsUsed}/${result.maxAttempts} used)`
    const reviewUnlockTitle = !result.reviewUnlocked
        ? `Answer review unlocks after you pass or use all attempts (${attemptsRemaining} remaining)`
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
                                    Pass the exam or use all attempts to unlock answer review. Remaining attempts: {attemptsRemaining}.
                                </div>
                            </CardContent>
                        )}
                        {result.reviewUnlocked && showAnswers && result.answers && result.answers.length > 0 && (
                            <CardContent className="space-y-6">
                                {result.answers.map((answer, index) => (
                                    <div
                                        key={answer.questionId}
                                        className={`p-4 border rounded-lg ${
                                            answer.isCorrect === true
                                                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                                                : answer.isCorrect === false
                                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                                                    : ''
                                        }`}
                                    >
                                        <div className="flex items-start justify-between mb-3">
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

                                        {answer.type === 'ESSAY' ? (
                                            <RichTextContent html={answer.question} className="mb-3" />
                                        ) : (
                                            <p className="font-medium mb-3">{answer.question}</p>
                                        )}

                                        <div className="grid gap-2 md:grid-cols-2">
                                            <div>
                                                <p className="text-sm text-muted-foreground mb-1">Your Answer</p>
                                                <p className={answer.isCorrect === false ? 'text-red-600' : ''}>
                                                    {answer.userAnswer || 'No answer provided'}
                                                </p>
                                            </div>
                                            {answer.type !== 'ESSAY' && answer.type !== 'EXERCISE' && (
                                                <div>
                                                    <p className="text-sm text-muted-foreground mb-1">Correct Answer</p>
                                                    <p className="text-green-600">
                                                        {answer.correctAnswer || '-'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {answer.explanation && (
                                            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                                                    Explanation
                                                </p>
                                                <RichTextContent
                                                    html={answer.explanation}
                                                    className="text-sm text-blue-700 dark:text-blue-300"
                                                />
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

                    {result.passed && (
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
