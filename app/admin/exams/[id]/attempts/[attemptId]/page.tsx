'use client'

import { useState, useEffect, use } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    Save,
    CheckCircle,
    XCircle,
    Clock,
    Sparkles,
    User,
    FileText,
} from 'lucide-react'
import Link from 'next/link'
import type { ExamQuestion, ExamQuestionType, GradingStatus } from '@/types'

const questionTypeLabels: Record<ExamQuestionType, string> = {
    SINGLE_CHOICE: 'Single Choice',
    MULTIPLE_CHOICE: 'Multiple Choice',
    TRUE_FALSE: 'True/False',
    FILL_IN_BLANK: 'Fill in Blank',
    ESSAY: 'Essay',
    EXERCISE: 'Exercise',
}

const gradingStatusConfig: Record<GradingStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    PENDING: { label: 'Pending', variant: 'outline' },
    AUTO_GRADED: { label: 'Auto-Graded', variant: 'secondary' },
    AI_SUGGESTED: { label: 'AI Suggested', variant: 'outline' },
    MANUALLY_GRADED: { label: 'Manually Graded', variant: 'default' },
}

type PageProps = {
    params: Promise<{ id: string; attemptId: string }>
}

interface AttemptDetail {
    id: string
    examId: string
    userId: string
    attemptNumber: number
    status: string
    startedAt: string | Date
    submittedAt: string | Date | null
    expiresAt?: string | Date | null
    rawScore: number | null
    percentageScore: number | null
    passed: boolean | null
    hasEssays: boolean
    essaysGraded: boolean
    user?: {
        id: string
        name: string
        email: string
    }
    exam?: {
        id: string
        title: string
        totalScore: number
        passingScore: number
    }
    certificate?: {
        id: string
        certificateNumber: string
        issueDate: string | Date
        pdfUrl: string | null
        status: 'ISSUED' | 'REVOKED'
        revokedAt: string | Date | null
        certificateTitle: string | null
    } | null
    answers: Array<{
        id: string
        questionId: string
        answer: string | null
        selectedOption: number | null
        recordingS3Key?: string | null
        recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED' | null
        recordingUrl?: string | null
        gradingStatus: GradingStatus
        isCorrect: boolean | null
        pointsAwarded: number | null
        aiSuggestedScore: number | null
        aiFeedback: string | null
        adminScore: number | null
        adminFeedback: string | null
        question: ExamQuestion
    }>
}

