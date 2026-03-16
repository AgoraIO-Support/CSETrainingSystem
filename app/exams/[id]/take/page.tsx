'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScreenRecorderAnswer } from '@/components/exam/screen-recorder-answer'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { RichTextContent } from '@/components/ui/rich-text-content'
import { ApiClient } from '@/lib/api-client'
import { stripRichTextToPlainText } from '@/lib/rich-text'
import {
    Loader2,
    Clock,
    ChevronLeft,
    ChevronRight,
    Send,
    AlertCircle,
    CheckCircle,
    Flag,
    Paperclip,
    ExternalLink,
} from 'lucide-react'
import type { ExamQuestionType } from '@/types'

interface ExamQuestion {
    id: string
    type: ExamQuestionType
    question: string
    options: string[] | null
    points: number
    order: number
    maxWords?: number
    attachmentFilename?: string | null
    attachmentMimeType?: string | null
    attachmentUrl?: string | null
}

interface AttemptData {
    attemptId: string
    examId: string
    attemptNumber: number
    startedAt: string
    expiresAt: string | null
    timeLimit: number | null
    totalQuestions: number
    questions: ExamQuestion[]
    existingAnswers?: Record<string, {
        answer: string | null
        selectedOption: number | null
        recordingS3Key?: string | null
        recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED' | null
    }>
}

