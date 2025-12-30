'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ApiClient } from '@/lib/api-client'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import type { Course, ExamType } from '@/types'

export default function CreateExamPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [courses, setCourses] = useState<Course[]>([])
    const [loadingCourses, setLoadingCourses] = useState(true)
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
        availableFrom: '',
        deadline: '',
        certificateEnabled: false,
        certificateTitle: '',
        certificateBadgeMode: 'AUTO' as 'AUTO' | 'UPLOADED',
    })

    useEffect(() => {
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
    }, [])

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
                availableFrom: form.availableFrom || undefined,
                deadline: form.deadline || undefined,
            }

            const response = await ApiClient.createExam(payload)
            const examId = response.data.id

            try {
                if (form.certificateEnabled) {
                    if (!form.certificateTitle.trim()) {
                        throw new Error('Certificate name is required')
                    }

                    let badgeS3Key: string | null = null
                    let badgeMimeType: string | null = null

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

                    await ApiClient.upsertAdminExamCertificateTemplate(examId, {
                        isEnabled: true,
                        title: form.certificateTitle.trim(),
                        badgeMode: form.certificateBadgeMode,
                        badgeS3Key,
                        badgeMimeType,
                        badgeStyle: null,
                    })
                }
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
                            Set up a new exam with customizable settings
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
                                    <select
                                        id="examType"
                                        className="w-full h-10 px-3 border rounded-md bg-background"
                                        value={form.examType}
                                        onChange={(e) => updateForm('examType', e.target.value as ExamType)}
                                    >
                                        <option value="STANDALONE">Standalone Exam</option>
                                        <option value="COURSE_BASED">Course-Based Exam</option>
                                    </select>
                                </div>

                                {form.examType === 'COURSE_BASED' && (
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
                            <div className="grid gap-4 md:grid-cols-3">
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
                        <Link href="/admin/exams">
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
