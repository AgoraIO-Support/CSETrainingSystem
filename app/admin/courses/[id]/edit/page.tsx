'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiClient } from '@/lib/api-client'
import type { Course, CourseLevel } from '@/types'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '')

const levels: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']

type LessonAssetDto = {
    id: string
    title: string
    description?: string | null
    type: string
    url: string
}

type CourseAssetDto = {
    id: string
    title: string
    description?: string | null
    type: string
    url: string
    contentType?: string | null
}

type PendingCourseAsset = {
    id: string
    file: File
    title: string
    description: string
    type: string
    uploading: boolean
    error: string | null
}

type AdminLesson = {
    id: string
    title: string
    description?: string | null
    assets?: LessonAssetDto[]
}

type AdminChapter = {
    id: string
    title: string
    lessons: AdminLesson[]
}

type AdminCourse = Course & {
    slug?: string
    instructorId?: string
    chapters?: AdminChapter[]
    assets?: CourseAssetDto[]
}

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()

    const getAuthHeaders = (): Record<string, string> => {
        if (typeof window === 'undefined') return {}
        const token = localStorage.getItem('accessToken')
        return token ? { Authorization: `Bearer ${token}` } : {}
    }

    const [course, setCourse] = useState<AdminCourse | null>(null)
    const [form, setForm] = useState({
        title: '',
        slug: '',
        description: '',
        thumbnail: '',
        level: 'BEGINNER',
        category: '',
        tags: '',
        instructorId: '',
        status: 'DRAFT',
        learningOutcomes: '',
        requirements: '',
    })
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [instructors, setInstructors] = useState<Array<{ id: string; name: string }>>([])
    const [pendingCourseAssets, setPendingCourseAssets] = useState<PendingCourseAsset[]>([])
    const [courseAssetError, setCourseAssetError] = useState<string | null>(null)
    const [courseAssetUploading, setCourseAssetUploading] = useState(false)
    const [defaultCourseAssetType, setDefaultCourseAssetType] = useState('DOCUMENT')

    useEffect(() => {
        let mounted = true
        const loadCourse = async () => {
            try {
                const [courseRes, instructorsRes] = await Promise.all([
                    ApiClient.getCourse(id),
                    ApiClient.getInstructors(),
                ])

                if (!mounted) return

                const data = courseRes.data as AdminCourse
                setCourse(data)
                setForm({
                    title: data.title,
                    slug: data.slug || '',
                    description: data.description,
                    thumbnail: data.thumbnail || '',
                    level: data.level,
                    category: data.category,
                    tags: data.tags.join(', '),
                    instructorId: data.instructor?.id || '',
                    status: data.status || 'DRAFT',
                    learningOutcomes: (data.learningOutcomes || []).join('\n'),
                    requirements: (data.requirements || []).join('\n'),
                })

                setInstructors(instructorsRes.data.map(instr => ({ id: instr.id, name: instr.name })))
            } catch (err) {
                console.error(err)
                setError(err instanceof Error ? err.message : 'Failed to load course')
            } finally {
                if (mounted) setLoading(false)
            }
        }

        loadCourse()
        return () => {
            mounted = false
        }
    }, [id])

    const handleChange = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    const getUploadEndpoint = () =>
        backendBaseUrl ? `${backendBaseUrl}/api/admin/uploads` : '/api/admin/files/upload-url'

    const getCourseAssetCreateEndpoint = () =>
        backendBaseUrl ? `${backendBaseUrl}/api/admin/materials` : `/api/admin/courses/${id}/assets`

    const getCourseAssetDeleteEndpoint = (assetId: string) =>
        backendBaseUrl ? `${backendBaseUrl}/api/admin/materials/${assetId}` : `/api/admin/courses/assets/${assetId}`

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        setError(null)
        setSuccess(null)

        try {
            const payload = {
                title: form.title,
                slug: form.slug,
                description: form.description,
                thumbnail: form.thumbnail || undefined,
                level: form.level as CourseLevel,
                category: form.category,
                tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
                status: form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
                learningOutcomes: form.learningOutcomes
                    .split('\n')
                    .map(item => item.trim())
                    .filter(Boolean),
                requirements: form.requirements
                    .split('\n')
                    .map(item => item.trim())
                    .filter(Boolean),
                instructorId: form.instructorId,
            }

            await ApiClient.updateCourse(id, payload)
            setSuccess('Course updated successfully')
            setTimeout(() => router.push('/admin/courses'), 1200)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else if (typeof err === 'object' && err !== null && 'error' in err) {
                const apiError = err as { error?: { message?: string } }
                setError(apiError.error?.message || 'Failed to update course')
            } else {
                setError('Failed to update course')
            }
        } finally {
            setSubmitting(false)
        }
    }

    const assetTypes = [
        { value: 'VIDEO', label: 'Video' },
        { value: 'DOCUMENT', label: 'Document' },
        { value: 'PRESENTATION', label: 'Presentation' },
        { value: 'TEXT', label: 'Text' },
        { value: 'AUDIO', label: 'Audio' },
        { value: 'OTHER', label: 'Other' },
    ]

    const assetFolderByType: Record<string, 'documents' | 'presentations' | 'videos' | 'other'> = {
        VIDEO: 'videos',
        DOCUMENT: 'documents',
        PRESENTATION: 'presentations',
        TEXT: 'documents',
        AUDIO: 'other',
        OTHER: 'other',
    }

    const [assetForms, setAssetForms] = useState<Record<string, {
        title: string
        description: string
        type: string
        file: File | null
        uploading: boolean
        error: string | null
    }>>({})

    const formatFileSize = (size: number) => {
        if (size < 1024) return `${size} B`
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
        return `${(size / (1024 * 1024)).toFixed(1)} MB`
    }

    const generateTempId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID()
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }

    const handleCourseAssetFilesSelected = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return
        setCourseAssetError(null)
        const newItems: PendingCourseAsset[] = Array.from(fileList).map(file => {
            const baseTitle = file.name.replace(/\.[^/.]+$/, '') || file.name
            return {
                id: generateTempId(),
                file,
                title: baseTitle,
                description: '',
                type: defaultCourseAssetType,
                uploading: false,
                error: null,
            }
        })

        setPendingCourseAssets(prev => [...prev, ...newItems])
    }

    const updatePendingCourseAsset = (assetId: string, patch: Partial<Omit<PendingCourseAsset, 'id' | 'file'>>) => {
        setPendingCourseAssets(prev =>
            prev.map(asset => (asset.id === assetId ? { ...asset, ...patch } : asset))
        )
    }

    const removePendingCourseAsset = (assetId: string) => {
        setPendingCourseAssets(prev => prev.filter(asset => asset.id !== assetId))
    }

    const updateAssetForm = (lessonId: string, patch: Partial<{
        title: string
        description: string
        type: string
        file: File | null
        uploading: boolean
        error: string | null
    }>) => {
        setAssetForms(prev => {
            const defaults = {
                title: '',
                description: '',
                type: 'DOCUMENT',
                file: null as File | null,
                uploading: false,
                error: null as string | null,
            }
            const nextForm = {
                ...defaults,
                ...(prev[lessonId] ?? {}),
                ...patch,
            }
            return { ...prev, [lessonId]: nextForm }
        })
    }

    const handleAssetUpload = async (lessonId: string) => {
        const formState = assetForms[lessonId]
        if (!formState || !formState.file || !formState.title) {
            updateAssetForm(lessonId, { error: 'Title and file are required' })
            return
        }

        updateAssetForm(lessonId, { uploading: true, error: null })

        try {
            const uploadMetaRes = await fetch('/api/admin/files/upload-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify({
                    filename: formState.file.name,
                    contentType: formState.file.type || 'application/octet-stream',
                    assetType: 'documents',
                }),
            })

            if (!uploadMetaRes.ok) {
                throw new Error('Failed to get upload URL')
            }

            const uploadMeta = await uploadMetaRes.json()
            const uploadData = uploadMeta.data

            await fetch(uploadData.uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': formState.file.type || 'application/octet-stream',
                    'x-amz-acl': 'public-read',
                },
                body: formState.file,
            })

            const payload = {
                courseId: id,
                title: formState.title,
                description: formState.description,
                url: uploadData.url,
                s3Key: uploadData.key,
                contentType: formState.file.type || 'application/octet-stream',
                type: formState.type,
            }

            const assetRes = await fetch(`/api/admin/lessons/${lessonId}/assets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify(payload),
            })

            if (!assetRes.ok) {
                const errJson = await assetRes.json().catch(() => null)
                throw new Error(errJson?.error?.message || 'Failed to save asset metadata')
            }

            await reloadCourse()
            updateAssetForm(lessonId, { title: '', description: '', file: null, uploading: false })
        } catch (err) {
            console.error(err)
            updateAssetForm(lessonId, {
                uploading: false,
                error: err instanceof Error ? err.message : 'Failed to upload asset',
            })
        }
    }

    const handleDeleteAsset = async (lessonId: string, assetId: string) => {
        const confirmed = window.confirm('Delete this asset?')
        if (!confirmed) return

        try {
            const res = await fetch(`/api/admin/lessons/assets/${assetId}`, {
                method: 'DELETE',
                headers: {
                    ...getAuthHeaders(),
                },
            })
            if (!res.ok) {
                const errJson = await res.json().catch(() => null)
                throw new Error(errJson?.error?.message || 'Failed to delete asset')
            }
            await reloadCourse()
        } catch (err) {
            updateAssetForm(lessonId, {
                error: err instanceof Error ? err.message : 'Failed to delete asset',
            })
        }
    }

    const handleCourseAssetUpload = async () => {
        if (pendingCourseAssets.length === 0) {
            setCourseAssetError('Select at least one file to upload')
            return
        }

        setCourseAssetError(null)
        setCourseAssetUploading(true)
        const assetsToUpload = [...pendingCourseAssets]
        let uploadedAny = false

        for (const asset of assetsToUpload) {
            setPendingCourseAssets(prev =>
                prev.map(item =>
                    item.id === asset.id ? { ...item, uploading: true, error: null } : item
                )
            )

            try {
                const uploadMetaRes = await fetch(getUploadEndpoint(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders(),
                    },
                    body: JSON.stringify({
                        courseId: id,
                        filename: asset.file.name,
                        contentType: asset.file.type || 'application/octet-stream',
                        assetType: assetFolderByType[asset.type] || 'documents',
                    }),
                })

                if (!uploadMetaRes.ok) {
                    throw new Error('Failed to get upload URL')
                }

                const uploadMeta = await uploadMetaRes.json()
                const uploadData = uploadMeta.data

                await fetch(uploadData.uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': asset.file.type || 'application/octet-stream',
                    },
                    body: asset.file,
                })

                const payload = {
                    courseId: id,
                    title: asset.title,
                    description: asset.description,
                    cloudfrontUrl: uploadData.cloudfrontUrl || uploadData.url,
                    s3Key: uploadData.key,
                    mimeType: asset.file.type || 'application/octet-stream',
                    sizeBytes: asset.file.size,
                    type: asset.type,
                }

                const assetRes = await fetch(getCourseAssetCreateEndpoint(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders(),
                    },
                    body: JSON.stringify(payload),
                })

                if (!assetRes.ok) {
                    const errJson = await assetRes.json().catch(() => null)
                    throw new Error(errJson?.error?.message || 'Failed to save asset metadata')
                }

                uploadedAny = true
                setPendingCourseAssets(prev => prev.filter(item => item.id !== asset.id))
            } catch (err) {
                console.error(err)
                const message = err instanceof Error ? err.message : 'Failed to upload asset'
                setPendingCourseAssets(prev =>
                    prev.map(item =>
                        item.id === asset.id ? { ...item, uploading: false, error: message } : item
                    )
                )
            }
        }

        if (uploadedAny) {
            await reloadCourse()
        }

        setCourseAssetUploading(false)
    }

    const handleCourseAssetDelete = async (assetId: string) => {
        const confirmed = window.confirm('Delete this course material?')
        if (!confirmed) return

        try {
            const res = await fetch(getCourseAssetDeleteEndpoint(assetId), {
                method: 'DELETE',
                headers: {
                    ...getAuthHeaders(),
                },
            })

            if (!res.ok) {
                const errJson = await res.json().catch(() => null)
                throw new Error(errJson?.error?.message || 'Failed to delete asset')
            }

            await reloadCourse()
        } catch (err) {
            setCourseAssetError(err instanceof Error ? err.message : 'Failed to delete asset')
        }
    }

    const reloadCourse = async () => {
        try {
            const response = await ApiClient.getCourse(id)
            setCourse(response.data)
        } catch (err) {
            console.error(err)
        }
    }

    const chapterCount = course?.chapters?.length ?? 0
    const lessonCount =
        course?.chapters?.reduce((sum, chapter) => sum + chapter.lessons.length, 0) ?? 0
    const lessonAssetCount =
        course?.chapters?.reduce(
            (sum, chapter) =>
                sum +
                chapter.lessons.reduce(
                    (lessonSum, lesson) => lessonSum + ((lesson as any).assets?.length ?? 0),
                    0
                ),
            0
        ) ?? 0
    const courseAssetCount = course?.assets?.length ?? 0
    const pendingAssetCount = pendingCourseAssets.length
    const levelLabel = (course?.level ?? form.level ?? 'BEGINNER') as CourseLevel
    const categoryLabel = course?.category ?? (form.category || 'Uncategorized')
    const instructorName =
        instructors.find(instr => instr.id === form.instructorId)?.name ||
        course?.instructor?.name ||
        'Unassigned'
    const displayTags =
        course?.tags ??
        form.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[60vh] flex-col items-center justify-center text-center text-muted-foreground">
                    <Loader2 className="mb-3 h-6 w-6 animate-spin" />
                    <p className="text-sm font-medium">Loading course details...</p>
                </div>
            </DashboardLayout>
        )
    }

    if (error && !course) {
        return (
            <DashboardLayout>
                <Alert variant="destructive" className="max-w-2xl">
                    <AlertTitle>Unable to load course</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-8 pb-12">
                <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Course #{course?.id ?? id}</p>
                        <h1 className="text-3xl font-semibold tracking-tight">Edit Course</h1>
                        <p className="text-sm text-muted-foreground">
                            Update catalog details, media, and supporting materials for learners.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/admin/courses">Back to courses</Link>
                        </Button>
                        {course?.slug && (
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/courses/${course.slug}`} target="_blank">
                                    Preview course
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                {(error || success) && (
                    <div className="space-y-3">
                        {error && (
                            <Alert variant="destructive">
                                <AlertTitle>Something went wrong</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        {success && (
                            <Alert>
                                <AlertTitle>Updates applied</AlertTitle>
                                <AlertDescription>{success}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                    <Card className="h-full">
                        <CardHeader className="pb-4">
                            <CardTitle>Course Details</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Keep the hero content concise and compelling.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-8" onSubmit={handleSubmit}>
                                <section className="space-y-4">
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Basics</p>
                                        <h3 className="text-lg font-semibold">Course identity</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Title, slug, and description learners will see.
                                        </p>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="title">Title</Label>
                                            <Input
                                                id="title"
                                                value={form.title}
                                                onChange={e => handleChange('title', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="slug">Slug</Label>
                                            <Input
                                                id="slug"
                                                value={form.slug}
                                                onChange={e => handleChange('slug', e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            rows={4}
                            value={form.description}
                            onChange={e => handleChange('description', e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="learningOutcomes">What you'll learn</Label>
                            <Textarea
                                id="learningOutcomes"
                                rows={4}
                                placeholder="One item per line"
                                value={form.learningOutcomes}
                                onChange={e => handleChange('learningOutcomes', e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="requirements">Requirements</Label>
                            <Textarea
                                id="requirements"
                                rows={4}
                                placeholder="One item per line"
                                value={form.requirements}
                                onChange={e => handleChange('requirements', e.target.value)}
                            />
                        </div>
                    </div>
                                </section>

                                <section className="space-y-4">
                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                            Categorization
                                        </p>
                                        <h3 className="text-lg font-semibold">Media & ownership</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Attach visuals, pick a category, and assign an instructor.
                                        </p>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="thumbnail">Thumbnail URL</Label>
                                            <Input
                                                id="thumbnail"
                                                value={form.thumbnail}
                                                onChange={e => handleChange('thumbnail', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="category">Category</Label>
                                            <Input
                                                id="category"
                                                value={form.category}
                                                onChange={e => handleChange('category', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="status">Status</Label>
                                            <Select value={form.status} onValueChange={value => handleChange('status', value)}>
                                                <SelectTrigger id="status">
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="DRAFT">Draft (hidden)</SelectItem>
                                                    <SelectItem value="PUBLISHED">Published (visible)</SelectItem>
                                                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Level</Label>
                                            <Select value={form.level} onValueChange={value => handleChange('level', value)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select level" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {levels.map(level => (
                                                        <SelectItem key={level} value={level}>
                                                            {level}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Instructor</Label>
                                            <Select value={form.instructorId} onValueChange={value => handleChange('instructorId', value)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Assign instructor" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {instructors.map(instr => (
                                                        <SelectItem key={instr.id} value={instr.id}>
                                                            {instr.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="tags">Tags</Label>
                                        <Input
                                            id="tags"
                                            value={form.tags}
                                            onChange={e => handleChange('tags', e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Comma-separated keywords that power search, e.g. security, fundamentals.
                                        </p>
                                    </div>
                                </section>

                                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
                                    <Button type="button" variant="outline" asChild>
                                        <Link href="/admin/courses">Cancel</Link>
                                    </Button>
                                    <Button type="submit" disabled={submitting}>
                                        {submitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Saving
                                            </>
                                        ) : (
                                            'Save changes'
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="pb-4">
                                <CardTitle>Course snapshot</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Quick signals to confirm the course is ready for learners.
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary">{levelLabel}</Badge>
                                    <Badge variant="secondary">{categoryLabel}</Badge>
                                </div>
                                <dl className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <dt className="text-muted-foreground">Chapters</dt>
                                        <dd className="text-2xl font-semibold">{chapterCount}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Lessons</dt>
                                        <dd className="text-2xl font-semibold">{lessonCount}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Course assets</dt>
                                        <dd className="text-2xl font-semibold">{courseAssetCount}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Lesson assets</dt>
                                        <dd className="text-2xl font-semibold">{lessonAssetCount}</dd>
                                    </div>
                                </dl>
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Tags</p>
                                    {displayTags.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {displayTags.map(tag => (
                                                <Badge key={tag} variant="outline">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Add tags so learners can discover this course.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-4">
                                <CardTitle>Instructor & workflow</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Keep ownership and upload progress visible.
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm">
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Instructor</p>
                                    <p className="text-base font-semibold text-foreground">{instructorName}</p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending uploads</p>
                                    <p className="text-base font-semibold text-foreground">{pendingAssetCount}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Files staged below, waiting to be pushed to storage.
                                    </p>
                                </div>
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Course visibility</p>
                                    <p className="text-sm text-muted-foreground">
                                        Save changes to sync updates with the catalog instantly.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {course && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Materials & assets</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Manage downloads that apply to the entire course or drill into lesson-level attachments.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="course">
                                <TabsList>
                                    <TabsTrigger value="course">Course library</TabsTrigger>
                                    <TabsTrigger value="lessons">Lesson assets</TabsTrigger>
                                </TabsList>
                                <TabsContent value="course" className="space-y-6">
                                    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                                        <section className="space-y-4">
                                            <div>
                                                <p className="text-sm font-semibold">Existing materials</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Files available to every learner regardless of lesson.
                                                </p>
                                            </div>
                                            {course.assets && course.assets.length > 0 ? (
                                                <div className="space-y-3">
                                                    {course.assets.map(asset => (
                                                        <div
                                                            key={asset.id}
                                                            className="flex items-start justify-between rounded-lg border p-3"
                                                        >
                                                            <div className="pr-4">
                                                                <p className="font-medium">{asset.title}</p>
                                                                <p className="text-xs text-muted-foreground">{asset.type}</p>
                                                                {asset.description && (
                                                                    <p className="mt-1 text-xs text-muted-foreground">{asset.description}</p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Button asChild size="sm" variant="outline">
                                                                    <Link href={asset.url} target="_blank">
                                                                        View
                                                                    </Link>
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive"
                                                                    onClick={() => handleCourseAssetDelete(asset.id)}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <Alert>
                                                    <AlertTitle>No materials yet</AlertTitle>
                                                    <AlertDescription>
                                                        Upload slide decks, worksheets, or supporting documents so learners can download everything in one spot.
                                                    </AlertDescription>
                                                </Alert>
                                            )}
                                        </section>

                                        <section className="space-y-4 rounded-lg border p-4">
                                            <div>
                                                <p className="text-sm font-semibold">Upload new material</p>
                                                <p className="text-sm text-muted-foreground">
                                                    Stage multiple files, edit metadata, then upload in one batch.
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Default type</Label>
                                                <Select
                                                    value={defaultCourseAssetType}
                                                    onValueChange={value => setDefaultCourseAssetType(value)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {assetTypes.map(type => (
                                                            <SelectItem key={type.value} value={type.value}>
                                                                {type.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    Applies to every file you pick until you change it.
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Files</Label>
                                                <Input
                                                    type="file"
                                                    multiple
                                                    onChange={e => {
                                                        handleCourseAssetFilesSelected(e.target.files)
                                                        if (e.target) {
                                                            e.target.value = ''
                                                        }
                                                    }}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    PDFs, decks, spreadsheets, audio, or video up to your S3 limit.
                                                </p>
                                            </div>
                                            {pendingCourseAssets.length > 0 ? (
                                                <div className="space-y-4 rounded-md border p-3">
                                                    {pendingCourseAssets.map(asset => (
                                                        <div
                                                            key={asset.id}
                                                            className="space-y-3 border-b pb-3 last:border-b-0 last:pb-0"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <p className="font-medium">{asset.file.name}</p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {formatFileSize(asset.file.size)} · {asset.file.type || 'unknown'}
                                                                    </p>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => removePendingCourseAsset(asset.id)}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                <div className="space-y-2">
                                                                    <Label>Title</Label>
                                                                    <Input
                                                                        value={asset.title}
                                                                        onChange={e =>
                                                                            updatePendingCourseAsset(asset.id, { title: e.target.value })
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label>Type</Label>
                                                                    <Select
                                                                        value={asset.type}
                                                                        onValueChange={value =>
                                                                            updatePendingCourseAsset(asset.id, { type: value })
                                                                        }
                                                                    >
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select type" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {assetTypes.map(type => (
                                                                                <SelectItem key={type.value} value={type.value}>
                                                                                    {type.label}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label>Description</Label>
                                                                <Textarea
                                                                    rows={2}
                                                                    value={asset.description}
                                                                    onChange={e =>
                                                                        updatePendingCourseAsset(asset.id, { description: e.target.value })
                                                                    }
                                                                />
                                                            </div>
                                                            {asset.error && (
                                                                <p className="text-sm text-destructive">{asset.error}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    No files staged. Use the picker above to add materials.
                                                </p>
                                            )}
                                            {courseAssetError && (
                                                <p className="text-sm text-destructive">{courseAssetError}</p>
                                            )}
                                            <Button
                                                type="button"
                                                className="w-full"
                                                onClick={handleCourseAssetUpload}
                                                disabled={courseAssetUploading || pendingCourseAssets.length === 0}
                                            >
                                                {courseAssetUploading ? 'Uploading...' : 'Upload materials'}
                                            </Button>
                                        </section>
                                    </div>
                                </TabsContent>

                                <TabsContent value="lessons" className="space-y-4">
                                    {course.chapters?.length ? (
                                        course.chapters.map(chapter => (
                                            <Card key={chapter.id} className="border-dashed">
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-lg font-semibold">{chapter.title}</CardTitle>
                                                    <p className="text-sm text-muted-foreground">
                                                        {chapter.lessons.length} lesson{chapter.lessons.length === 1 ? '' : 's'}
                                                    </p>
                                                </CardHeader>
                                                <CardContent className="space-y-6">
                                                    {chapter.lessons.map(lesson => {
                                                        const formState = assetForms[lesson.id] || {
                                                            title: '',
                                                            description: '',
                                                            type: 'DOCUMENT',
                                                            file: null,
                                                            uploading: false,
                                                            error: null,
                                                        }

                                                        return (
                                                            <div key={lesson.id} className="space-y-4 rounded-lg border p-4">
                                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                    <div>
                                                                        <h4 className="font-semibold">{lesson.title}</h4>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            {(lesson as any).assets?.length || 0} asset(s)
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    {(lesson as any).assets && (lesson as any).assets.length > 0 ? (
                                                                        ((lesson as any).assets as any[]).map((asset: any) => (
                                                                            <div
                                                                                key={asset.id}
                                                                                className="flex items-center justify-between rounded-md border p-3"
                                                                            >
                                                                                <div>
                                                                                    <p className="font-medium">{asset.title}</p>
                                                                                    <p className="text-xs text-muted-foreground">{asset.type}</p>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <Button asChild size="sm" variant="outline">
                                                                                        <Link href={asset.url} target="_blank">
                                                                                            View
                                                                                        </Link>
                                                                                    </Button>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="text-destructive"
                                                                                        onClick={() => handleDeleteAsset(lesson.id, asset.id)}
                                                                                    >
                                                                                        Delete
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <p className="text-sm text-muted-foreground">No assets yet.</p>
                                                                    )}
                                                                </div>
                                                                <div className="space-y-4 rounded-md bg-muted/40 p-4">
                                                                    <h5 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                                                        Add asset
                                                                    </h5>
                                                                    <div className="grid gap-4 md:grid-cols-2">
                                                                        <div className="space-y-2">
                                                                            <Label>Title</Label>
                                                                            <Input
                                                                                value={formState.title}
                                                                                onChange={e => updateAssetForm(lesson.id, { title: e.target.value })}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label>Type</Label>
                                                                            <Select
                                                                                value={formState.type}
                                                                                onValueChange={value => updateAssetForm(lesson.id, { type: value })}
                                                                            >
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Select type" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {assetTypes.map(type => (
                                                                                        <SelectItem key={type.value} value={type.value}>
                                                                                            {type.label}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label>Description</Label>
                                                                        <Textarea
                                                                            rows={2}
                                                                            value={formState.description}
                                                                            onChange={e => updateAssetForm(lesson.id, { description: e.target.value })}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label>File</Label>
                                                                        <Input
                                                                            type="file"
                                                                            onChange={e =>
                                                                                updateAssetForm(lesson.id, {
                                                                                    file: e.target.files?.[0] || null,
                                                                                })
                                                                            }
                                                                        />
                                                                        <p className="text-xs text-muted-foreground">
                                                                            Upload videos, documents, slides, or other lesson materials.
                                                                        </p>
                                                                    </div>
                                                                    {formState.error && (
                                                                        <p className="text-sm text-destructive">{formState.error}</p>
                                                                    )}
                                                                    <Button
                                                                        type="button"
                                                                        onClick={() => handleAssetUpload(lesson.id)}
                                                                        disabled={formState.uploading}
                                                                    >
                                                                        {formState.uploading ? 'Uploading...' : 'Upload asset'}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </CardContent>
                                            </Card>
                                        ))
                                    ) : (
                                        <Alert>
                                            <AlertTitle>No chapters available</AlertTitle>
                                            <AlertDescription>
                                                Attach lessons to this course to enable lesson-level materials.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    )
}
