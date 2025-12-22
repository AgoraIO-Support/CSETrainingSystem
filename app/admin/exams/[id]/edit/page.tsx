'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import { ArrowLeft, Loader2, Save, Send, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamStatus } from '@/types'

const statusConfig: Record<ExamStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    DRAFT: { label: 'Draft', variant: 'secondary' },
    PENDING_REVIEW: { label: 'Pending Review', variant: 'outline' },
    APPROVED: { label: 'Approved', variant: 'default' },
    PUBLISHED: { label: 'Published', variant: 'default' },
    CLOSED: { label: 'Closed', variant: 'destructive' },
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function EditExamPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const router = useRouter()
    const [exam, setExam] = useState<Exam | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [questionPointsSum, setQuestionPointsSum] = useState<number | null>(null)
    const [questionPointsLoading, setQuestionPointsLoading] = useState(false)

    const [form, setForm] = useState({
        title: '',
        description: '',
        instructions: '',
        timeLimit: '',
        totalScore: '',
        passingScore: '',
        maxAttempts: '',
        randomizeQuestions: false,
        randomizeOptions: false,
        showResultsImmediately: true,
        allowReview: true,
        availableFrom: '',
        deadline: '',
    })

    useEffect(() => {
        const loadExam = async () => {
            try {
                const response = await ApiClient.getAdminExam(examId)
                const data = response.data
                setExam(data)
                setForm({
                    title: data.title,
                    description: data.description || '',
                    instructions: data.instructions || '',
                    timeLimit: data.timeLimit?.toString() || '',
                    totalScore: data.totalScore.toString(),
                    passingScore: data.passingScore.toString(),
                    maxAttempts: data.maxAttempts.toString(),
                    randomizeQuestions: data.randomizeQuestions,
                    randomizeOptions: data.randomizeOptions,
                    showResultsImmediately: data.showResultsImmediately,
                    allowReview: data.allowReview,
                    availableFrom: data.availableFrom ? new Date(data.availableFrom).toISOString().slice(0, 16) : '',
                    deadline: data.deadline ? new Date(data.deadline).toISOString().slice(0, 16) : '',
                })
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load exam')
            } finally {
                setLoading(false)
            }
        }
        loadExam()
    }, [examId])

    useEffect(() => {
        if (!exam) return
        if (exam.status !== 'PENDING_REVIEW') {
            setQuestionPointsSum(null)
            return
        }

        let cancelled = false
        const loadPoints = async () => {
            setQuestionPointsLoading(true)
            try {
                const res = await ApiClient.getExamQuestions(examId)
                if (cancelled) return
                const total = (res.data || []).reduce((sum: number, q: any) => sum + (q.points || 0), 0)
                setQuestionPointsSum(total)
            } catch {
                if (!cancelled) setQuestionPointsSum(null)
            } finally {
                if (!cancelled) setQuestionPointsLoading(false)
            }
        }
        loadPoints()
        return () => {
            cancelled = true
        }
    }, [exam, examId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSuccessMessage(null)

        try {
            const payload = {
                title: form.title,
                description: form.description || null,
                instructions: form.instructions || null,
                timeLimit: form.timeLimit ? parseInt(form.timeLimit) : null,
                totalScore: parseInt(form.totalScore) || 100,
                passingScore: parseInt(form.passingScore) || 60,
                maxAttempts: parseInt(form.maxAttempts) || 3,
                randomizeQuestions: form.randomizeQuestions,
                randomizeOptions: form.randomizeOptions,
                showResultsImmediately: form.showResultsImmediately,
                allowReview: form.allowReview,
                availableFrom: form.availableFrom || null,
                deadline: form.deadline || null,
            }

            const response = await ApiClient.updateExam(examId, payload)
            setExam(response.data)
            setSuccessMessage('Exam updated successfully!')
            setTimeout(() => setSuccessMessage(null), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update exam')
        } finally {
            setSaving(false)
        }
    }

    const handleStatusChange = async (newStatus: ExamStatus) => {
        try {
            const response = await ApiClient.updateExamStatus(examId, newStatus)
            setExam(response.data)
            setSuccessMessage(`Status changed to ${statusConfig[newStatus].label}`)
            setTimeout(() => setSuccessMessage(null), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update status')
        }
    }

    const updateForm = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
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

    const isPublished = exam.status === 'PUBLISHED'
    const canPublish = exam.status === 'APPROVED' && (exam._count?.questions ?? 0) > 0
    const canApprove = exam.status === 'PENDING_REVIEW' && questionPointsSum === exam.totalScore

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
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-bold">Edit Exam</h1>
                                <Badge variant={statusConfig[exam.status].variant}>
                                    {statusConfig[exam.status].label}
                                </Badge>
                            </div>
                            <p className="text-muted-foreground mt-1">{exam.title}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href={`/admin/exams/${examId}/questions`}>
                            <Button variant="outline">Manage Questions</Button>
                        </Link>
                        {canPublish && (
                            <Button onClick={() => router.push(`/admin/exams/${examId}/invitations`)}>
                                <Send className="h-4 w-4 mr-2" />
                                Publish & Assign Users
                            </Button>
                        )}
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
                    </div>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Status Workflow</CardTitle>
                        <CardDescription>Change the exam status</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {exam.status === 'PENDING_REVIEW' && (
                            <div className="mb-3 text-sm text-muted-foreground">
                                Total question points:{' '}
                                {questionPointsLoading ? 'Loading…' : questionPointsSum ?? '—'} / {exam.totalScore}
                                {!questionPointsLoading && questionPointsSum != null && questionPointsSum !== exam.totalScore && (
                                    <span className="ml-2 text-amber-600">
                                        (Must match to approve)
                                    </span>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {exam.status === 'DRAFT' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusChange('PENDING_REVIEW')}
                                >
                                    Submit for Review
                                </Button>
                            )}
                            {exam.status === 'PENDING_REVIEW' && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleStatusChange('APPROVED')}
                                        disabled={!canApprove || questionPointsLoading}
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleStatusChange('DRAFT')}
                                    >
                                        Return to Draft
                                    </Button>
                                </>
                            )}
                            {exam.status === 'APPROVED' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusChange('DRAFT')}
                                >
                                    Return to Draft
                                </Button>
                            )}
                            {exam.status === 'PUBLISHED' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusChange('CLOSED')}
                                >
                                    Close Exam
                                </Button>
                            )}
                            {exam.status === 'CLOSED' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusChange('PUBLISHED')}
                                >
                                    Reopen Exam
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>
                                {isPublished
                                    ? 'Some fields cannot be modified after publishing'
                                    : 'Update the basic details for your exam'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">Exam Title *</Label>
                                <Input
                                    id="title"
                                    value={form.title}
                                    onChange={(e) => updateForm('title', e.target.value)}
                                    disabled={isPublished}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={form.description}
                                    onChange={(e) => updateForm('description', e.target.value)}
                                    disabled={isPublished}
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="instructions">Instructions</Label>
                                <Textarea
                                    id="instructions"
                                    value={form.instructions}
                                    onChange={(e) => updateForm('instructions', e.target.value)}
                                    disabled={isPublished}
                                    rows={3}
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Exam Type</Label>
                                    <Input
                                        value={exam.examType === 'COURSE_BASED' ? 'Course-Based' : 'Standalone'}
                                        disabled
                                    />
                                </div>
                                {exam.course && (
                                    <div className="space-y-2">
                                        <Label>Course</Label>
                                        <Input value={exam.course.title} disabled />
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Scoring Settings</CardTitle>
                            <CardDescription>Configure how the exam is scored</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="totalScore">Total Score *</Label>
                                    <Input
                                        id="totalScore"
                                        type="number"
                                        min={1}
                                        value={form.totalScore}
                                        onChange={(e) => updateForm('totalScore', e.target.value)}
                                        disabled={isPublished}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="passingScore">Passing Score *</Label>
                                    <Input
                                        id="passingScore"
                                        type="number"
                                        min={0}
                                        value={form.passingScore}
                                        onChange={(e) => updateForm('passingScore', e.target.value)}
                                        disabled={isPublished}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="maxAttempts">Max Attempts *</Label>
                                    <Input
                                        id="maxAttempts"
                                        type="number"
                                        min={1}
                                        value={form.maxAttempts}
                                        onChange={(e) => updateForm('maxAttempts', e.target.value)}
                                        disabled={isPublished}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Time & Availability</CardTitle>
                            <CardDescription>These can be modified even after publishing</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
                                    <Input
                                        id="timeLimit"
                                        type="number"
                                        min={1}
                                        value={form.timeLimit}
                                        onChange={(e) => updateForm('timeLimit', e.target.value)}
                                        placeholder="No limit"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="availableFrom">Available From</Label>
                                    <Input
                                        id="availableFrom"
                                        type="datetime-local"
                                        value={form.availableFrom}
                                        onChange={(e) => updateForm('availableFrom', e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="deadline">Deadline</Label>
                                    <Input
                                        id="deadline"
                                        type="datetime-local"
                                        value={form.deadline}
                                        onChange={(e) => updateForm('deadline', e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Exam Options</CardTitle>
                            <CardDescription>Additional settings for the exam experience</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Randomize Questions</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Shuffle question order for each attempt
                                    </p>
                                </div>
                                <Switch
                                    checked={form.randomizeQuestions}
                                    onCheckedChange={(checked: boolean) => updateForm('randomizeQuestions', checked)}
                                    disabled={isPublished}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Randomize Options</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Shuffle answer options for multiple choice questions
                                    </p>
                                </div>
                                <Switch
                                    checked={form.randomizeOptions}
                                    onCheckedChange={(checked: boolean) => updateForm('randomizeOptions', checked)}
                                    disabled={isPublished}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Show Results Immediately</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Show score and feedback right after submission
                                    </p>
                                </div>
                                <Switch
                                    checked={form.showResultsImmediately}
                                    onCheckedChange={(checked: boolean) => updateForm('showResultsImmediately', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Allow Review</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Allow students to review their answers after submission
                                    </p>
                                </div>
                                <Switch
                                    checked={form.allowReview}
                                    onCheckedChange={(checked: boolean) => updateForm('allowReview', checked)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-end gap-4">
                        <Link href="/admin/exams">
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </Link>
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    )
}
