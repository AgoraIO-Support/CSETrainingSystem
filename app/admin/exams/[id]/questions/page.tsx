'use client'

import { useState, useEffect, use, useRef } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    Plus,
    Trash2,
    Edit,
    Sparkles,
    GripVertical,
    Save,
    X,
    CheckCircle,
    XCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamQuestion, ExamQuestionType } from '@/types'

const questionTypeLabels: Record<ExamQuestionType, string> = {
    SINGLE_CHOICE: 'Single Choice',
    MULTIPLE_CHOICE: 'Multiple Choice',
    TRUE_FALSE: 'True/False',
    FILL_IN_BLANK: 'Fill in Blank',
    ESSAY: 'Essay',
    EXERCISE: 'Exercise',
}

const difficultyColors: Record<string, string> = {
    EASY: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
    HARD: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
}

type PageProps = {
    params: Promise<{ id: string }>
}

type ExamKnowledgeLesson = {
    lessonId: string
    lessonTitle: string
    chapterTitle: string
    chapterOrder: number
    lessonOrder: number
    knowledgeStatus: string
    anchorCount: number
    processedAt: string | null
    hasTranscript: boolean
}

interface QuestionForm {
    type: ExamQuestionType
    question: string
    options: string[]
    correctAnswer: string
    multiCorrectAnswers: string[]
    explanation: string
    points: number
    difficulty: 'EASY' | 'MEDIUM' | 'HARD'
    maxWords?: number
    rubric?: string
    sampleAnswer?: string
}

const defaultQuestionForm: QuestionForm = {
    type: 'SINGLE_CHOICE',
    question: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    multiCorrectAnswers: [],
    explanation: '',
    points: 10,
    difficulty: 'MEDIUM',
}