export default function AttemptDetailPage({ params }: PageProps) {
    const { id: examId, attemptId } = use(params)
    const [attempt, setAttempt] = useState<AttemptDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [certificateActionLoading, setCertificateActionLoading] = useState(false)
    const [autoGrading, setAutoGrading] = useState(false)

    // Grading state for each manually-graded answer (essay + fill-in-blank)
    const [gradingForms, setGradingForms] = useState<Record<string, { score: string; feedback: string }>>({})
    const [savingAnswer, setSavingAnswer] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [examId, attemptId])

    const loadData = async () => {
        setLoading(true)
        try {
            const response = await ApiClient.getExamAttemptDetail(examId, attemptId)
            setAttempt(response.data as unknown as AttemptDetail)

            // Initialize grading forms for all questions so admins can override auto-graded scores.
            const forms: Record<string, { score: string; feedback: string }> = {}
            response.data.answers.forEach(answer => {
                forms[answer.id] = {
                    score:
                        answer.adminScore?.toString() ||
                        answer.pointsAwarded?.toString() ||
                        answer.aiSuggestedScore?.toString() ||
                        '',
                    feedback: answer.adminFeedback || answer.aiFeedback || '',
                }
            })
            setGradingForms(forms)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load attempt')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveGrade = async (answerId: string) => {
        const form = gradingForms[answerId]
        if (!form?.score) {
            setError('Please enter a score')
            return
        }

        setSavingAnswer(answerId)
        setError(null)

        try {
            await ApiClient.gradeEssay(examId, attemptId, answerId, {
                score: parseInt(form.score),
                feedback: form.feedback || undefined,
            })
            showSuccess('Grade updated successfully')
            loadData() // Refresh to get updated scores
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save grade')
        } finally {
            setSavingAnswer(null)
        }
    }

    const handleRevokeCertificate = async () => {
        if (!attempt?.certificate?.id) return
        setCertificateActionLoading(true)
        setError(null)
        try {
            await ApiClient.adminRevokeCertificate(attempt.certificate.id)
            showSuccess('Certificate revoked')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to revoke certificate')
        } finally {
            setCertificateActionLoading(false)
        }
    }

    const handleReissueCertificate = async () => {
        if (!attempt?.certificate?.id) return
        setCertificateActionLoading(true)
        setError(null)
        try {
            await ApiClient.adminReissueCertificate(attempt.certificate.id)
            showSuccess('Certificate reissued')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reissue certificate')
        } finally {
            setCertificateActionLoading(false)
        }
    }

    const handleReRunAutoGrade = async () => {
        setAutoGrading(true)
        setError(null)
        try {
            await ApiClient.triggerAutoGrade(examId, attemptId)
            showSuccess('Auto-grading re-run successfully')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to re-run auto-grading')
        } finally {
            setAutoGrading(false)
        }
    }

    const updateGradingForm = (answerId: string, field: 'score' | 'feedback', value: string) => {
        setGradingForms(prev => ({
            ...prev,
            [answerId]: {
                ...prev[answerId],
                [field]: value,
            },
        }))
    }

    const showSuccess = (message: string) => {
        setSuccessMessage(message)
        setTimeout(() => setSuccessMessage(null), 3000)
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

    const formatOption = (options: string[], idx: number) =>
        idx >= 0 && idx < options.length ? `${String.fromCharCode(65 + idx)}. ${options[idx]}` : null

    const getCorrectAnswer = (question: ExamQuestion) => {
        if ((question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && question.options) {
            const parts = (question.correctAnswer || '').split(',').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n))
            if (!parts.length && question.correctAnswer) {
                const idx = parseInt(question.correctAnswer, 10)
                const formatted = formatOption(question.options, idx)
                if (formatted) return formatted
            }
            const formatted = parts.map(idx => formatOption(question.options!, idx)).filter(Boolean)
            return formatted.length ? formatted.join(', ') : '-'
        }
        if (question.type === 'TRUE_FALSE') {
            return question.correctAnswer === 'true' ? 'True' : 'False'
        }
        if (question.type === 'EXERCISE') {
            return '-'
        }
        return question.correctAnswer || '-'
    }

    const getUserAnswer = (answer: AttemptDetail['answers'][0]) => {
        if (answer.question.type === 'SINGLE_CHOICE' && answer.question.options && answer.selectedOption !== null) {
            return formatOption(answer.question.options, answer.selectedOption) || 'No answer provided'
        }
        if (answer.question.type === 'MULTIPLE_CHOICE' && answer.question.options) {
            const selections = answer.answer
                ? answer.answer.split(',').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n))
                : []
            const formatted = selections.map(idx => formatOption(answer.question.options!, idx)).filter(Boolean)
            if (formatted.length) return formatted.join(', ')
            if (answer.selectedOption !== null && answer.selectedOption !== undefined) {
                return formatOption(answer.question.options, answer.selectedOption) || 'No answer provided'
            }
            return 'No answer provided'
        }
        if (answer.question.type === 'TRUE_FALSE' && answer.answer) {
            return answer.answer === 'true' ? 'True' : 'False'
        }
        if (answer.question.type === 'EXERCISE') {
            return answer.recordingStatus === 'UPLOADED' ? 'Video uploaded' : 'No recording uploaded'
        }
        return answer.answer || 'No answer provided'
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

    if (!attempt) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Attempt not found</p>
                    <Link href={`/admin/exams/${examId}/attempts`}>
                        <Button className="mt-4">Back to Attempts</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const manualAnswers = attempt.answers.filter(
        a => a.question.type === 'ESSAY' || a.question.type === 'FILL_IN_BLANK' || a.question.type === 'EXERCISE'
    )
    const ungradedManual = manualAnswers.filter(a => a.gradingStatus !== 'MANUALLY_GRADED')

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={`/admin/exams/${examId}/attempts`}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Attempt Detail</h1>
                            <p className="text-muted-foreground mt-1">{attempt.exam?.title}</p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={handleReRunAutoGrade} disabled={autoGrading}>
                        {autoGrading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Re-run Auto Grade
                    </Button>
                </div>

                {successMessage && (
                    <div className="p-4 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {successMessage}
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {/* Attempt Summary */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Attempt Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Student</p>
                                <p className="font-medium">{attempt.user?.name}</p>
                                <p className="text-sm text-muted-foreground">{attempt.user?.email}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Attempt #</p>
                                <p className="font-medium">{attempt.attemptNumber}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Submitted</p>
                                <p className="font-medium">{formatDate(attempt.submittedAt)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Score</p>
                                <div className="flex items-center gap-2">
                                    {attempt.percentageScore !== null ? (
                                        <>
                                            <p className="font-medium text-xl">
                                                {attempt.rawScore}/{attempt.exam?.totalScore}
                                            </p>
                                            <Badge variant={attempt.passed ? 'default' : 'destructive'}>
                                                {attempt.percentageScore}% - {attempt.passed ? 'Passed' : 'Failed'}
                                            </Badge>
                                        </>
                                    ) : (
                                        <Badge variant="outline">Pending Grading</Badge>
                                    )}
                                </div>
                            </div>
                        </div>

                        {ungradedManual.length > 0 && (
                            <div className="mt-4 p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg flex items-center gap-2 text-amber-800 dark:text-amber-200">
                                <FileText className="h-5 w-5" />
                                <span>
                                    {ungradedManual.length} question(s) need manual grading
                                </span>
                            </div>
                        )}

                        <div className="mt-4 border-t pt-4">
                            <p className="text-sm text-muted-foreground mb-2">Certificate</p>
                            {attempt.certificate ? (
                                <div className="flex flex-wrap items-center gap-3">
                                    <Badge variant={attempt.certificate.status === 'ISSUED' ? 'default' : 'destructive'}>
                                        {attempt.certificate.status}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                        No: {attempt.certificate.certificateNumber}
                                    </span>
                                    <Link href={`/certificates/verify/${encodeURIComponent(attempt.certificate.certificateNumber)}`} target="_blank">
                                        <Button variant="outline" size="sm" disabled={!attempt.certificate.certificateNumber}>
                                            Verify
                                        </Button>
                                    </Link>
                                    {attempt.certificate.status === 'ISSUED' ? (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={handleRevokeCertificate}
                                            disabled={certificateActionLoading}
                                        >
                                            {certificateActionLoading ? 'Working…' : 'Revoke'}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={handleReissueCertificate}
                                            disabled={certificateActionLoading}
                                        >
                                            {certificateActionLoading ? 'Working…' : 'Reissue'}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No certificate issued</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Answers */}
                <div className="space-y-4">
                    {attempt.answers.map((answer, index) => (
                        <Card key={answer.id}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium">
                                            {index + 1}
                                        </span>
                                        <div>
                                            <CardTitle className="text-lg">
                                                {questionTypeLabels[answer.question.type]}
                                            </CardTitle>
                                            <CardDescription>
                                                {answer.question.points} points
                                                {answer.question.difficulty && (
                                                    <> • {answer.question.difficulty}</>
                                                )}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={gradingStatusConfig[answer.gradingStatus].variant}>
                                            {gradingStatusConfig[answer.gradingStatus].label}
                                        </Badge>
                                        {answer.isCorrect === true ? (
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                        ) : answer.isCorrect === false ? (
                                            <XCircle className="h-5 w-5 text-red-600" />
                                        ) : answer.pointsAwarded !== null ? (
                                            <FileText className="h-5 w-5 text-blue-600" />
                                        ) : null}
                                        {answer.pointsAwarded !== null && (
                                            <span className="font-medium">
                                                {answer.pointsAwarded}/{answer.question.points}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">Question</p>
                                    <p className="font-medium">{answer.question.question}</p>
                                </div>

                                {(answer.question.type === 'SINGLE_CHOICE' || answer.question.type === 'MULTIPLE_CHOICE') && answer.question.options && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-1">Options</p>
                                        <ul className="space-y-1">
                                            {answer.question.options.map((option, i) => {
                                                const selectedIndexes =
                                                    answer.question.type === 'MULTIPLE_CHOICE' && answer.answer
                                                        ? answer.answer
                                                            .split(',')
                                                            .map(s => parseInt(s, 10))
                                                            .filter(n => !Number.isNaN(n))
                                                        : answer.selectedOption !== null && answer.selectedOption !== undefined
                                                            ? [answer.selectedOption]
                                                            : []
                                                const correctIndexes = (answer.question.correctAnswer || '')
                                                    .split(',')
                                                    .map(s => parseInt(s, 10))
                                                    .filter(n => !Number.isNaN(n))
                                                const isSelected = selectedIndexes.includes(i)
                                                const isCorrectOption = correctIndexes.includes(i)

                                                return (
                                                    <li
                                                        key={i}
                                                        className={`p-2 rounded ${
                                                            isSelected
                                                                ? answer.isCorrect
                                                                    ? 'bg-green-100 dark:bg-green-900/20'
                                                                    : 'bg-red-100 dark:bg-red-900/20'
                                                                : isCorrectOption
                                                                    ? 'bg-green-100 dark:bg-green-900/20'
                                                                    : ''
                                                        }`}
                                                    >
                                                        {String.fromCharCode(65 + i)}. {option}
                                                        {isSelected && ' (Selected)'}
                                                        {isCorrectOption && ' ✓'}
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </div>
                                )}

                                {answer.question.type !== 'ESSAY' && answer.question.type !== 'EXERCISE' && (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <p className="text-sm text-muted-foreground mb-1">User Answer</p>
                                            <p className={answer.isCorrect ? 'text-green-600' : 'text-red-600'}>
                                                {getUserAnswer(answer)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground mb-1">Correct Answer</p>
                                            <p className="text-green-600">{getCorrectAnswer(answer.question)}</p>
                                        </div>
                                    </div>
                                )}

                                {answer.question.type === 'EXERCISE' && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-1">Student Recording</p>
                                        {answer.recordingUrl ? (
                                            <video
                                                className="w-full rounded-lg border bg-black"
                                                controls
                                                preload="metadata"
                                                src={answer.recordingUrl}
                                            />
                                        ) : answer.recordingS3Key ? (
                                            <div className="p-3 border rounded-lg text-sm text-muted-foreground break-all">
                                                Recording key: {answer.recordingS3Key}
                                            </div>
                                        ) : (
                                            <div className="p-3 border rounded-lg text-sm text-muted-foreground">
                                                No recording uploaded.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {answer.question.type === 'ESSAY' && (
                                    <>
                                        <div>
                                            <p className="text-sm text-muted-foreground mb-1">Student Answer</p>
                                            <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
                                                {answer.answer || 'No answer provided'}
                                            </div>
                                        </div>

                                        {answer.question.rubric && (
                                            <div>
                                                <p className="text-sm text-muted-foreground mb-1">Grading Rubric</p>
                                                <div className="p-3 border rounded-lg text-sm">
                                                    {answer.question.rubric}
                                                </div>
                                            </div>
                                        )}

                                        {answer.question.sampleAnswer && (
                                            <div>
                                                <p className="text-sm text-muted-foreground mb-1">Sample Answer</p>
                                                <div className="p-3 border rounded-lg text-sm">
                                                    {answer.question.sampleAnswer}
                                                </div>
                                            </div>
                                        )}

                                        {(answer.aiSuggestedScore !== null || answer.aiFeedback) && (
                                            <div className="p-4 border rounded-lg bg-purple-50 dark:bg-purple-900/20">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Sparkles className="h-4 w-4 text-purple-600" />
                                                    <span className="font-medium text-purple-600">AI Suggestion</span>
                                                </div>
                                                {answer.aiSuggestedScore !== null && (
                                                    <p className="text-sm mb-1">
                                                        Suggested Score: <strong>{answer.aiSuggestedScore}/{answer.question.points}</strong>
                                                    </p>
                                                )}
                                                {answer.aiFeedback && (
                                                    <p className="text-sm text-muted-foreground">{answer.aiFeedback}</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="p-4 border rounded-lg">
                                    <p className="font-medium mb-3">
                                        {answer.gradingStatus === 'AUTO_GRADED'
                                            ? 'Admin Override'
                                            : answer.gradingStatus === 'MANUALLY_GRADED'
                                                ? 'Admin Grade Override'
                                                : 'Grade This Answer'}
                                    </p>
                                    <div className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Score (out of {answer.question.points})</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={answer.question.points}
                                                    value={gradingForms[answer.id]?.score || ''}
                                                    onChange={(e) => updateGradingForm(answer.id, 'score', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Feedback (optional)</Label>
                                            <Textarea
                                                className="text-foreground"
                                                value={gradingForms[answer.id]?.feedback || ''}
                                                onChange={(e) => updateGradingForm(answer.id, 'feedback', e.target.value)}
                                                rows={3}
                                                placeholder="Provide feedback to the student..."
                                            />
                                        </div>
                                        <Button
                                            onClick={() => handleSaveGrade(answer.id)}
                                            disabled={savingAnswer === answer.id}
                                        >
                                            {savingAnswer === answer.id ? (
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            ) : (
                                                <Save className="h-4 w-4 mr-2" />
                                            )}
                                            {answer.gradingStatus === 'AUTO_GRADED'
                                                ? 'Apply Override'
                                                : answer.gradingStatus === 'MANUALLY_GRADED'
                                                    ? 'Update Grade'
                                                    : 'Submit Grade'}
                                        </Button>
                                    </div>
                                </div>

                                {answer.question.explanation && answer.question.type !== 'ESSAY' && answer.question.type !== 'EXERCISE' && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-1">Explanation</p>
                                        <p className="text-sm">{answer.question.explanation}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </DashboardLayout>
    )
}
