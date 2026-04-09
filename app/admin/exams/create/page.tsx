'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ApiClient } from '@/lib/api-client'
import { getBrowserTimeZone, getExamTimeZoneOptions } from '@/lib/exam-timezone'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import type { Course, ExamType } from '@/types'

export default function CreateExamPage() {
    const timeZoneOptions = getExamTimeZoneOptions()
    const router = useRouter()
    const searchParams = useSearchParams()
    const learningEventId = searchParams.get('learningEventId')
    const productDomainId = searchParams.get('productDomainId')
    const learningSeriesId = searchParams.get('learningSeriesId')
    const isSmeMode = searchParams.get('sme') === '1'
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [courses, setCourses] = useState<Course[]>([])
    const [loadingCourses, setLoadingCourses] = useState(true)
    const [loadingLinkedEvent, setLoadingLinkedEvent] = useState(Boolean(learningEventId))
    const [linkedEvent, setLinkedEvent] = useState<Awaited<ReturnType<typeof ApiClient.getTrainingOpsEvent>>['data'] | null>(null)
    const [badgeFile, setBadgeFile] = useState<File | null>(null)
    const [badgePreviewUrl, setBadgePreviewUrl] = useState<string | null>(null)
    const [form, setForm] = useState({
        title: '',
        description: '',
        instructions: '',
        examType: 'STANDALONE' as ExamType,
        courseId: '',
        timeLimit: '',
        totalScore: '100',
        passingScore: '60',
        maxAttempts: '3',
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
        certificateEnabled: false,
        certificateTitle: '',
        certificateBadgeMode: 'AUTO' as 'AUTO' | 'UPLOADED',
    })

    useEffect(() => {
        if (isSmeMode) {
            setLoadingCourses(false)
            return
        }
        const loadCourses = async () => {
            try {
                const response = await ApiClient.getAdminCourses({ limit: 100, status: 'ALL' })
                setCourses(response.data)
            } catch (err) {
                console.error('Failed to load courses:', err)
            } finally {
                setLoadingCourses(false)
            }
        }
        loadCourses()
    }, [isSmeMode])

    useEffect(() => {
        setForm(prev => (
            prev.timezone && prev.timezone !== 'UTC'
                ? prev
                : { ...prev, timezone: getBrowserTimeZone() }
        ))
    }, [])

    useEffect(() => {
        if (!learningEventId) {
            setLoadingLinkedEvent(false)
            return
        }

        const loadLinkedEvent = async () => {
            try {
                const response = await ApiClient.getTrainingOpsEvent(learningEventId)
                setLinkedEvent(response.data)
                setForm((prev) => ({
                    ...prev,
                    title: prev.title || response.data.title,
                    assessmentKind:
                        response.data.countsTowardPerformance || response.data.format === 'FINAL_EXAM'
                            ? 'FORMAL'
                            : response.data.format === 'RELEASE_BRIEFING'
                                ? 'READINESS'
                                : 'PRACTICE',
                    awardsStars: (response.data.starValue ?? 0) > 0,
                    starValue: response.data.starValue?.toString() ?? '0',
                    countsTowardPerformance: response.data.countsTowardPerformance,
                }))
            } catch (err) {
                console.error('Failed to load linked learning event:', err)
                setError(err instanceof Error ? err.message : 'Failed to load linked learning event')
            } finally {
                setLoadingLinkedEvent(false)
            }
        }

        void loadLinkedEvent()
    }, [learningEventId])

    useEffect(() => {
        if (!badgeFile) return
        const url = URL.createObjectURL(badgeFile)
        setBadgePreviewUrl(url)
        return () => {
            URL.revokeObjectURL(url)
        }
    }, [badgeFile])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const payload = {
                title: form.title,
                examType: form.examType,
                description: form.description || undefined,
                instructions: form.instructions || undefined,
                courseId: form.examType === 'COURSE_BASED' && form.courseId ? form.courseId : undefined,
                timeLimit: form.timeLimit ? parseInt(form.timeLimit) : undefined,
                totalScore: parseInt(form.totalScore) || 100,
                passingScore: parseInt(form.passingScore) || 60,
                maxAttempts: parseInt(form.maxAttempts) || 3,
                randomizeQuestions: form.randomizeQuestions,
                randomizeOptions: form.randomizeOptions,
                showResultsImmediately: form.showResultsImmediately,
                allowReview: form.allowReview,
                timezone: form.timezone,
                availableFrom: form.availableFrom || undefined,
                deadline: form.deadline || undefined,
                assessmentKind: form.assessmentKind,
                productDomainId: linkedEvent?.domain?.id ?? productDomainId ?? null,
                learningSeriesId: linkedEvent?.series?.id ?? learningSeriesId ?? null,
                learningEventId: linkedEvent?.id ?? null,
                awardsStars: form.awardsStars,
                starValue: form.awardsStars ? (parseInt(form.starValue) || 0) : 0,
                countsTowardPerformance: form.countsTowardPerformance,
            }

            const response = await ApiClient.createExam(payload)
            const examId = response.data.id

            if (isSmeMode) {
                router.push(`/admin/exams/${examId}/edit?sme=1`)
                return
            }

            try {
                let badgeS3Key: string | null = null
                let badgeMimeType: string | null = null
                let templateTitle = form.certificateTitle.trim()

                if (form.certificateEnabled) {
                    if (!templateTitle) {
                        throw new Error('Certificate name is required')
                    }

                    if (form.certificateBadgeMode === 'UPLOADED') {
                        if (!badgeFile) {
                            throw new Error('Badge file is required when using uploaded badge')
                        }
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
                } else if (!templateTitle) {
                    templateTitle = `${form.title.trim()} Certificate` || 'Certificate'
                }

                await ApiClient.upsertAdminExamCertificateTemplate(examId, {
                    isEnabled: form.certificateEnabled,
                    title: templateTitle,
                    badgeMode: form.certificateEnabled ? form.certificateBadgeMode : 'AUTO',
                    badgeS3Key: form.certificateEnabled ? badgeS3Key : null,
                    badgeMimeType: form.certificateEnabled ? badgeMimeType : null,
                    badgeStyle: null,
                })
            } catch (templateErr) {
                try { await ApiClient.deleteExamForce(examId) } catch { /* ignore */ }
                throw templateErr
            }

            router.push(`/admin/exams/${examId}/questions`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create exam')
        } finally {
            setLoading(false)
        }
    }

    const updateForm = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin/exams">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">Create Exam</h1>
                        <p className="text-muted-foreground mt-1">
                            {isSmeMode ? 'Create and edit an exam within your SME workspace' : 'Set up a new exam with customizable settings'}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Information</CardTitle>
                            <CardDescription>Enter the basic details for your exam</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {loadingLinkedEvent ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                    Loading linked learning event...
                                </div>
                            ) : null}
                            {linkedEvent ? (
                                <div className="rounded-lg border border-[#b8ecff] bg-[#effbff] px-4 py-3 text-sm text-[#006688]">
                                    This exam will be created for learning event <span className="font-semibold">{linkedEvent.title}</span>.
                                </div>
                            ) : null}
                            <div className="space-y-2">
                                <Label htmlFor="title">Exam Title *</Label>
                                <Input
                                    id="title"
                                    value={form.title}
                                    onChange={(e) => updateForm('title', e.target.value)}
                                    placeholder="e.g., Introduction to Web Development - Final Exam"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={form.description}
                                    onChange={(e) => updateForm('description', e.target.value)}
                                    placeholder="Provide a brief description of the exam..."
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="instructions">Instructions</Label>
                                <Textarea
                                    id="instructions"
                                    value={form.instructions}
                                    onChange={(e) => updateForm('instructions', e.target.value)}
                                    placeholder="Instructions shown to students before starting the exam..."
                                    rows={3}
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="examType">Exam Type *</Label>
                                    {isSmeMode ? (
                                        <Input id="examType" value="Standalone Exam" disabled />
                                    ) : (
                                        <select
                                            id="examType"
                                            className="w-full h-10 px-3 border rounded-md bg-background"
                                            value={form.examType}
                                            onChange={(e) => updateForm('examType', e.target.value as ExamType)}
                                        >
                                            <option value="STANDALONE">Standalone Exam</option>
                                            <option value="COURSE_BASED">Course-Based Exam</option>
                                        </select>
                                    )}
                                </div>

                                {!isSmeMode && form.examType === 'COURSE_BASED' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="courseId">Course</Label>
                                        <select
                                            id="courseId"
                                            className="w-full h-10 px-3 border rounded-md bg-background"
                                            value={form.courseId}
                                            onChange={(e) => updateForm('courseId', e.target.value)}
                                            disabled={loadingCourses}
                                        >
                                            <option value="">Select a course...</option>
                                            {courses.map(course => (
                                                <option key={course.id} value={course.id}>
                                                    {course.title}
                                                </option>
                                            ))}
                                        </select>
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
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="totalScore">Total Score *</Label>
                                    <Input
                                        id="totalScore"
                                        type="number"
                                        min={1}
                                        value={form.totalScore}
                                        onChange={(e) => updateForm('totalScore', e.target.value)}
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
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Reward Policy</CardTitle>
                            <CardDescription>Configure how this assessment contributes to learner rewards and formal recognition.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {linkedEvent ? (
                                <div className="rounded-lg border border-[#b8ecff] bg-[#effbff] px-4 py-3 text-sm text-[#006688]">
                                    Reward defaults were prefilled from the linked learning event. You can still override them for this exam.
                                </div>
                            ) : null}
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                    <Label htmlFor="assessmentKind">Assessment Kind</Label>
                                    <select
                                        id="assessmentKind"
                                        className="w-full h-10 px-3 border rounded-md bg-background"
                                        value={form.assessmentKind}
                                        onChange={(e) => updateForm('assessmentKind', e.target.value as 'PRACTICE' | 'READINESS' | 'FORMAL')}
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
                                        disabled={!form.awardsStars}
                                    />
                                </div>
                                <div className="flex items-center justify-between rounded-lg border bg-background/70 px-4 py-3 xl:col-span-1">
                                    <div className="space-y-0.5">
                                        <Label>Counts Toward Performance</Label>
                                        <p className="text-sm text-muted-foreground">Use for formal or tracked assessments</p>
                                    </div>
                                    <Switch
                                        checked={form.countsTowardPerformance}
                                        onCheckedChange={(checked: boolean) => updateForm('countsTowardPerformance', checked)}
                                    />
                                </div>
                            </div>
                            <div className="rounded-lg border bg-background/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certificate</p>
                                <p className="mt-2 text-lg font-semibold">{form.certificateEnabled ? 'Enabled' : 'Not enabled'}</p>
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
                                    checked={form.certificateEnabled}
                                    onCheckedChange={(checked: boolean) => updateForm('certificateEnabled', checked)}
                                />
                            </div>

                            {form.certificateEnabled && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="certificateTitle">Certificate Name *</Label>
                                        <Input
                                            id="certificateTitle"
                                            value={form.certificateTitle}
                                            onChange={(e) => updateForm('certificateTitle', e.target.value)}
                                            placeholder="e.g., Conversational AI Workshop Certificate"
                                        />
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="certificateBadgeMode">Badge</Label>
                                            <select
                                                id="certificateBadgeMode"
                                                className="w-full h-10 px-3 border rounded-md bg-background"
                                                value={form.certificateBadgeMode}
                                                onChange={(e) => {
                                                    const mode = e.target.value as 'AUTO' | 'UPLOADED'
                                                    updateForm('certificateBadgeMode', mode)
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

                                        {form.certificateBadgeMode === 'UPLOADED' && (
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
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Time & Availability</CardTitle>
                            <CardDescription>Set time limits and availability window</CardDescription>
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
                                    <Label htmlFor="timezone">Timezone</Label>
                                    <Input
                                        id="timezone"
                                        list="exam-timezone-options"
                                        value={form.timezone}
                                        onChange={(e) => updateForm('timezone', e.target.value)}
                                        placeholder="e.g. Asia/Shanghai"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Available From and Deadline below are interpreted in this timezone and stored as UTC.
                                    </p>
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

                    {error && (
                        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-4">
                        <Link href={isSmeMode ? "/sme/training-ops/exams" : "/admin/exams"}>
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </Link>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Create Exam
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    )
}
