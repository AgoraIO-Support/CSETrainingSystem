'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import { getExamTimeZoneOptions, utcToLocalDateTimeInputValue } from '@/lib/exam-timezone'
import { ArrowLeft, Loader2, Save, Send, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamStatus } from '@/types'

const statusConfig: Record<ExamStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    DRAFT: { label: 'Draft', variant: 'secondary' },
    PENDING_REVIEW: { label: 'Pending Review', variant: 'outline' },
    APPROVED: { label: 'Approved', variant: 'default' },
    PUBLISHED: { label: 'Published', variant: 'default' },
    CLOSED: { label: 'Closed', variant: 'destructive' },
    ARCHIVED: { label: 'Archived', variant: 'secondary' },
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function EditExamPage({ params }: PageProps) {
    const timeZoneOptions = getExamTimeZoneOptions()
    const { id: examId } = use(params)
    const router = useRouter()
    const searchParams = useSearchParams()
    const isSmeMode = searchParams.get('sme') === '1'
    const [exam, setExam] = useState<Exam | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [questionPointsSum, setQuestionPointsSum] = useState<number | null>(null)
    const [questionPointsLoading, setQuestionPointsLoading] = useState(false)
    const [certificateSaving, setCertificateSaving] = useState(false)
    const [certificateError, setCertificateError] = useState<string | null>(null)
    const [badgeFile, setBadgeFile] = useState<File | null>(null)
    const [badgePreviewUrl, setBadgePreviewUrl] = useState<string | null>(null)
    const [certificateForm, setCertificateForm] = useState({
        isEnabled: true,
        title: '',
        badgeMode: 'AUTO' as 'AUTO' | 'UPLOADED',
        badgeS3Key: null as string | null,
        badgeMimeType: null as string | null,
    })

    useEffect(() => {
        if (!badgeFile) return
        const url = URL.createObjectURL(badgeFile)
        setBadgePreviewUrl(url)
        return () => {
            URL.revokeObjectURL(url)
        }
    }, [badgeFile])

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
        timezone: 'UTC',
        availableFrom: '',
        deadline: '',
        assessmentKind: 'PRACTICE' as 'PRACTICE' | 'READINESS' | 'FORMAL',
        awardsStars: false,
        starValue: '0',
        countsTowardPerformance: false,
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
                    timezone: data.timezone,
                    availableFrom: utcToLocalDateTimeInputValue(data.availableFrom, data.timezone),
                    deadline: utcToLocalDateTimeInputValue(data.deadline, data.timezone),
                    assessmentKind: data.assessmentKind ?? 'PRACTICE',
                    awardsStars: data.awardsStars ?? false,
                    starValue: data.starValue?.toString() ?? '0',
                    countsTowardPerformance: data.countsTowardPerformance ?? false,
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
        if (isSmeMode) {
            return
        }
        let cancelled = false
        const loadTemplate = async () => {
            try {
                const res = await ApiClient.getAdminExamCertificateTemplate(examId)
                if (cancelled) return
                if (res.data) {
                    setCertificateForm({
                        isEnabled: res.data.isEnabled,
                        title: res.data.title || '',
                        badgeMode: res.data.badgeMode,
                        badgeS3Key: res.data.badgeS3Key ?? null,
                        badgeMimeType: res.data.badgeMimeType ?? null,
                    })
                } else {
                    setCertificateForm(prev => ({ ...prev, isEnabled: true, title: exam?.title || prev.title }))
                }
            } catch (err) {
                if (!cancelled) setCertificateError(err instanceof Error ? err.message : 'Failed to load certificate settings')
            }
        }
        loadTemplate()
        return () => { cancelled = true }
    }, [examId, exam?.title, isSmeMode])

    useEffect(() => {
        if (!exam) return
        if (exam.status !== 'DRAFT' && exam.status !== 'PENDING_REVIEW') {
            setQuestionPointsSum(null)
            return
        }

        let cancelled = false
        const loadPoints = async () => {
            setQuestionPointsLoading(true)
            try {
                const res = await ApiClient.getExamQuestions(examId)
                if (cancelled) return
                const total = (res.data || []).reduce(
                    (sum: number, q: { points?: number | null }) => sum + (q.points || 0),
                    0
                )
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
                timezone: form.timezone,
                availableFrom: form.availableFrom || null,
                deadline: form.deadline || null,
                assessmentKind: form.assessmentKind,
                awardsStars: form.awardsStars,
                starValue: form.awardsStars ? (parseInt(form.starValue) || 0) : 0,
                countsTowardPerformance: form.countsTowardPerformance,
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

    const handleSaveCertificate = async () => {
        setCertificateSaving(true)
        setCertificateError(null)
        setSuccessMessage(null)

        try {
            const title = certificateForm.title.trim() || exam?.title || 'Certificate'

            let badgeS3Key = certificateForm.badgeS3Key
            let badgeMimeType = certificateForm.badgeMimeType

            if (certificateForm.badgeMode === 'UPLOADED') {
                if (badgeFile) {
                    if (!['image/png', 'image/jpeg'].includes(badgeFile.type)) {
                        throw new Error('Badge file must be PNG or JPEG')
                    }

                    const upload = await ApiClient.getAdminExamCertificateBadgeUploadUrl(examId, {
                        filename: badgeFile.name,
                        contentType: badgeFile.type as 'image/png' | 'image/jpeg',
                    })

                    const putRes = await fetch(upload.data.uploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': badgeFile.type,
                            'x-amz-server-side-encryption': 'AES256',
                        },
                        body: badgeFile,
                    })

                    if (!putRes.ok) {
                        const text = await putRes.text().catch(() => '')
                        throw new Error(`Failed to upload badge (HTTP ${putRes.status})${text ? `: ${text.slice(0, 500)}` : ''}`)
                    }

                    badgeS3Key = upload.data.key
                    badgeMimeType = badgeFile.type
                    setBadgePreviewUrl(upload.data.accessUrl || upload.data.publicUrl)
                    setBadgeFile(null)
                }

                if (!badgeS3Key || !badgeMimeType) {
                    throw new Error('Please upload a badge image')
                }
            } else {
                badgeS3Key = null
                badgeMimeType = null
            }

            await ApiClient.upsertAdminExamCertificateTemplate(examId, {
                isEnabled: certificateForm.isEnabled,
                title,
                badgeMode: certificateForm.badgeMode,
                badgeS3Key,
                badgeMimeType,
                badgeStyle: null,
            })

            setCertificateForm(prev => ({ ...prev, title, badgeS3Key, badgeMimeType }))
            setSuccessMessage('Certificate settings saved!')
            setTimeout(() => setSuccessMessage(null), 3000)
        } catch (err) {
            setCertificateError(err instanceof Error ? err.message : 'Failed to save certificate settings')
        } finally {
            setCertificateSaving(false)
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
                    <Link href={isSmeMode ? "/sme/training-ops/exams" : "/admin/exams"}>
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const canEditExam = exam.status === 'DRAFT'
    const canPublish = exam.status === 'APPROVED' && (exam._count?.questions ?? 0) > 0
    const canSubmitForReview =
        exam.status === 'DRAFT' &&
        !questionPointsLoading &&
        questionPointsSum != null &&
        questionPointsSum === exam.totalScore
    const canApprove = exam.status === 'PENDING_REVIEW' && questionPointsSum === exam.totalScore

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={isSmeMode ? "/sme/training-ops/exams" : "/admin/exams"}>
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
                        <Link href={`/admin/exams/${examId}/questions${isSmeMode ? '?sme=1' : ''}`}>
                            <Button variant="outline">Manage Questions</Button>
                        </Link>
                        {canPublish && (
                            <Button onClick={() => router.push(`/admin/exams/${examId}/invitations${isSmeMode ? '?sme=1' : ''}`)}>
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
                        {exam.status === 'DRAFT' && (
                            <div className="mb-3 text-sm text-muted-foreground">
                                Total question points:{' '}
                                {questionPointsLoading ? 'Loading…' : questionPointsSum ?? '—'} / {exam.totalScore}
                                {!questionPointsLoading && questionPointsSum != null && questionPointsSum !== exam.totalScore && (
                                    <span className="ml-2 text-amber-600">
                                        (Must match before submit for review)
                                    </span>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {exam.status === 'DRAFT' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleStatusChange('PENDING_REVIEW')}
                                    disabled={!canSubmitForReview}
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
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleStatusChange('DRAFT')}
                                    >
                                        Return to Draft
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleStatusChange('CLOSED')}
                                    >
                                        Close Exam
                                    </Button>
                                </>
                            )}
                            {exam.status === 'CLOSED' && (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleStatusChange('DRAFT')}
                                    >
                                        Return to Draft
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleStatusChange('PUBLISHED')}
                                    >
                                        Reopen Exam
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>
                                {canEditExam
                                    ? 'Update the basic details for your exam'
                                    : 'This exam is read-only. Return to Draft to edit.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">Exam Title *</Label>
                                <Input
                                    id="title"
                                    value={form.title}
                                    onChange={(e) => updateForm('title', e.target.value)}
                                    disabled={!canEditExam}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={form.description}
                                    onChange={(e) => updateForm('description', e.target.value)}
                                    disabled={!canEditExam}
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="instructions">Instructions</Label>
                                <Textarea
                                    id="instructions"
                                    value={form.instructions}
                                    onChange={(e) => updateForm('instructions', e.target.value)}
                                    disabled={!canEditExam}
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
                                        disabled={!canEditExam}
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
                                        disabled={!canEditExam}
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
                                        disabled={!canEditExam}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Reward Policy</CardTitle>
                            <CardDescription>Configure how this assessment contributes to rewards and certification.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="assessmentKind">Assessment Kind</Label>
                                    <select
                                        id="assessmentKind"
                                        className="w-full h-10 px-3 border rounded-md bg-background"
                                        value={form.assessmentKind}
                                        onChange={(e) => updateForm('assessmentKind', e.target.value as 'PRACTICE' | 'READINESS' | 'FORMAL')}
                                        disabled={!canEditExam}
                                    >
                                        <option value="PRACTICE">Practice</option>
                                        <option value="READINESS">Readiness</option>
                                        <option value="FORMAL">Formal</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border bg-background/70 px-4 py-3 xl:col-span-1">
                                    <div className="space-y-0.5">
                                        <Label>Awards Stars</Label>
                                        <p className="text-sm text-muted-foreground">Issue stars when the learner passes</p>
                                    </div>
                                    <Switch
                                        checked={form.awardsStars}
                                        onCheckedChange={(checked: boolean) => updateForm('awardsStars', checked)}
                                        disabled={!canEditExam}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="starValue">Stars on Pass</Label>
                                    <Input
                                        id="starValue"
                                        type="number"
                                        min={0}
                                        max={20}
                                        value={form.starValue}
                                        onChange={(e) => updateForm('starValue', e.target.value)}
                                        disabled={!canEditExam || !form.awardsStars}
                                    />
                                </div>
                                <div className="flex items-center justify-between rounded-lg border bg-background/70 px-4 py-3 xl:col-span-1">
                                    <div className="space-y-0.5">
                                        <Label>Counts Toward Performance</Label>
                                        <p className="text-sm text-muted-foreground">Use for tracked or formal assessments</p>
                                    </div>
                                    <Switch
                                        checked={form.countsTowardPerformance}
                                        onCheckedChange={(checked: boolean) => updateForm('countsTowardPerformance', checked)}
                                        disabled={!canEditExam}
                                    />
                                </div>
                            </div>
                            <div className="rounded-lg border bg-background/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certificate</p>
                                <p className="mt-2 text-lg font-semibold">{certificateForm.isEnabled ? 'Enabled' : 'Not enabled'}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Certificates should normally be reserved for formal assessments. Practice and readiness assessments are better suited to stars and badges.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {!isSmeMode && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Certificate (Optional)</CardTitle>
                            <CardDescription>Issue a certificate automatically when the learner passes</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Enable certificate on pass</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Auto-issue after the attempt is graded and passed
                                    </p>
                                </div>
                                <Switch
                                    checked={certificateForm.isEnabled}
                                    onCheckedChange={(checked: boolean) => setCertificateForm(prev => ({ ...prev, isEnabled: checked }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="certificateTitle">Certificate Name</Label>
                                <Input
                                    id="certificateTitle"
                                    value={certificateForm.title}
                                    onChange={(e) => setCertificateForm(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Conversational AI Workshop Certificate"
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="certificateBadgeMode">Badge</Label>
                                    <select
                                        id="certificateBadgeMode"
                                        className="w-full h-10 px-3 border rounded-md bg-background"
                                        value={certificateForm.badgeMode}
                                        onChange={(e) => {
                                            const mode = e.target.value as 'AUTO' | 'UPLOADED'
                                            setCertificateForm(prev => ({ ...prev, badgeMode: mode }))
                                            if (mode === 'AUTO') {
                                                setBadgeFile(null)
                                                setBadgePreviewUrl(null)
                                            }
                                        }}
                                    >
                                        <option value="AUTO">Auto-generate</option>
                                        <option value="UPLOADED">Upload image</option>
                                    </select>
                                </div>

                                {certificateForm.badgeMode === 'UPLOADED' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="badgeFile">Badge File (PNG/JPEG)</Label>
                                        <Input
                                            id="badgeFile"
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            onChange={(e) => setBadgeFile(e.target.files?.[0] ?? null)}
                                        />
                                        {badgePreviewUrl && (
                                            <div className="mt-2 rounded-lg border p-2 bg-muted">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={badgePreviewUrl}
                                                    alt="Badge preview"
                                                    className="h-24 w-24 rounded-md object-cover"
                                                />
                                            </div>
                                        )}
                                        {certificateForm.badgeS3Key && (
                                            <p className="text-xs text-muted-foreground">
                                                Current badge: {certificateForm.badgeS3Key.split('/').pop()}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {certificateError && (
                                <div className="p-3 bg-destructive/10 text-destructive rounded-lg">
                                    {certificateError}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button type="button" variant="outline" onClick={handleSaveCertificate} disabled={certificateSaving}>
                                    {certificateSaving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Certificate Settings'
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Time & Availability</CardTitle>
                            <CardDescription>Availability settings for this exam</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
                                    <Input
                                        id="timeLimit"
                                        type="number"
                                        min={1}
                                        value={form.timeLimit}
                                        onChange={(e) => updateForm('timeLimit', e.target.value)}
                                        placeholder="No limit"
                                        disabled={!canEditExam}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="timezone">Timezone</Label>
                                    <Input
                                        id="timezone"
                                        list="exam-timezone-options"
                                        value={form.timezone}
                                        onChange={(e) => updateForm('timezone', e.target.value)}
                                        disabled={!canEditExam}
                                        placeholder="e.g. Asia/Shanghai"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        These times are interpreted in this business timezone and stored as UTC.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="availableFrom">Available From</Label>
                                    <Input
                                        id="availableFrom"
                                        type="datetime-local"
                                        value={form.availableFrom}
                                        onChange={(e) => updateForm('availableFrom', e.target.value)}
                                        disabled={!canEditExam}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="deadline">Deadline</Label>
                                    <Input
                                        id="deadline"
                                        type="datetime-local"
                                        value={form.deadline}
                                        onChange={(e) => updateForm('deadline', e.target.value)}
                                        disabled={!canEditExam}
                                    />
                                </div>
                            </div>
                            <datalist id="exam-timezone-options">
                                {timeZoneOptions.map((timeZone) => (
                                    <option key={timeZone} value={timeZone} />
                                ))}
                            </datalist>
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
                                    disabled={!canEditExam}
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
                                    disabled={!canEditExam}
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
                                    disabled={!canEditExam}
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
                                    disabled={!canEditExam}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-end gap-4">
                        <Link href={isSmeMode ? "/sme/training-ops/exams" : "/admin/exams"}>
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </Link>
                        <Button type="submit" disabled={saving || !canEditExam}>
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