export default function ExamQuestionsPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const [exam, setExam] = useState<Exam | null>(null)
    const [questions, setQuestions] = useState<ExamQuestion[]>([])
    const formRef = useRef<HTMLDivElement | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

    // Form state
    const [showForm, setShowForm] = useState(false)
    const [editingQuestion, setEditingQuestion] = useState<ExamQuestion | null>(null)
    const [form, setForm] = useState<QuestionForm>(defaultQuestionForm)
    const [saving, setSaving] = useState(false)

    // AI generation state
    const [showGenerateDialog, setShowGenerateDialog] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [knowledgeLessons, setKnowledgeLessons] = useState<ExamKnowledgeLesson[]>([])
    const [knowledgeLessonsLoading, setKnowledgeLessonsLoading] = useState(false)
    const [knowledgeLessonsError, setKnowledgeLessonsError] = useState<string | null>(null)
    const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([])
    const [generateConfig, setGenerateConfig] = useState({
        singleChoice: 3,
        multipleChoice: 5,
        trueFalse: 3,
        fillInBlank: 2,
        essay: 1,
        difficulty: 'mixed' as 'EASY' | 'MEDIUM' | 'HARD' | 'mixed',
    })

    useEffect(() => {
        loadData()
    }, [examId])

    useEffect(() => {
        if (!showGenerateDialog) return

        let cancelled = false
        const loadKnowledgeContexts = async () => {
            setKnowledgeLessonsLoading(true)
            setKnowledgeLessonsError(null)
            try {
                const response = await ApiClient.getExamKnowledgeContexts(examId)
                if (cancelled) return
                const lessons = (response.data?.lessons ?? []).slice().sort((a, b) => {
                    if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder - b.chapterOrder
                    return a.lessonOrder - b.lessonOrder
                })
                setKnowledgeLessons(lessons)
                setSelectedLessonIds(
                    lessons.filter((l) => l.knowledgeStatus === 'READY').map((l) => l.lessonId)
                )
            } catch (err) {
                if (!cancelled) {
                    setKnowledgeLessonsError(err instanceof Error ? err.message : 'Failed to load knowledge contexts')
                    setKnowledgeLessons([])
                    setSelectedLessonIds([])
                }
            } finally {
                if (!cancelled) {
                    setKnowledgeLessonsLoading(false)
                }
            }
        }

        loadKnowledgeContexts()
        return () => {
            cancelled = true
        }
    }, [showGenerateDialog, examId])

    const loadData = async () => {
        setLoading(true)
        try {
            const [examRes, questionsRes] = await Promise.all([
                ApiClient.getAdminExam(examId),
                ApiClient.getExamQuestions(examId),
            ])
            setExam(examRes.data)
            setQuestions(questionsRes.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    const handleCreateQuestion = () => {
        setEditingQuestion(null)
        setForm(defaultQuestionForm)
        setShowForm(true)
        requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }

    const handleEditQuestion = (question: ExamQuestion) => {
        const parsedMultiAnswers = question.correctAnswer
            ? question.correctAnswer.split(',').map(s => s.trim()).filter(Boolean)
            : []

        setEditingQuestion(question)
        setForm({
            type: question.type,
            question: question.question,
            options: question.options || ['', '', '', ''],
            correctAnswer: question.correctAnswer || '',
            multiCorrectAnswers: parsedMultiAnswers,
            explanation: question.explanation || '',
            points: question.points,
            difficulty: (question.difficulty as 'EASY' | 'MEDIUM' | 'HARD') || 'MEDIUM',
            maxWords: question.maxWords || undefined,
            rubric: question.rubric || undefined,
            sampleAnswer: question.sampleAnswer || undefined,
        })
        setShowForm(true)
        requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }

    const handleDeleteQuestion = (questionId: string) => {
        setPendingDeleteId(questionId)
        setConfirmDeleteOpen(true)
    }

    const confirmDeleteQuestion = async () => {
        const questionId = pendingDeleteId
        if (!questionId) {
            setConfirmDeleteOpen(false)
            return
        }
        setConfirmDeleteOpen(false)
        setPendingDeleteId(null)

        try {
            await ApiClient.deleteExamQuestion(examId, questionId)
            setQuestions(prev => prev.filter(q => q.id !== questionId))
            showSuccess('Question deleted successfully')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete question')
        }
    }

    const handleSaveQuestion = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError(null)

        try {
            const hasCorrectAnswer =
                form.type === 'SINGLE_CHOICE' ||
                form.type === 'MULTIPLE_CHOICE' ||
                form.type === 'TRUE_FALSE' ||
                form.type === 'FILL_IN_BLANK'

            const normalizedOptions =
                form.type === 'SINGLE_CHOICE' || form.type === 'MULTIPLE_CHOICE'
                    ? form.options.map(o => o.trim())
                    : undefined

            const payloadCorrectAnswer = (() => {
                if (!hasCorrectAnswer) return undefined
                if (form.type === 'MULTIPLE_CHOICE') {
                    if (!form.multiCorrectAnswers.length) {
                        throw new Error('Please select at least one correct option')
                    }
                    return form.multiCorrectAnswers.join(',')
                }
                if ((form.type === 'SINGLE_CHOICE' || form.type === 'TRUE_FALSE' || form.type === 'FILL_IN_BLANK') && !form.correctAnswer) {
                    throw new Error('Please select a correct answer')
                }
                return form.correctAnswer
            })()

            const payload = {
                type: form.type,
                question: form.question,
                options: normalizedOptions,
                correctAnswer: payloadCorrectAnswer,
                explanation: form.explanation || undefined,
                points: form.points,
                difficulty: form.difficulty,
                maxWords: form.type === 'ESSAY' ? form.maxWords : undefined,
                rubric: form.type === 'ESSAY' ? form.rubric : undefined,
                sampleAnswer: form.type === 'ESSAY' ? form.sampleAnswer : undefined,
            }

            if (editingQuestion) {
                const response = await ApiClient.updateExamQuestion(examId, editingQuestion.id, payload)
                setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? response.data : q))
                showSuccess('Question updated successfully')
            } else {
                const response = await ApiClient.createExamQuestion(examId, payload)
                setQuestions(prev => [...prev, response.data])
                showSuccess('Question created successfully')
            }

            setShowForm(false)
            setEditingQuestion(null)
            setForm(defaultQuestionForm)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save question')
        } finally {
            setSaving(false)
        }
    }

    const handleGenerateQuestions = async () => {
        if (selectedLessonIds.length === 0) {
            setError('Select at least one lesson knowledge context to generate questions.')
            return
        }

        setGenerating(true)
        setError(null)

        try {
            const config = {
                questionCounts: {
                    singleChoice: generateConfig.singleChoice,
                    multipleChoice: generateConfig.multipleChoice,
                    trueFalse: generateConfig.trueFalse,
                    fillInBlank: generateConfig.fillInBlank,
                    essay: generateConfig.essay,
                },
                difficulty: generateConfig.difficulty,
                lessonIds: selectedLessonIds,
            }

            const response = await ApiClient.generateExamQuestions(examId, config)
            setQuestions(prev => [...prev, ...response.data])
            setShowGenerateDialog(false)
            showSuccess(`Generated ${response.data.length} questions successfully`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate questions')
        } finally {
            setGenerating(false)
        }
    }

    const showSuccess = (message: string) => {
        setSuccessMessage(message)
        setTimeout(() => setSuccessMessage(null), 3000)
    }

    const updateForm = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }

    const updateOption = (index: number, value: string) => {
        setForm(prev => ({
            ...prev,
            options: prev.options.map((o, i) => i === index ? value : o),
        }))
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
                    <Link href="/admin/exams">
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/exams">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Question Management</h1>
                            <p className="text-muted-foreground mt-1">{exam.title}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setShowGenerateDialog(true)}>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate with AI
                        </Button>
                        <Button onClick={handleCreateQuestion}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Question
                        </Button>
                    </div>
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
                        <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Questions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{questions.length}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Points</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalPoints} / {exam.totalScore}</div>
                            {totalPoints !== exam.totalScore && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Points don&apos;t match exam total
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Question Types</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(
                                    questions.reduce((acc, q) => {
                                        acc[q.type] = (acc[q.type] || 0) + 1
                                        return acc
                                    }, {} as Record<string, number>)
                                ).map(([type, count]) => (
                                    <Badge key={type} variant="secondary" className="text-xs">
                                        {questionTypeLabels[type as ExamQuestionType]}: {count}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Question Form */}
                {showForm && (
                    <Card ref={formRef}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>{editingQuestion ? 'Edit Question' : 'Add Question'}</CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSaveQuestion} className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Question Type</Label>
                                        <select
                                            className="w-full h-10 px-3 border rounded-md bg-background"
                                            value={form.type}
                                            onChange={(e) => updateForm('type', e.target.value as ExamQuestionType)}
                                        >
                                            <option value="SINGLE_CHOICE">Single Choice</option>
                                            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                                            <option value="TRUE_FALSE">True/False</option>
                                            <option value="FILL_IN_BLANK">Fill in Blank</option>
                                            <option value="ESSAY">Essay</option>
                                            <option value="EXERCISE">Exercise (Screen Recording)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Points</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={form.points}
                                            onChange={(e) => updateForm('points', parseInt(e.target.value) || 1)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Difficulty</Label>
                                        <select
                                            className="w-full h-10 px-3 border rounded-md bg-background"
                                            value={form.difficulty}
                                            onChange={(e) => updateForm('difficulty', e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
                                        >
                                            <option value="EASY">Easy</option>
                                            <option value="MEDIUM">Medium</option>
                                            <option value="HARD">Hard</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Question *</Label>
                                    <Textarea
                                        value={form.question}
                                        onChange={(e) => updateForm('question', e.target.value)}
                                        rows={3}
                                        required
                                    />
                                </div>

                                {(form.type === 'SINGLE_CHOICE' || form.type === 'MULTIPLE_CHOICE') && (
                                    <div className="space-y-2">
                                        <Label>Options</Label>
                                        {form.options.map((option, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <span className="w-6 text-center font-medium">
                                                    {String.fromCharCode(65 + index)}.
                                                </span>
                                                <Input
                                                    value={option}
                                                    onChange={(e) => updateOption(index, e.target.value)}
                                                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {(form.type === 'SINGLE_CHOICE' || form.type === 'MULTIPLE_CHOICE' || form.type === 'TRUE_FALSE' || form.type === 'FILL_IN_BLANK') && (
                                    <div className="space-y-2">
                                        <Label>Correct Answer *</Label>
                                        {form.type === 'SINGLE_CHOICE' ? (
                                            <div className="space-y-2">
                                                {form.options.map((option, index) => (
                                                    option.trim() && (
                                                        <label key={index} className="flex items-center gap-2">
                                                            <input
                                                                type="radio"
                                                                name="single-correct"
                                                                value={index.toString()}
                                                                checked={form.correctAnswer === index.toString()}
                                                                onChange={(e) => updateForm('correctAnswer', e.target.value)}
                                                                required
                                                            />
                                                            <span>{String.fromCharCode(65 + index)}. {option}</span>
                                                        </label>
                                                    )
                                                ))}
                                            </div>
                                        ) : form.type === 'MULTIPLE_CHOICE' ? (
                                            <div className="space-y-2">
                                                {form.options.map((option, index) => (
                                                    option.trim() && (
                                                        <label key={index} className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                value={index.toString()}
                                                                checked={form.multiCorrectAnswers.includes(index.toString())}
                                                                onChange={(e) => {
                                                                    const value = e.target.value
                                                                    setForm(prev => {
                                                                        const exists = prev.multiCorrectAnswers.includes(value)
                                                                        const next = exists
                                                                            ? prev.multiCorrectAnswers.filter(v => v !== value)
                                                                            : [...prev.multiCorrectAnswers, value]
                                                                        return { ...prev, multiCorrectAnswers: next }
                                                                    })
                                                                }}
                                                            />
                                                            <span>{String.fromCharCode(65 + index)}. {option}</span>
                                                        </label>
                                                    )
                                                ))}
                                                <p className="text-xs text-muted-foreground">Select one or more correct options.</p>
                                            </div>
                                        ) : form.type === 'TRUE_FALSE' ? (
                                            <select
                                                className="w-full h-10 px-3 border rounded-md bg-background"
                                                value={form.correctAnswer}
                                                onChange={(e) => updateForm('correctAnswer', e.target.value)}
                                                required
                                            >
                                                <option value="">Select...</option>
                                                <option value="true">True</option>
                                                <option value="false">False</option>
                                            </select>
                                        ) : (
                                            <Input
                                                value={form.correctAnswer}
                                                onChange={(e) => updateForm('correctAnswer', e.target.value)}
                                                placeholder="Enter the correct answer"
                                                required
                                            />
                                        )}
                                    </div>
                                )}

                                {form.type === 'ESSAY' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Max Words (optional)</Label>
                                            <Input
                                                type="number"
                                                min={50}
                                                value={form.maxWords || ''}
                                                onChange={(e) => updateForm('maxWords', e.target.value ? parseInt(e.target.value) : undefined)}
                                                placeholder="e.g., 500"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Grading Rubric</Label>
                                            <Textarea
                                                value={form.rubric || ''}
                                                onChange={(e) => updateForm('rubric', e.target.value)}
                                                rows={3}
                                                placeholder="Describe the grading criteria..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Sample Answer</Label>
                                            <Textarea
                                                value={form.sampleAnswer || ''}
                                                onChange={(e) => updateForm('sampleAnswer', e.target.value)}
                                                rows={3}
                                                placeholder="Provide a sample ideal answer..."
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="space-y-2">
                                    <Label>Explanation (shown after answering)</Label>
                                    <Textarea
                                        value={form.explanation}
                                        onChange={(e) => updateForm('explanation', e.target.value)}
                                        rows={2}
                                        placeholder="Explain why the answer is correct..."
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button type="submit" disabled={saving}>
                                        {saving ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Save className="h-4 w-4 mr-2" />
                                        )}
                                        {editingQuestion ? 'Update' : 'Create'} Question
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* AI Generation Dialog */}
                {showGenerateDialog && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5" />
                                        Generate Questions with AI
                                    </CardTitle>
                                    <CardDescription>
                                        Automatically generate questions based on course content
                                    </CardDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setShowGenerateDialog(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                                <div className="space-y-2">
                                    <Label>Single Choice</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={generateConfig.singleChoice}
                                        onChange={(e) => setGenerateConfig(prev => ({ ...prev, singleChoice: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Multiple Choice</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={generateConfig.multipleChoice}
                                        onChange={(e) => setGenerateConfig(prev => ({ ...prev, multipleChoice: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>True/False</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={generateConfig.trueFalse}
                                        onChange={(e) => setGenerateConfig(prev => ({ ...prev, trueFalse: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fill in Blank</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={generateConfig.fillInBlank}
                                        onChange={(e) => setGenerateConfig(prev => ({ ...prev, fillInBlank: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Essay</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={generateConfig.essay}
                                        onChange={(e) => setGenerateConfig(prev => ({ ...prev, essay: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Difficulty</Label>
                                <select
                                    className="w-full h-10 px-3 border rounded-md bg-background"
                                    value={generateConfig.difficulty}
                                    onChange={(e) => setGenerateConfig(prev => ({ ...prev, difficulty: e.target.value as any }))}
                                >
                                    <option value="mixed">Mixed</option>
                                    <option value="EASY">Easy</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HARD">Hard</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <Label>Lesson knowledge contexts</Label>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                setSelectedLessonIds(
                                                    knowledgeLessons
                                                        .filter((l) => l.knowledgeStatus === 'READY')
                                                        .map((l) => l.lessonId)
                                                )
                                            }
                                            disabled={knowledgeLessonsLoading || knowledgeLessons.length === 0}
                                        >
                                            Select READY
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setSelectedLessonIds([])}
                                            disabled={knowledgeLessonsLoading || selectedLessonIds.length === 0}
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </div>

                                {knowledgeLessonsLoading && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading lesson knowledge contexts…
                                    </div>
                                )}

                                {!knowledgeLessonsLoading && knowledgeLessonsError && (
                                    <div className="text-sm text-red-600">{knowledgeLessonsError}</div>
                                )}

                                {!knowledgeLessonsLoading && !knowledgeLessonsError && knowledgeLessons.length === 0 && (
                                    <div className="text-sm text-muted-foreground">
                                        {exam.examType === 'STANDALONE'
                                            ? "This is a standalone exam. Select lesson knowledge contexts from any course (upload VTTs and generate XML first)."
                                            : "No lessons available for this exam’s course."}
                                    </div>
                                )}

                                {!knowledgeLessonsLoading && !knowledgeLessonsError && knowledgeLessons.length > 0 && (
                                    <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
                                        {knowledgeLessons.map((lesson) => {
                                            const checked = selectedLessonIds.includes(lesson.lessonId)
                                            const status = lesson.knowledgeStatus
                                            const statusBadge =
                                                status === 'READY' ? (
                                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        READY
                                                    </Badge>
                                                ) : status === 'PROCESSING' ? (
                                                    <Badge variant="secondary">
                                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                        PROCESSING
                                                    </Badge>
                                                ) : status === 'FAILED' ? (
                                                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200">
                                                        <XCircle className="h-3 w-3 mr-1" />
                                                        FAILED
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary">{status}</Badge>
                                                )

                                            return (
                                                <label
                                                    key={lesson.lessonId}
                                                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            const nextChecked = e.target.checked
                                                            setSelectedLessonIds((prev) => {
                                                                if (nextChecked) return Array.from(new Set([...prev, lesson.lessonId]))
                                                                return prev.filter((id) => id !== lesson.lessonId)
                                                            })
                                                        }}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium truncate">
                                                                    {lesson.chapterTitle} · {lesson.lessonTitle}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground truncate">
                                                                    Anchors: {lesson.anchorCount} · Transcript:{' '}
                                                                    {lesson.hasTranscript ? 'Yes' : 'No'}
                                                                    {lesson.processedAt ? ` · Updated: ${lesson.processedAt}` : null}
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0">{statusBadge}</div>
                                                        </div>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}

                                {!knowledgeLessonsLoading && knowledgeLessons.length > 0 && (
                                    <div className="text-xs text-muted-foreground">
                                        Selected lessons: {selectedLessonIds.length}. Lessons without READY knowledge may take longer (or fail) if
                                        the VTT transcript/XML context is missing.
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button onClick={handleGenerateQuestions} disabled={generating}>
                                    {generating ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 mr-2" />
                                            Generate Questions
                                        </>
                                    )}
                                </Button>
                                <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Questions List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Questions ({questions.length})</CardTitle>
                        <CardDescription>Manage exam questions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {questions.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground mb-4">
                                    No questions yet. Add questions manually or generate them with AI.
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <Button variant="outline" onClick={() => setShowGenerateDialog(true)}>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Generate with AI
                                    </Button>
                                    <Button onClick={handleCreateQuestion}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Question
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {questions.map((question, index) => (
                                    <div
                                        key={question.id}
                                        className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <GripVertical className="h-4 w-4" />
                                            <span className="font-mono text-sm">{index + 1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline">
                                                    {questionTypeLabels[question.type]}
                                                </Badge>
                                                <Badge variant="secondary">
                                                    {question.points} pts
                                                </Badge>
                                                {question.difficulty && (
                                                    <span className={`px-2 py-0.5 rounded text-xs ${difficultyColors[question.difficulty]}`}>
                                                        {question.difficulty}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm line-clamp-2">{question.question}</p>
                                            {question.type === 'MULTIPLE_CHOICE' && question.options && (
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    Options: {question.options.filter(o => o).join(', ')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleEditQuestion(question)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600"
                                                onClick={() => handleDeleteQuestion(question.id)}
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
            </div>
            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={(open) => {
                    setConfirmDeleteOpen(open)
                    if (!open) setPendingDeleteId(null)
                }}
                title="Delete question?"
                description="This action cannot be undone."
                confirmLabel="Delete"
                confirmVariant="destructive"
                onConfirm={confirmDeleteQuestion}
            />
        </DashboardLayout>
    )
}