type AnswerState = {
    answer?: string
    selectedOption?: number
    selectedOptions?: number[]
    recordingS3Key?: string
    recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED'
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function TakeExamPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const router = useRouter()

    const [attemptData, setAttemptData] = useState<AttemptData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
    const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

    // Load exam data
    useEffect(() => {
        loadExamData()
    }, [examId])

    const loadExamData = async () => {
        setLoading(true)
        try {
            // First check for existing attempt
            const currentResponse = await ApiClient.getCurrentAttempt(examId)

            if (currentResponse.data) {
                setAttemptData(currentResponse.data)
                // Load existing answers
                if (currentResponse.data.existingAnswers) {
                    const existingAnswers: Record<string, AnswerState> = {}
                    Object.entries(currentResponse.data.existingAnswers).forEach(([questionId, ans]) => {
                        const parsedSelections = ans.answer
                            ? ans.answer.split(',').map(a => Number.parseInt(a, 10)).filter(n => Number.isFinite(n))
                            : []
                        existingAnswers[questionId] = {
                            answer: ans.answer || undefined,
                            selectedOption: ans.selectedOption ?? undefined,
                            selectedOptions: parsedSelections && parsedSelections.length ? parsedSelections : undefined,
                            recordingS3Key: ans.recordingS3Key || undefined,
                            recordingStatus: ans.recordingStatus || undefined,
                        }
                    })
                    setAnswers(existingAnswers)
                }
            } else {
                // Start new attempt
                const startResponse = await ApiClient.startExamAttempt(examId)
                setAttemptData(startResponse.data)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load exam')
        } finally {
            setLoading(false)
        }
    }

    // Timer effect
    useEffect(() => {
        if (!attemptData?.expiresAt) return

        const updateTimer = () => {
            const now = new Date().getTime()
            const expires = new Date(attemptData.expiresAt!).getTime()
            const remaining = Math.max(0, Math.floor((expires - now) / 1000))
            setTimeRemaining(remaining)

            if (remaining === 0) {
                handleSubmit(true) // Auto-submit when time expires
            }
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)

        return () => clearInterval(interval)
    }, [attemptData?.expiresAt])

    // Auto-save answer
    const saveAnswer = useCallback(async (questionId: string, answer: AnswerState) => {
        if (!attemptData) return

        setSaving(true)
        try {
            const payloadAnswer = Array.isArray(answer.selectedOptions)
                ? answer.selectedOptions.join(',')
                : answer.answer
            await ApiClient.saveExamAnswer(examId, {
                attemptId: attemptData.attemptId,
                questionId,
                answer: payloadAnswer,
                selectedOption: answer.selectedOption,
            })
        } catch (err) {
            console.error('Failed to save answer:', err)
        } finally {
            setSaving(false)
        }
    }, [attemptData, examId])

    // Handle answer change
    const handleAnswerChange = (questionId: string, answer: AnswerState) => {
        setAnswers(prev => {
            const next = { ...(prev[questionId] || {}), ...answer }
            return { ...prev, [questionId]: next }
        })

        // Debounce save
        const timeoutId = setTimeout(() => {
            saveAnswer(questionId, answer)
        }, 500)

        return () => clearTimeout(timeoutId)
    }

    const handleExerciseUploaded = (questionId: string, payload: { recordingS3Key: string }) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: {
                ...prev[questionId],
                recordingS3Key: payload.recordingS3Key,
                recordingStatus: 'UPLOADED',
            },
        }))
    }

    // Handle submit
    const handleSubmit = async (force = false) => {
        if (!attemptData) return

        if (!force && !showSubmitConfirm) {
            setShowSubmitConfirm(true)
            return
        }

        setSubmitting(true)
        try {
            await ApiClient.submitExam(examId, attemptData.attemptId)
            router.push(`/exams/${examId}/result?attemptId=${attemptData.attemptId}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit exam')
            setSubmitting(false)
        }
    }

    // Toggle flag
    const toggleFlag = (questionId: string) => {
        setFlaggedQuestions(prev => {
            const newSet = new Set(prev)
            if (newSet.has(questionId)) {
                newSet.delete(questionId)
            } else {
                newSet.add(questionId)
            }
            return newSet
        })
    }

    // Format time
    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`
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

    if (error || !attemptData) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <p className="text-muted-foreground">{error || 'Failed to load exam'}</p>
                    <Button className="mt-4" onClick={() => router.push(`/exams/${examId}`)}>
                        Back to Exam
                    </Button>
                </div>
            </DashboardLayout>
        )
    }

    const currentQuestion = attemptData.questions[currentQuestionIndex]
    const currentAnswer = answers[currentQuestion.id]
    const isAnswered = (value?: AnswerState) => {
        const hasTextAnswer = typeof value?.answer === 'string' && value.answer.trim().length > 0
        const hasSingleChoice = typeof value?.selectedOption === 'number'
        const hasMultipleChoice = Array.isArray(value?.selectedOptions) && value.selectedOptions.length > 0
        const hasExerciseUpload = value?.recordingStatus === 'UPLOADED'

        return hasTextAnswer || hasSingleChoice || hasMultipleChoice || hasExerciseUpload
    }

    const answeredCount = Object.keys(answers).filter(qId => isAnswered(answers[qId])).length
    const progress = (answeredCount / attemptData.totalQuestions) * 100

    const isTimeWarning = timeRemaining !== null && timeRemaining < 300 // Less than 5 minutes

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-background border-b">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="font-semibold">
                                Question {currentQuestionIndex + 1} of {attemptData.totalQuestions}
                            </span>
                            <Badge variant="outline">{currentQuestion.points} pts</Badge>
                            {saving && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Saving...
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            {timeRemaining !== null && (
                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                                    isTimeWarning
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200'
                                        : 'bg-muted'
                                }`}>
                                    <Clock className="h-4 w-4" />
                                    <span className="font-mono font-medium">
                                        {formatTime(timeRemaining)}
                                    </span>
                                </div>
                            )}
                            <Button
                                variant="destructive"
                                onClick={() => handleSubmit()}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Submit Exam
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-2">
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                            {answeredCount} of {attemptData.totalQuestions} questions answered
                        </p>
                    </div>
                </div>
            </div>

            {/* Submit Confirmation Modal */}
            {showSubmitConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <Card className="w-full max-w-md mx-4">
                        <CardHeader>
                            <CardTitle>Submit Exam?</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-muted-foreground">
                                You have answered {answeredCount} of {attemptData.totalQuestions} questions.
                            </p>
                            {answeredCount < attemptData.totalQuestions && (
                                <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg text-amber-800 dark:text-amber-200 text-sm">
                                    <AlertCircle className="h-4 w-4 inline mr-2" />
                                    You have {attemptData.totalQuestions - answeredCount} unanswered question(s).
                                </div>
                            )}
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>
                                    Continue Exam
                                </Button>
                                <Button variant="destructive" onClick={() => handleSubmit(true)}>
                                    Submit Now
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="container mx-auto px-4 py-6">
                <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
                    {/* Question Card */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <Badge variant="secondary">
                                    {currentQuestion.type.replace('_', ' ')}
                                </Badge>
                                <Button
                                    variant={flaggedQuestions.has(currentQuestion.id) ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => toggleFlag(currentQuestion.id)}
                                >
                                    <Flag className="h-4 w-4 mr-1" />
                                    {flaggedQuestions.has(currentQuestion.id) ? 'Flagged' : 'Flag'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {currentQuestion.type === 'ESSAY' ? (
                                <RichTextContent html={currentQuestion.question} className="text-base" />
                            ) : (
                                <div className="text-lg font-medium">{currentQuestion.question}</div>
                            )}

                            {/* Single Choice */}
                            {currentQuestion.type === 'SINGLE_CHOICE' && currentQuestion.options && (
                                <div className="space-y-3">
                                    {currentQuestion.options.map((option, index) => (
                                        <div
                                            key={index}
                                            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                                                currentAnswer?.selectedOption === index
                                                    ? 'bg-primary/10 border-primary'
                                                    : 'hover:bg-accent'
                                            }`}
                                            onClick={() => handleAnswerChange(currentQuestion.id, { selectedOption: index })}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center justify-center w-8 h-8 rounded-full border font-medium">
                                                    {String.fromCharCode(65 + index)}
                                                </span>
                                                <span>{option}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Multiple Choice (multi-select) */}
                            {currentQuestion.type === 'MULTIPLE_CHOICE' && currentQuestion.options && (
                                <div className="space-y-3">
                                    {currentQuestion.options.map((option, index) => {
                                        const isSelected = currentAnswer?.selectedOptions?.includes(index) ?? false
                                        return (
                                            <div
                                                key={index}
                                                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                                                    isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                                                }`}
                                                onClick={() => {
                                                    const existing = currentAnswer?.selectedOptions ?? []
                                                    const next = isSelected
                                                        ? existing.filter(i => i !== index)
                                                        : [...existing, index]
                                                    handleAnswerChange(currentQuestion.id, { selectedOptions: next })
                                                }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="flex items-center justify-center w-8 h-8 rounded-full border font-medium">
                                                        {String.fromCharCode(65 + index)}
                                                    </span>
                                                    <span>{option}</span>
                                                    {isSelected && <CheckCircle className="h-4 w-4 text-primary ml-auto" />}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <p className="text-xs text-muted-foreground">Select all options that apply.</p>
                                </div>
                            )}

                            {/* True/False */}
                            {currentQuestion.type === 'TRUE_FALSE' && (
                                <div className="flex gap-4">
                                    {['True', 'False'].map(option => (
                                        <Button
                                            key={option}
                                            variant={currentAnswer?.answer === option.toLowerCase() ? 'default' : 'outline'}
                                            className="flex-1 h-16 text-lg"
                                            onClick={() => handleAnswerChange(currentQuestion.id, { answer: option.toLowerCase() })}
                                        >
                                            {option}
                                        </Button>
                                    ))}
                                </div>
                            )}

                            {/* Fill in Blank */}
                            {currentQuestion.type === 'FILL_IN_BLANK' && (
                                <div>
                                    <input
                                        type="text"
                                        className="w-full h-12 px-4 border rounded-lg text-lg"
                                        placeholder="Type your answer..."
                                        value={currentAnswer?.answer || ''}
                                        onChange={(e) => handleAnswerChange(currentQuestion.id, { answer: e.target.value })}
                                    />
                                </div>
                            )}

                            {/* Essay */}
                            {currentQuestion.type === 'ESSAY' && (
                                <div className="space-y-2">
                                    {currentQuestion.attachmentFilename && currentQuestion.attachmentUrl && (
                                        <div className="rounded-lg border bg-muted/30 p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <Paperclip className="h-4 w-4" />
                                                Reference document
                                            </div>
                                            <a
                                                href={currentQuestion.attachmentUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                            >
                                                {currentQuestion.attachmentFilename}
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        </div>
                                    )}
                                    <RichTextEditor
                                        value={currentAnswer?.answer || ''}
                                        onChange={(value) => handleAnswerChange(currentQuestion.id, { answer: value })}
                                        placeholder="Write your answer..."
                                    />
                                    {currentQuestion.maxWords && (
                                        <p className="text-sm text-muted-foreground text-right">
                                            {stripRichTextToPlainText(currentAnswer?.answer || '').split(/\s+/).filter(w => w).length} / {currentQuestion.maxWords} words
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Exercise (Screen Recording) */}
                            {currentQuestion.type === 'EXERCISE' && (
                                <ScreenRecorderAnswer
                                    examId={examId}
                                    attemptId={attemptData.attemptId}
                                    questionId={currentQuestion.id}
                                    initial={{
                                        recordingStatus: currentAnswer?.recordingStatus ?? null,
                                        recordingS3Key: currentAnswer?.recordingS3Key ?? null,
                                    }}
                                    onUploaded={(value) => handleExerciseUploaded(currentQuestion.id, { recordingS3Key: value.recordingS3Key })}
                                />
                            )}

                            {/* Navigation */}
                            <div className="flex items-center justify-between pt-4 border-t">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                                    disabled={currentQuestionIndex === 0}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentQuestionIndex(prev => Math.min(attemptData.totalQuestions - 1, prev + 1))}
                                    disabled={currentQuestionIndex === attemptData.totalQuestions - 1}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Question Navigator */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Question Navigator</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-5 gap-2">
                                {attemptData.questions.map((question, index) => {
                                    const isAnsweredValue = isAnswered(answers[question.id])
                                    const isFlagged = flaggedQuestions.has(question.id)
                                    const isCurrent = index === currentQuestionIndex

                                    return (
                                        <button
                                            key={question.id}
                                            className={`relative w-10 h-10 rounded-lg border font-medium text-sm transition-colors ${
                                                isCurrent
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : isAnsweredValue
                                                        ? 'bg-green-100 border-green-300 dark:bg-green-900/20 dark:border-green-700'
                                                        : 'hover:bg-accent'
                                            }`}
                                            onClick={() => setCurrentQuestionIndex(index)}
                                        >
                                            {index + 1}
                                            {isFlagged && (
                                                <Flag className="absolute -top-1 -right-1 h-3 w-3 text-orange-500" />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="mt-4 space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded bg-primary" />
                                    <span>Current</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded bg-green-100 border border-green-300 dark:bg-green-900/20" />
                                    <span>Answered</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded border" />
                                    <span>Not answered</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Flag className="h-4 w-4 text-orange-500" />
                                    <span>Flagged for review</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
