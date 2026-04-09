'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiClient } from '@/lib/api-client'
import type { Course, CourseLevel } from '@/types'
import Link from 'next/link'
import { Loader2, Video, FileText, AlertTriangle, Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CourseAIConfig } from '@/components/admin/course-ai-config'
import { CourseAIAssistantTemplate } from '@/components/admin/course-ai-assistant-template'
import { TranscriptUpload } from '@/components/admin/transcript-upload'
import { KnowledgeContextStatusCard } from '@/components/admin/knowledge-context-status'
import { ChunkPreview } from '@/components/admin/chunk-preview'
const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '')

const levels: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']

type LessonAssetDto = {
    id: string
    title: string
    description?: string | null
    type: string
    url: string
}

type AdminLesson = {
    id: string
    title: string
    description?: string | null
    assets?: LessonAssetDto[]
    durationMinutes?: number | null
    lessonType?: string | null
    learningObjectives?: string[]
    completionRule?: string | null
}

type AdminChapter = {
    id: string
    title: string
    description?: string | null
    lessons: AdminLesson[]
}

type LessonAttachment = {
    id: string
    title: string
    type: string
    url?: string
    mimeType?: string | null
    checked: boolean
}

type PendingLessonUpload = {
    id: string
    file: File
    type: string
    uploading: boolean
    error: string | null
}

type AdminCourse = Course & {
    slug?: string
    instructorId?: string
    status?: string
    chapters?: AdminChapter[]
}

const steps = [
    {
        id: 1,
        title: 'Course information',
        description: 'Basics, learning outcomes, publish rules',
    },
    {
        id: 2,
        title: 'Media & ownership',
        description: 'Thumbnail, category, level, tags',
    },
    {
        id: 3,
        title: 'Design the course & AI',
        description: 'Structure, assets, AI settings',
    },
]

const InfoHint = ({ text }: { text: string }) => (
    <span className="group relative inline-flex items-center">
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span
            role="tooltip"
            className="pointer-events-none absolute z-10 -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-pre rounded-md bg-popover px-2 py-1 text-xs text-foreground opacity-0 shadow-md ring-1 ring-border transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
            {text}
        </span>
    </span>
)

const formatStatusLabel = (value: string | null) => {
    if (!value) return 'Unknown'
    return value.charAt(0) + value.slice(1).toLowerCase()
}

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const searchParams = useSearchParams()
    const isSmeMode = searchParams.get('sme') === '1'

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
        completionExamId: '',
    autoCertificate: false,
})
const [activeStep, setActiveStep] = useState(1)
const [formDirty, setFormDirty] = useState(false)
    const titleRef = useRef<HTMLInputElement | null>(null)
    const slugRef = useRef<HTMLInputElement | null>(null)
    const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
    const categoryRef = useRef<HTMLInputElement | null>(null)
    const levelRef = useRef<HTMLButtonElement | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [instructors, setInstructors] = useState<Array<{ id: string; name: string }>>([])
    const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
    const [lessonForm, setLessonForm] = useState({
        title: '',
        description: '',
        durationMinutes: '',
        lessonType: 'VIDEO',
        learningObjectives: '',
        completionRule: 'VIEW_ASSETS',
    })
    const [chapterForm, setChapterForm] = useState({
        title: '',
        description: '',
    })
    const [chapterModalOpen, setChapterModalOpen] = useState(false)
    const [chapterSaving, setChapterSaving] = useState(false)
    const [chapterError, setChapterError] = useState<string | null>(null)
    const [lessonAttachments, setLessonAttachments] = useState<LessonAttachment[]>([])
    const [pendingLessonUploads, setPendingLessonUploads] = useState<PendingLessonUpload[]>([])
    const [defaultLessonAssetType, setDefaultLessonAssetType] = useState('DOCUMENT')
    const [lessonSaving, setLessonSaving] = useState(false)
    const [lessonError, setLessonError] = useState<string | null>(null)
    const [lessonModalOpen, setLessonModalOpen] = useState(false)
    const [lessonModalChapterId, setLessonModalChapterId] = useState<string | null>(null)
    const [statusDialogOpen, setStatusDialogOpen] = useState(false)
    const [statusDialogMessage, setStatusDialogMessage] = useState('')
    const [statusDialogFrom, setStatusDialogFrom] = useState<string | null>(null)
    const [statusDialogTo, setStatusDialogTo] = useState<string | null>(null)
    const confirmActionRef = useRef<null | (() => void)>(null)
    const [confirmDialog, setConfirmDialog] = useState({
        open: false,
        title: '',
        description: '',
        confirmLabel: 'Confirm',
        confirmVariant: 'default' as 'default' | 'destructive',
    })
    const [chunkPreviewOpen, setChunkPreviewOpen] = useState(false)
    const [transcriptRefreshKey, setTranscriptRefreshKey] = useState(0)
    const [vttPromptOpen, setVttPromptOpen] = useState(false)
    const [vttPromptVideoAssetId, setVttPromptVideoAssetId] = useState<string | null>(null)
    const [vttPromptLessonId, setVttPromptLessonId] = useState<string | null>(null)

    useEffect(() => {
        if (lessonModalOpen && selectedLessonId && lessonModalChapterId) {
            fetchLessonAssets(selectedLessonId, lessonModalChapterId)
        }
    }, [lessonModalOpen, selectedLessonId, lessonModalChapterId])

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
                    completionExamId: '',
                    autoCertificate: false,
                })
                setFormDirty(false)

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

    const handleChange = (field: string, value: any) => {
        setForm(prev => ({ ...prev, [field]: value as any }))
        setFormDirty(true)
    }

    const validateForm = (scope: number | 'all' = activeStep) => {
        const checks: Array<{
            keys: Array<keyof typeof form>
            message: string
            ref?: React.RefObject<HTMLElement>
            step: number
        }> = [
            { keys: ['title'], message: 'Title is required', ref: titleRef, step: 1 },
            { keys: ['slug'], message: 'Slug is required', ref: slugRef, step: 1 },
            { keys: ['description'], message: 'Description is required', ref: descriptionRef, step: 1 },
            { keys: ['category'], message: 'Category is required', ref: categoryRef, step: 2 },
            { keys: ['level'], message: 'Level is required', ref: levelRef, step: 2 },
        ]

        const stepsToCheck = scope === 'all' ? [1, 2] : [scope]

        for (const step of stepsToCheck) {
            for (const check of checks.filter(c => c.step === step)) {
                const isEmpty = check.keys.some(key => {
                    const value = (form as any)[key]
                    return !value || (typeof value === 'string' && value.trim().length === 0)
                })
                if (isEmpty) {
                    setError(check.message)
                    check.ref?.current?.focus()
                    setActiveStep(check.step)
                    return false
                }
            }
        }
        return true
    }

    const ensurePublishable = async () => {
        const validate = () => {
            const chapters = course?.chapters ?? []
            const lessonCount =
                course?.chapters?.reduce((sum, chapter) => sum + chapter.lessons.length, 0) ?? 0
            return chapters.length > 0 && lessonCount > 0
        }

        if (validate()) return true

        // Attempt to refresh latest structure before blocking publish
        await reloadCourse()
        if (validate()) return true

        setError('Add at least one chapter and one lesson before publishing.')
        setActiveStep(3)
        return false
    }

    const buildCoursePayload = () => ({
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
    })

    const saveCourseInfo = async (options?: { silent?: boolean; redirect?: boolean; validateStep?: number | 'all' }) => {
        const { silent, redirect, validateStep } = options || {}
        if (submitting) return false
        if (!validateForm(validateStep ?? activeStep)) return false

        const payload = buildCoursePayload()
        if (payload.status === 'PUBLISHED' && !(await ensurePublishable())) {
            return false
        }
        setSubmitting(true)
        if (!silent) {
            setError(null)
            setSuccess(null)
        }

        try {
            await ApiClient.updateCourse(id, payload)
            setCourse(prev =>
                prev
                    ? {
                        ...prev,
                        ...payload,
                        tags: payload.tags,
                        learningOutcomes: payload.learningOutcomes,
                        requirements: payload.requirements,
                        level: payload.level,
                        category: payload.category,
                        description: payload.description,
                        title: payload.title,
                        slug: payload.slug,
                        thumbnail: payload.thumbnail ?? '',
                        status: payload.status ?? prev.status,
                    }
                    : prev
            )
            if (!silent) {
                setSuccess('Course updated successfully')
            }
            setFormDirty(false)
            if (redirect) {
                setTimeout(() => router.push(isSmeMode ? '/sme/training-ops/courses' : '/admin/courses'), 300)
            }
            return true
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else if (typeof err === 'object' && err !== null && 'error' in err) {
                const apiError = err as { error?: { message?: string } }
                setError(apiError.error?.message || 'Failed to update course')
            } else {
                setError('Failed to update course')
            }
            return false
        } finally {
            setSubmitting(false)
        }
    }

    const hydrateLessonForm = (lesson: any, chapterId: string) => {
        setSelectedLessonId(lesson.id)
        setLessonForm({
            title: lesson.title || '',
            description: lesson.description || '',
            durationMinutes: lesson.durationMinutes?.toString?.() || '',
            lessonType: lesson.lessonType || 'VIDEO',
            learningObjectives: (lesson.learningObjectives || []).join('\n'),
            completionRule: lesson.completionRule || 'VIEW_ASSETS',
        })
        setLessonAttachments([])
        setPendingLessonUploads([])
        // Ensure chapterId is set before fetching assets
        setLessonModalChapterId(chapterId)
        fetchLessonAssets(lesson.id, chapterId)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await saveCourseInfo({ redirect: false })
    }

    const goToStep = async (targetStep: number) => {
        if (targetStep === activeStep) return
        if (targetStep > 1 && !course) return

        if (formDirty) {
            const saved = await saveCourseInfo({ silent: true, validateStep: activeStep })
            if (!saved) return
        }

        setActiveStep(targetStep)
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

    const assetTypeMap: Record<string, 'VIDEO' | 'DOCUMENT' | 'PRESENTATION' | 'TEXT' | 'AUDIO' | 'OTHER'> = {
        VIDEO: 'VIDEO',
        DOCUMENT: 'DOCUMENT',
        PRESENTATION: 'PRESENTATION',
        TEXT: 'TEXT',
        AUDIO: 'AUDIO',
        OTHER: 'OTHER',
    }

    const lessonTypes = [
        { value: 'VIDEO', label: 'Video' },
        { value: 'DOC', label: 'Document' },
        { value: 'QUIZ', label: 'Quiz' },
        { value: 'OTHER', label: 'Other' },
    ]

    const completionRules = [
        { value: 'VIEW_ASSETS', label: 'View assets' },
        { value: 'MANUAL', label: 'Manual completion' },
        { value: 'QUIZ', label: 'Pass quiz' },
    ]

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

    const getFileExtension = (value?: string | null) => {
        if (!value) return null
        const cleanValue = value.split('?')[0]?.split('#')[0] || value
        const dotIndex = cleanValue.lastIndexOf('.')
        if (dotIndex === -1 || dotIndex === cleanValue.length - 1) return null
        return cleanValue.slice(dotIndex + 1).toLowerCase()
    }

    const isVttFile = (file?: { name?: string; type?: string } | null) => {
        if (!file) return false
        const mimeType = (file.type || '').toLowerCase()
        if (mimeType.includes('vtt')) return true
        return getFileExtension(file.name || '') === 'vtt'
    }

    const isVttAsset = (asset?: { mimeType?: string | null; url?: string; title?: string } | null) => {
        if (!asset) return false
        const mimeType = (asset.mimeType || '').toLowerCase()
        if (mimeType.includes('vtt')) return true
        const urlExt = getFileExtension(asset.url || '')
        const titleExt = getFileExtension(asset.title || '')
        return urlExt === 'vtt' || titleExt === 'vtt'
    }

    const getAssetDisplayType = (asset: { type?: string; mimeType?: string | null; url?: string; title?: string }) => {
        if (isVttAsset(asset)) return 'VTT'
        return asset.type || asset.mimeType || 'Unknown'
    }

    // Auto-detect asset type from file
    const detectAssetType = (file: File): 'VIDEO' | 'DOCUMENT' | 'PRESENTATION' | 'TEXT' | 'AUDIO' | 'OTHER' => {
        const mimeType = file.type.toLowerCase()
        const extension = file.name.split('.').pop()?.toLowerCase()

        if (isVttFile(file)) {
            return 'TEXT'
        }

        // Video detection
        if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(extension || '')) {
            return 'VIDEO'
        }
        // Audio detection
        if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension || '')) {
            return 'AUDIO'
        }
        // Presentation detection
        if (['ppt', 'pptx', 'key', 'odp'].includes(extension || '') ||
            mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
            return 'PRESENTATION'
        }
        // Document detection
        if (['pdf', 'doc', 'docx', 'odt', 'rtf'].includes(extension || '') ||
            mimeType.includes('document') || mimeType === 'application/pdf') {
            return 'DOCUMENT'
        }
        // Text detection
        if (mimeType.startsWith('text/') || ['txt', 'md', 'markdown'].includes(extension || '')) {
            return 'TEXT'
        }

        return 'OTHER'
    }

    const handleLessonFilesSelected = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return
        const newItems: PendingLessonUpload[] = Array.from(fileList).map(file => ({
            id: generateTempId(),
            file,
            type: detectAssetType(file),  // Auto-detect type instead of using default
            uploading: false,
            error: null,
        }))
        setPendingLessonUploads(prev => [...prev, ...newItems])
    }

    const updatePendingLessonUpload = (uploadId: string, patch: Partial<Omit<PendingLessonUpload, 'id' | 'file'>>) => {
        setPendingLessonUploads(prev =>
            prev.map(upload => (upload.id === uploadId ? { ...upload, ...patch } : upload))
        )
    }

    const removePendingLessonUpload = (uploadId: string) => {
        setPendingLessonUploads(prev => prev.filter(upload => upload.id !== uploadId))
    }

    const apiUrl = (path: string) => (backendBaseUrl ? `${backendBaseUrl}${path}` : path)

    const fetchLessonAssets = async (lessonId: string, chapterId: string) => {
        if (!lessonId || !chapterId) return
        try {
            let attachments: LessonAttachment[] | null = null

            // 1) If external backend is configured, try its GET endpoint first (disabled in dev to avoid ERR_CONNECTION_REFUSED)
            if (backendBaseUrl && false) {
                try {
                    const path = apiUrl(`/api/admin/courses/${id}/chapters/${chapterId}/lessons/${lessonId}/assets`)
                    const res = await fetch(path, {
                        headers: {
                            'Content-Type': 'application/json',
                            ...getAuthHeaders(),
                        },
                    })
                    if (res.ok) {
                        const json = await res.json()
                        attachments = (json.data || []).map((asset: any) => ({
                            id: asset.id,
                            title: asset.title,
                            type: asset.type,
                            url: asset.cloudfrontUrl || asset.url,
                            mimeType: asset.mimeType || null,
                            checked: true,
                        }))
                    }
                } catch (_) {
                    // swallow and fallback to internal approach
                }
            }

            // 2) Fallback: load the course via internal API and extract the lesson's assets (no direct GET endpoint exists)
            if (!attachments) {
                const response = await ApiClient.getCourse(id)
                const rawCourse: any = response.data
                const chapter = (rawCourse?.chapters || []).find((ch: any) => ch.id === chapterId)
                const lesson = (chapter?.lessons || []).find((l: any) => l.id === lessonId)
                const assets = (lesson?.assets || []).map((a: any) => (a.courseAsset ? a.courseAsset : a))
                attachments = (assets || []).map((asset: any) => ({
                    id: asset.id,
                    title: asset.title,
                    type: asset.type,
                    url: asset.cloudfrontUrl ?? asset.url,
                    mimeType: asset.mimeType ?? asset.contentType ?? null,
                    checked: true,
                }))
            }

            setLessonAttachments(attachments || [])
            setCourse(prev => {
                if (!prev) return prev
                return {
                    ...prev,
                    chapters: (prev.chapters || []).map(ch => ({
                        ...ch,
                        lessons: (ch.lessons || []).map(l =>
                            l.id === lessonId ? { ...l, assets: (attachments || []) as any } : l
                        ),
                    })),
                }
            })
        } catch (err) {
            console.error(err)
        }
    };

const handleDeleteLessonAsset = async (assetId: string) => {
    if (!selectedLessonId || !lessonModalChapterId) return
    try {
            const deleteCandidates = [
                `/api/admin/courses/${id}/chapters/${lessonModalChapterId}/lessons/${selectedLessonId}/assets/${assetId}`,
                `/api/admin/lessons/${selectedLessonId}/assets/${assetId}`,
                apiUrl(`/api/admin/courses/${id}/chapters/${lessonModalChapterId}/lessons/${selectedLessonId}/assets/${assetId}`),
                apiUrl(`/api/admin/lessons/${selectedLessonId}/assets/${assetId}`),
            ]
            let json: any = null
            let lastErr: any = null
            for (const path of deleteCandidates) {
                try {
                    const res = await fetch(path, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            ...getAuthHeaders(),
                        },
                    })
                    if (!res.ok) throw new Error(`HTTP ${res.status}`)
                    json = await res.json()
                    break
                } catch (e) {
                    lastErr = e
                    continue
                }
            }
            if (!json) {
                console.error('Failed to delete asset from all candidates', lastErr)
                return
            }
        const attachments: LessonAttachment[] = (json.data || []).map((asset: any) => ({
            id: asset.id,
            title: asset.title,
            type: asset.type,
            url: asset.cloudfrontUrl || asset.url,
            mimeType: asset.mimeType || null,
            checked: true,
        }))
        setLessonAttachments(attachments)
        setCourse(prev => {
            if (!prev) return prev
            return {
                ...prev,
                chapters: (prev.chapters || []).map(ch => ({
                    ...ch,
                    lessons: (ch.lessons || []).map(l =>
                        l.id === selectedLessonId ? { ...l, assets: attachments as any } : l
                    ),
                })),
            }
        })
    } catch (err) {
        console.error(err)
    }
};

    const handleCourseAssetDelete = (assetId: string) => {
        confirmActionRef.current = async () => {
            try {
                const res = await fetch(apiUrl(`/api/admin/lessons/${selectedLessonId}/assets/${assetId}`), {
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
                setError(err instanceof Error ? err.message : 'Failed to delete asset')
            }
        }

        setConfirmDialog({
            open: true,
            title: 'Delete course material?',
            description: 'This action cannot be undone.',
            confirmLabel: 'Delete',
            confirmVariant: 'destructive',
        })
    };

    const openChapterModal = () => {
        setChapterForm({ title: '', description: '' })
        setChapterError(null)
        setChapterModalOpen(true)
    }

    const closeChapterModal = () => {
        setChapterModalOpen(false)
        setChapterError(null)
    }

    const handleAddChapter = () => {
        openChapterModal()
    };

    const handleSaveChapter = async () => {
        const title = chapterForm.title.trim()
        if (!title) {
            setChapterError('Title is required')
            return
        }
        setChapterSaving(true)
        setChapterError(null)
        try {
            const description = chapterForm.description.trim()
            await ApiClient.createChapter(id, { title, description: description || undefined })
            await reloadCourse()
            setChapterModalOpen(false)
        } catch (err) {
            setChapterError(err instanceof Error ? err.message : 'Failed to create chapter')
        } finally {
            setChapterSaving(false)
        }
    };

    const handleRenameChapter = async (chapterId: string, currentTitle: string) => {
        const title = window.prompt('Rename chapter', currentTitle)
        if (!title) return
        await ApiClient.updateChapter(id, chapterId, { title })
        await reloadCourse()
    };

    const handleDeleteChapter = (chapterId: string) => {
        confirmActionRef.current = async () => {
            setError(null)
            try {
                await ApiClient.deleteChapter(id, chapterId)
                await reloadCourse()
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete chapter')
            }
        }
        setConfirmDialog({
            open: true,
            title: 'Delete chapter?',
            description: 'This will also delete all lessons in this chapter.',
            confirmLabel: 'Delete',
            confirmVariant: 'destructive',
        })
    };

    const handleAddLesson = (chapterId: string) => {
        openLessonModal(chapterId)
    };

    const handleDeleteLesson = (chapterId: string, lessonId: string) => {
        confirmActionRef.current = async () => {
            setError(null)
            try {
                await ApiClient.deleteLesson(id, chapterId, lessonId)
                if (selectedLessonId === lessonId) {
                    setSelectedLessonId(null)
                }
                await reloadCourse()
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete lesson')
            }
        }
        setConfirmDialog({
            open: true,
            title: 'Delete lesson?',
            description: 'This action cannot be undone.',
            confirmLabel: 'Delete',
            confirmVariant: 'destructive',
        })
    };

    const handleMoveChapter = async (chapterId: string, direction: 'up' | 'down') => {
        if (!course?.chapters) return
        const order = [...course.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const idx = order.findIndex(c => c.id === chapterId)
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= order.length) return
        const tmp = order[idx]
        order[idx] = order[swapIdx]
        order[swapIdx] = tmp
        await ApiClient.reorderChapters(id, order.map(c => c.id))
        await reloadCourse()
    };

    const handleMoveLesson = async (chapterId: string, lessonId: string, direction: 'up' | 'down') => {
        const chapter = course?.chapters?.find(c => c.id === chapterId)
        if (!chapter) return
        const lessons = [...(chapter.lessons || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const idx = lessons.findIndex(l => l.id === lessonId)
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= lessons.length) return
        const tmp = lessons[idx]
        lessons[idx] = lessons[swapIdx]
        lessons[swapIdx] = tmp
        await ApiClient.reorderLessons(id, chapterId, lessons.map(l => l.id))
        await reloadCourse()
    };

    const handleLessonSelect = (lesson: any, chapterId: string) => {
        hydrateLessonForm(lesson, chapterId)
        setLessonModalOpen(true)
    };

    const openLessonModal = (chapterId: string) => {
        setLessonModalChapterId(chapterId)
        setSelectedLessonId(null)
        setLessonForm({
            title: '',
            description: '',
            durationMinutes: '',
            lessonType: 'VIDEO',
            learningObjectives: '',
            completionRule: 'VIEW_ASSETS',
        })
        setLessonAttachments([])
        setPendingLessonUploads([])
        setLessonError(null)
        setLessonModalOpen(true)
    };

    const closeLessonModal = () => {
        setLessonModalOpen(false)
        setLessonModalChapterId(null)
        setLessonError(null)
    };

    const handleLessonFieldChange = (field: string, value: string) => {
        setLessonForm(prev => ({ ...prev, [field]: value }))
    };

    const handleToggleAsset = (assetId: string, checked: boolean) => {
        setLessonAttachments(prev => prev.map(att => att.id === assetId ? { ...att, checked } : att))
    };

    const handleSaveLesson = async () => {
        const chapterId = lessonModalChapterId
        if (!chapterId) {
            setLessonError('Select a chapter')
            return
        }
        setLessonSaving(true)
        setLessonError(null)
        try {
            const payload = {
                title: lessonForm.title,
                description: lessonForm.description,
                durationMinutes: lessonForm.durationMinutes ? Number(lessonForm.durationMinutes) : undefined,
                lessonType: lessonForm.lessonType as any,
                learningObjectives: lessonForm.learningObjectives
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean),
                completionRule: lessonForm.completionRule as any,
            }

            const normalizeLesson = (lesson: any): AdminLesson => ({
                ...lesson,
                assets:
                    (lesson.assets || []).map((a: any) => {
                        const asset = a.courseAsset ? a.courseAsset : a
                        return {
                            id: asset.id,
                            title: asset.title,
                            description: asset.description ?? null,
                            type: asset.type,
                            url: asset.cloudfrontUrl ?? asset.url,
                            contentType: asset.mimeType ?? asset.contentType ?? null,
                        }
                    }) ?? [],
            })

            const updateCourseState = (lesson: AdminLesson, chapId: string) => {
                setCourse(prev => {
                    if (!prev) return prev
                    return {
                        ...prev,
                        chapters: (prev.chapters || []).map(ch =>
                            ch.id === chapId
                                ? {
                                    ...ch,
                                    lessons: (ch.lessons || []).map(l =>
                                        l.id === lesson.id ? lesson : l
                                    ),
                                }
                                : ch
                        ),
                    } as any
                })
            }

            const insertCourseState = (lesson: AdminLesson, chapId: string) => {
                setCourse(prev => {
                    if (!prev) return prev
                    return {
                        ...prev,
                        chapters: (prev.chapters || []).map(ch =>
                            ch.id === chapId
                                ? {
                                    ...ch,
                                    lessons: [...(ch.lessons || []), lesson],
                                }
                                : ch
                        ),
                    } as any
                })
            }

            let lessonId = selectedLessonId
            let lessonResponse: any = null
            if (lessonId) {
                lessonResponse = await ApiClient.updateLesson(id, chapterId, lessonId, payload)
            } else {
                lessonResponse = await ApiClient.createLesson(id, chapterId, payload)
                lessonId = (lessonResponse as any).data.id
                setSelectedLessonId(lessonId)
            }

            // Upload pending files now that lessonId is guaranteed
            const newAssetIds: string[] = []
            let uploadedVideoAssetId: string | null = null  // Track if video was uploaded
            for (const upload of pendingLessonUploads) {
                updatePendingLessonUpload(upload.id, { uploading: true, error: null })
                try {
                    const uploadType = isVttFile(upload.file) ? 'TEXT' : (assetTypeMap[upload.type] || 'DOCUMENT')
                    const uploadMeta: any = await ApiClient.uploadLessonAsset(id, chapterId, lessonId!, {
                        filename: upload.file.name,
                        contentType: upload.file.type || 'application/octet-stream',
                        type: uploadType,
                    })

                    const s3PutResponse = await fetch(uploadMeta.data.uploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': upload.file.type || 'application/octet-stream',
                            'x-amz-server-side-encryption': 'AES256',
                        },
                        body: upload.file,
                    })
                    if (!s3PutResponse.ok) {
                        const bodyText = await s3PutResponse.text().catch(() => '')
                        throw new Error(
                            `S3 upload failed (${s3PutResponse.status} ${s3PutResponse.statusText})${bodyText ? `: ${bodyText.slice(0, 500)}` : ''
                            }`
                        )
                    }

                    const asset = uploadMeta.data.asset
                    newAssetIds.push(asset.id)

                    // Track if this is a video upload
                    if (asset.type === 'VIDEO') {
                        uploadedVideoAssetId = asset.id
                    }

                    setLessonAttachments(prev => [
                        ...prev,
                        {
                            id: asset.id,
                            title: asset.title || upload.file.name,
                            type: asset.type,
                            url: asset.url,
                            mimeType: asset.mimeType,
                            checked: true,
                        },
                    ])
                    setPendingLessonUploads(prev => prev.filter(item => item.id !== upload.id))
                } catch (err) {
                    console.error(err)
                    const message = err instanceof Error ? err.message : 'Failed to upload asset'
                    updatePendingLessonUpload(upload.id, { uploading: false, error: message })
                    throw err
                }
            }

            const existingChecked = lessonAttachments.filter(att => att.checked).map(att => att.id)
            const finalAssetIds = Array.from(new Set([...existingChecked, ...newAssetIds]))

            await ApiClient.replaceLessonAssets(id, chapterId, lessonId!, finalAssetIds)

            const normalizedLesson = lessonResponse?.data ? normalizeLesson(lessonResponse.data) : null
            if (normalizedLesson) {
                if (selectedLessonId) {
                    updateCourseState(normalizedLesson, chapterId)
                } else {
                    insertCourseState(normalizedLesson, chapterId)
                }
            }

            await reloadCourse()

            // If a video was uploaded, show VTT prompt modal
            if (uploadedVideoAssetId && lessonId) {
                setVttPromptVideoAssetId(uploadedVideoAssetId)
                setVttPromptLessonId(lessonId)
                setLessonModalOpen(false)
                setVttPromptOpen(true)
            } else {
                setLessonModalOpen(false)
            }
        } catch (err) {
            console.error(err)
            setLessonError(err instanceof Error ? err.message : 'Failed to save lesson')
        } finally {
            setLessonSaving(false)
        }
    };

    const reloadCourse = async () => {
        try {
            const response = await ApiClient.getCourse(id)
            const rawCourse = response.data as any

            // Normalize lesson assets to ensure consistent data structure
            if (rawCourse.chapters) {
                rawCourse.chapters = rawCourse.chapters.map((chapter: any) => ({
                    ...chapter,
                    lessons: (chapter.lessons || []).map((lesson: any) => {
                        const normalizedLesson: AdminLesson = {
                            id: lesson.id,
                            title: lesson.title,
                            description: lesson.description,
                            durationMinutes: lesson.durationMinutes,
                            lessonType: lesson.lessonType,
                            learningObjectives: lesson.learningObjectives,
                            completionRule: lesson.completionRule,
                            assets: (lesson.assets || []).map((a: any) => {
                                const asset = a.courseAsset ? a.courseAsset : a
                                return {
                                    id: asset.id,
                                    title: asset.title,
                                    description: asset.description ?? null,
                                    type: asset.type,
                                    url: asset.cloudfrontUrl ?? asset.url,
                                    contentType: asset.mimeType ?? asset.contentType ?? null,
                                }
                            })
                        }
                        return normalizedLesson
                    })
                }))
            }

            setCourse(rawCourse)
        } catch (err) {
            console.error(err)
        }
    };

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
    const levelLabel = (course?.level ?? form.level ?? 'BEGINNER') as CourseLevel
    const categoryLabel = course?.category ?? (form.category || 'Uncategorized')
    const instructorName =
        instructors.find(instr => instr.id === form.instructorId)?.name ||
        course?.instructor?.name ||
        'Unassigned'
    const currentStatus = course?.status || form.status
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
                <div className="space-y-2">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between pb-3">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Course #{course?.id ?? id}</p>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-3xl font-semibold tracking-tight">Edit Course</h1>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Update catalog details, media, and supporting materials for learners.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                            <Button asChild variant="ghost" size="sm">
                                <Link href={isSmeMode ? '/sme/training-ops/courses' : '/admin/courses'}>Back to courses</Link>
                            </Button>
                            {course?.slug && (
                                <Button asChild variant="outline" size="sm">
                                    <Link
                                        href={
                                            isSmeMode || course.status !== 'PUBLISHED'
                                                ? `/sme/training-ops/courses/${course.id}`
                                                : `/courses/${course.slug}`
                                        }
                                        target={isSmeMode || course.status !== 'PUBLISHED' ? undefined : '_blank'}
                                    >
                                        {isSmeMode || course.status !== 'PUBLISHED' ? 'Open course overview' : 'Preview course'}
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
                    <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="flex flex-wrap items-center gap-3 py-3">
                            <div className="flex items-center gap-2">
                                <p className="text-sm uppercase tracking-wider text-primary font-semibold">Course status</p>
                                <p className="text-xs text-muted-foreground">Control visibility</p>
                            </div>
                            <div className="flex flex-1 items-center justify-between gap-3">
                                <Select
                                    value={form.status}
                                    onValueChange={(value) => handleChange('status', value)}
                                >
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DRAFT" disabled={currentStatus === 'DRAFT'}>Draft</SelectItem>
                                        <SelectItem value="PUBLISHED" disabled={currentStatus === 'PUBLISHED'}>Published</SelectItem>
                                        <SelectItem value="ARCHIVED" disabled={currentStatus === 'ARCHIVED'}>Archived</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    disabled={submitting}
                                    onClick={async () => {
                                        const prev = course?.status || form.status
                                        const payloadStatus = form.status
                                        const saved = await saveCourseInfo({ silent: false, validateStep: 'all' })
                                        if (saved) {
                                            if (payloadStatus === 'PUBLISHED') {
                                                setStatusDialogMessage('Course published')
                                            } else if (payloadStatus === 'DRAFT') {
                                                setStatusDialogMessage('Course set to Draft')
                                            } else if (payloadStatus === 'ARCHIVED') {
                                                setStatusDialogMessage('Course archived')
                                            }
                                            setStatusDialogFrom(prev)
                                            setStatusDialogTo(payloadStatus)
                                            setStatusDialogOpen(true)
                                        } else {
                                            handleChange('status', prev)
                                        }
                                    }}
                                >
                                    {submitting ? 'Saving…' : 'Apply status'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                {(error) && (
                    <div className="space-y-3">
                        {error && (
                            <Alert variant="destructive">
                                <AlertTitle>Something went wrong</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                <Card className="mt-4 border-primary/20 bg-primary/5">
                    <CardContent className="space-y-5 pt-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm uppercase tracking-wider text-primary font-semibold">Course setup</p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-primary-foreground/90" />
                                Step {activeStep} of {steps.length}
                            </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {steps.map(step => {
                                const isCurrent = activeStep === step.id
                                const isDone = activeStep > step.id
                                return (
                                    <button
                                        key={step.id}
                                        onClick={() => goToStep(step.id)}
                                        disabled={submitting || (step.id > 1 && !course)}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition hover:border-primary/50',
                                            isCurrent
                                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                                : isDone
                                                    ? 'border-primary/50 bg-primary/10 text-primary'
                                                    : 'border-border bg-card text-foreground hover:bg-accent'
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                                                isCurrent
                                                    ? 'bg-primary-foreground/20 text-primary-foreground'
                                                    : isDone
                                                        ? 'bg-primary/20 text-primary'
                                                        : 'bg-muted text-muted-foreground'
                                            )}
                                        >
                                            {isDone ? <Check className="h-4 w-4" /> : step.id}
                                        </div>
                                        <div className="flex-1">
                                            <p className={cn('text-sm font-semibold', isCurrent ? 'text-primary-foreground' : undefined)}>
                                                {step.title}
                                            </p>
                                            <p className={cn('text-xs text-muted-foreground', isCurrent ? 'text-primary-foreground/80' : undefined)}>
                                                {step.description}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        <Progress value={(activeStep / steps.length) * 100} className="h-2" />
                    </CardContent>
                </Card>

                {activeStep === 1 && (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                    <Card className="h-full">
                        <CardHeader className="pb-4">
                            <CardTitle>Step 1: Course information</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Provide the core course details learners will see in the catalog.
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
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="title">Title</Label>
                                                <InfoHint text="Course name shown to learners." />
                                            </div>
                                            <Input
                                                id="title"
                                                value={form.title}
                                                onChange={e => handleChange('title', e.target.value)}
                                                required
                                                ref={titleRef}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="slug">Slug</Label>
                                                <InfoHint text="Used in the course URL; lowercase, hyphenated is recommended." />
                                            </div>
                                            <Input
                                                id="slug"
                                                value={form.slug}
                                                onChange={e => handleChange('slug', e.target.value)}
                                                required
                                                ref={slugRef}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="description">Description</Label>
                                            <InfoHint text="Short summary learners see on the course page." />
                                        </div>
                                        <Textarea
                                            id="description"
                                            rows={4}
                                            value={form.description}
                                            onChange={e => handleChange('description', e.target.value)}
                                            required
                                            ref={descriptionRef}
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
                                    <div className="border rounded-lg p-4 space-y-3">
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Publish</p>
                                        <p className="text-sm font-semibold">Publish settings</p>
                                        <p className="text-xs text-muted-foreground">
                                            Set completion conditions, certificate rules, and publish status.
                                        </p>
                                        <div>
                                            <p className="text-sm font-semibold">Completion & Certificate</p>
                                            <p className="text-xs text-muted-foreground">
                                                Set how learners complete the course and whether to auto-issue certificates.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="completionExamId">Completion condition (exam ID or name)</Label>
                                            <Input
                                                id="completionExamId"
                                                placeholder="e.g., exam-media-quality"
                                                value={form.completionExamId}
                                                onChange={e => handleChange('completionExamId', e.target.value)}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Learners must pass this exam to complete the course.
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium">Auto-issue certificate</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Issue a certificate to the learner account after passing the exam.
                                                </p>
                                            </div>
                                            <Input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked={form.autoCertificate}
                                                onChange={e => handleChange('autoCertificate', e.target.checked)}
                                            />
                                        </div>
                                    </div>
                                </section>

                                <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-end">
                                    <Button type="button" variant="outline" asChild>
                                        <Link href="/admin/courses">Cancel</Link>
                                    </Button>
                                    <Button type="button" disabled={submitting} onClick={() => goToStep(2)}>
                                        {submitting ? 'Saving…' : 'Go to Step 2'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={submitting}
                                        onClick={async () => {
                                            await saveCourseInfo({ redirect: true, validateStep: 'all' })
                                        }}
                                    >
                                        {submitting ? 'Saving…' : 'Save changes & Exit'}
                                    </Button>
                                    <Button type="submit" className="hidden" disabled={submitting}>
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

                        {/* Instructor & workflow removed per new flow */}
                    </div>
                </div>
                )}

                {activeStep === 2 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Step 2: Media & ownership</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Provide visuals and metadata so learners can find and trust the course.
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="thumbnail">Thumbnail URL</Label>
                                        <InfoHint text="Optional image for course cards; use a 16:9 link." />
                                    </div>
                                    <Input
                                        id="thumbnail"
                                        value={form.thumbnail}
                                        onChange={e => handleChange('thumbnail', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="category">Category</Label>
                                        <InfoHint text="Helps learners filter the catalog." />
                                    </div>
                                    <Input
                                        id="category"
                                        value={form.category}
                                        onChange={e => handleChange('category', e.target.value)}
                                        required
                                        ref={categoryRef}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Label>Level</Label>
                                        <InfoHint text="Difficulty level visible to learners." />
                                    </div>
                                    <Select value={form.level} onValueChange={value => handleChange('level', value)}>
                                        <SelectTrigger ref={levelRef}>
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
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="tags">Tags</Label>
                                    <InfoHint text="Comma-separated keywords for search." />
                                </div>
                                <Input
                                    id="tags"
                                    value={form.tags}
                                    onChange={e => handleChange('tags', e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Comma-separated keywords that power search, e.g. security, fundamentals.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-end">
                                <Button type="button" variant="outline" onClick={() => goToStep(1)} disabled={submitting}>
                                    Back to Step 1
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={async () => {
                                        const saved = await saveCourseInfo({ silent: false, validateStep: 2 })
                                        if (saved) router.push(isSmeMode ? '/sme/training-ops/courses' : '/admin/courses')
                                    }}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Saving…' : 'Save changes & Exit'}
                                </Button>
                                <Button type="button" onClick={() => goToStep(3)} disabled={submitting}>
                                    Go to Step 3
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {course && activeStep === 3 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Step 3: Design the course</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Build chapters and lessons, then attach lesson-specific materials.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-semibold">Course structure</p>
                                            <p className="text-sm text-muted-foreground">
                                                Chapters contain lessons; lessons own their attached files.
                                            </p>
                                        </div>
                                        <Button size="sm" onClick={handleAddChapter}>
                                            Add chapter
                                        </Button>
                                    </div>

                                    <div className="space-y-3">
                                        {course.chapters && course.chapters.length > 0 ? (
                                            course.chapters
                                                .slice()
                                                .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
                                                .map(chapter => (
                                                    <div key={chapter.id} className="rounded-lg border p-3 space-y-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <p className="font-semibold">{chapter.title}</p>
                                                                {chapter.description && (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {chapter.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <Button variant="ghost" size="sm" onClick={() => handleMoveChapter(chapter.id, 'up')}>
                                                                    ↑
                                                                </Button>
                                                                <Button variant="ghost" size="sm" onClick={() => handleMoveChapter(chapter.id, 'down')}>
                                                                    ↓
                                                                </Button>
                                                                <Button variant="ghost" size="sm" onClick={() => handleRenameChapter(chapter.id, chapter.title)}>
                                                                    Rename
                                                                </Button>
                                                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteChapter(chapter.id)}>
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {chapter.lessons && chapter.lessons.length > 0 ? (
                                                                chapter.lessons
                                                                    .slice()
                                                                    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
                                                                    .map(lesson => (
                                                                        <div key={lesson.id} className="space-y-2">
                                                                            <div
                                                                                className={`flex items-center justify-between rounded-md border p-2 text-sm cursor-pointer ${selectedLessonId === lesson.id ? 'border-primary bg-primary/5' : ''}`}
                                                                                onClick={() => handleLessonSelect(lesson as any, chapter.id)}
                                                                            >
                                                                                <div className="flex-1 space-y-1">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <p className="font-medium">{lesson.title}</p>
                                                                                        {lesson.assets && lesson.assets.length > 0 && (
                                                                                            <Badge variant="secondary" className="text-xs">
                                                                                                {lesson.assets.length} {lesson.assets.length === 1 ? 'file' : 'files'}
                                                                                            </Badge>
                                                                                        )}
                                                                                    </div>
                                                                                    <p className="text-xs text-muted-foreground">
                                                                                        {(lesson.lessonType as string) || 'Lesson'} ·{' '}
                                                                                        {lesson.durationMinutes ? `${lesson.durationMinutes} min` : 'No duration'}
                                                                                    </p>
                                                                                </div>
                                                                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                                                    <Button variant="ghost" size="sm" onClick={() => handleMoveLesson(chapter.id, lesson.id, 'up')}>
                                                                                        ↑
                                                                                    </Button>
                                                                                    <Button variant="ghost" size="sm" onClick={() => handleMoveLesson(chapter.id, lesson.id, 'down')}>
                                                                                        ↓
                                                                                    </Button>
                                                                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteLesson(chapter.id, lesson.id)}>
                                                                                        Delete
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                            {(() => {
                                                                                const displayAssets =
                                                                                    selectedLessonId === lesson.id
                                                                                        ? lessonAttachments
                                                                                        : (lesson.assets as any[]) || []
                                                                                return displayAssets && displayAssets.length > 0
                                                                            })() && (
                                                                                <div className="ml-4 pl-3 border-l-2 border-muted space-y-1.5">
                                                                                    <p className="text-xs font-medium text-muted-foreground">Attached materials:</p>
                                                                                    {(selectedLessonId === lesson.id
                                                                                        ? lessonAttachments
                                                                                        : (lesson.assets as any[]) || []
                                                                                    ).map((asset: any, idx: number) => (
                                                                                        <div key={`${asset.id}-${idx}`} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5">
                                                                                            <div className="flex-1 min-w-0">
                                                                                                <p className="text-xs font-medium truncate">{asset.title}</p>
                                                                                                <p className="text-xs text-muted-foreground truncate">
                                                                                                    {getAssetDisplayType(asset)}
                                                                                                </p>
                                                                                            </div>
                                                                                            {asset.url && (
                                                                                                <Button asChild size="sm" variant="ghost" className="h-6 text-xs">
                                                                                                    <Link href={asset.url} target="_blank" onClick={e => e.stopPropagation()}>
                                                                                                        View
                                                                                                    </Link>
                                                                                                </Button>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))
                                                            ) : (
                                                                <p className="text-xs text-muted-foreground">No lessons yet.</p>
                                                            )}
                                                            <Button variant="outline" size="sm" onClick={() => handleAddLesson(chapter.id)}>
                                                                Add lesson
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))
                                        ) : (
                                            <Alert>
                                                <AlertTitle>No chapters</AlertTitle>
                                                <AlertDescription>Add chapters to start structuring the course.</AlertDescription>
                                            </Alert>
                                        )}
                                    </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {course && activeStep === 3 && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>AI Learning Assistant Configuration</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Fine-tune prompts, model selection, and context used by the course assistant.
                                </p>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-6">
                                    <CourseAIConfig courseId={id} />
                                    <CourseAIAssistantTemplate courseId={id} canManageTemplates={!isSmeMode} />
                                </div>
                            </CardContent>
                        </Card>
                        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => goToStep(2)} disabled={submitting}>
                                Back to Step 2
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={async () => {
                                    const saved = await saveCourseInfo({ silent: false, validateStep: 'all' })
                                    if (saved) router.push(isSmeMode ? '/sme/training-ops/courses' : '/admin/courses')
                                }}
                                disabled={submitting}
                            >
                                {submitting ? 'Saving…' : 'Save changes & Exit'}
                            </Button>
                        </div>
                    </>
                )}

                <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Status updated</DialogTitle>
                            <DialogDescription className="sr-only">
                                Course status has been updated.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="text-sm text-foreground">
                            <span>{statusDialogMessage}</span>
                            {statusDialogFrom && (
                                <>
                                    <span> (</span>
                                    <span className="line-through text-muted-foreground">{formatStatusLabel(statusDialogFrom)}</span>
                                    <span>)</span>
                                </>
                            )}
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" onClick={() => setStatusDialogOpen(false)}>
                                OK
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ConfirmDialog
                    open={confirmDialog.open}
                    onOpenChange={(open) => {
                        setConfirmDialog(prev => ({ ...prev, open }))
                        if (!open) confirmActionRef.current = null
                    }}
                    title={confirmDialog.title}
                    description={confirmDialog.description}
                    confirmLabel={confirmDialog.confirmLabel}
                    confirmVariant={confirmDialog.confirmVariant}
                    onConfirm={() => {
                        const action = confirmActionRef.current
                        setConfirmDialog(prev => ({ ...prev, open: false }))
                        confirmActionRef.current = null
                        if (action) action()
                    }}
                />

                <Dialog open={chapterModalOpen} onOpenChange={(open) => (open ? openChapterModal() : closeChapterModal())}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create chapter</DialogTitle>
                            <DialogDescription className="sr-only">
                                Create a chapter and optionally add a description for learners.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Title</Label>
                                <Input
                                    value={chapterForm.title}
                                    onChange={(e) => setChapterForm(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Chapter title"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Description (optional)</Label>
                                <Textarea
                                    value={chapterForm.description}
                                    onChange={(e) => setChapterForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Describe what this chapter covers"
                                    rows={3}
                                />
                            </div>
                            {chapterError && (
                                <Alert variant="destructive">
                                    <AlertTitle>Unable to create chapter</AlertTitle>
                                    <AlertDescription>{chapterError}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={closeChapterModal} disabled={chapterSaving}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleSaveChapter} disabled={chapterSaving}>
                                {chapterSaving ? 'Creating…' : 'Create chapter'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={lessonModalOpen} onOpenChange={setLessonModalOpen}>
                    <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{selectedLessonId ? 'Edit lesson' : 'Create lesson'}</DialogTitle>
                    <DialogDescription className="sr-only">
                        Edit lesson details, upload files, and choose which attachments remain linked to this lesson.
                    </DialogDescription>
                </DialogHeader>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3">
                                <Label>Title</Label>
                                <Input
                                    value={lessonForm.title}
                                    onChange={e => handleLessonFieldChange('title', e.target.value)}
                                />
                                <Label>Description</Label>
                                <Textarea
                                    rows={3}
                                    value={lessonForm.description}
                                    onChange={e => handleLessonFieldChange('description', e.target.value)}
                                />
                                <Label>Learning objectives</Label>
                                <Textarea
                                    rows={3}
                                    placeholder="One per line"
                                    value={lessonForm.learningObjectives}
                                    onChange={e => handleLessonFieldChange('learningObjectives', e.target.value)}
                                />
                            </div>
                            <div className="space-y-3">
                                <Label>Duration (minutes)</Label>
                                <Input
                                    type="number"
                                    value={lessonForm.durationMinutes}
                                    onChange={e => handleLessonFieldChange('durationMinutes', e.target.value)}
                                />
                                <Label>Lesson type</Label>
                                <Select
                                    value={lessonForm.lessonType}
                                    onValueChange={value => handleLessonFieldChange('lessonType', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {lessonTypes.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Label>Completion rule</Label>
                                <Select
                                    value={lessonForm.completionRule}
                                    onValueChange={value => handleLessonFieldChange('completionRule', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select rule" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {completionRules.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-sm font-semibold">Attach assets</p>
                            <div className="space-y-2">
                                <Label>Default type</Label>
                                <Select
                                    value={defaultLessonAssetType}
                                    onValueChange={value => setDefaultLessonAssetType(value)}
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
                            <div className="space-y-2">
                                <Label>Upload files</Label>
                                <Input
                                    type="file"
                                    multiple
                                    onChange={e => {
                                        handleLessonFilesSelected(e.target.files)
                                        if (e.target) e.target.value = ''
                                    }}
                                />
                                {pendingLessonUploads.length > 0 && (
                                    <div className="space-y-3 rounded-md border p-3">
                                        {pendingLessonUploads.map(upload => (
                                            <div key={upload.id} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-medium">{upload.file.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {formatFileSize(upload.file.size)} · {upload.file.type || 'unknown'}
                                                        </p>
                                                    </div>
                                                    <Button variant="ghost" size="sm" onClick={() => removePendingLessonUpload(upload.id)}>
                                                        Remove
                                                    </Button>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label>Type</Label>
                                                    <Select
                                                        value={upload.type}
                                                        onValueChange={value => updatePendingLessonUpload(upload.id, { type: value })}
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
                                                {upload.error && <p className="text-sm text-destructive">{upload.error}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">Attached files</p>
                                    <p className="text-xs text-muted-foreground">
                                        Uncheck to detach on save.
                                    </p>
                                </div>
                                {lessonAttachments.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No files attached.</p>
                                ) : (
                                    <div className="space-y-2 max-h-56 overflow-y-auto rounded-md border p-2">
                                        {lessonAttachments.map((asset, index) => (
                                            <div
                                                key={`${asset.id}-${index}`}
                                                className="flex items-center gap-3 rounded-md bg-muted/50 p-2"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4"
                                                    checked={asset.checked}
                                                    onChange={(e) => handleToggleAsset(asset.id, e.target.checked)}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {asset.title || `Asset ${asset.id.slice(0, 8)}...`}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {getAssetDisplayType(asset)}
                                                    </p>
                                                </div>
                                                {asset.url && (
                                                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                                                        <Link href={asset.url} target="_blank" onClick={e => e.stopPropagation()}>
                                                            View
                                                        </Link>
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs text-destructive"
                                                    onClick={() => handleDeleteLessonAsset(asset.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <>
                        {/* Transcript & AI Knowledge Base Section */}
                        {(() => {
                            // Find the first VIDEO asset for this lesson (saved assets)
                            const videoAsset = lessonAttachments.find(
                                asset => asset.type === 'VIDEO' && !isVttAsset(asset)
                            )
                            // Check for pending video uploads
                            const pendingVideoUpload = pendingLessonUploads.find(
                                upload => upload.type === 'VIDEO' && !isVttFile(upload.file)
                            )

                            return (
                                <div className="space-y-4 border-t pt-4">
                                    <div>
                                        <p className="text-sm font-semibold">AI Knowledge Base</p>
                                        <p className="text-xs text-muted-foreground">
                                            Upload VTT transcripts to enable AI-powered Q&A with source citations
                                        </p>
                                    </div>

                                    {pendingVideoUpload ? (
                                        // Video is pending upload - will prompt for VTT after save
                                        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4">
                                            <div className="flex items-center gap-2">
                                                <Video className="h-5 w-5 text-blue-600" />
                                                <div>
                                                    <p className="text-sm font-medium text-blue-900">
                                                        Video pending upload: {pendingVideoUpload.file.name}
                                                    </p>
                                                    <p className="text-xs text-blue-700">
                                                        After saving, you&apos;ll be prompted to upload a VTT transcript file for AI-powered Q&A
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : !videoAsset ? (
                                        <div className="rounded-lg border border-dashed p-4 text-center">
                                            <p className="text-sm text-muted-foreground">
                                                Add a video asset to this lesson first to enable transcript upload
                                            </p>
                                        </div>
                                    ) : selectedLessonId ? (
                                        <div className="space-y-4">
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <TranscriptUpload
                                                    key={`upload-${transcriptRefreshKey}`}
                                                    lessonId={selectedLessonId}
                                                    videoAssetId={videoAsset.id}
                                                    onUploadComplete={() => {
                                                        setTranscriptRefreshKey(prev => prev + 1)
                                                    }}
                                                />
                                                <KnowledgeContextStatusCard
                                                    key={`status-${transcriptRefreshKey}`}
                                                    lessonId={selectedLessonId}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed p-4 text-center">
                                            <p className="text-sm text-muted-foreground">
                                                Save the lesson first to enable transcript upload
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )
                        })()}
                        </>

                        {lessonError && <p className="text-sm text-destructive">{lessonError}</p>}
                        <DialogFooter>
                            <Button variant="outline" onClick={closeLessonModal}>Cancel</Button>
                            <Button onClick={handleSaveLesson} disabled={lessonSaving}>
                                {lessonSaving ? 'Saving...' : 'Save lesson'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Chunk Preview Modal */}
                {selectedLessonId && (
                    <ChunkPreview
                        lessonId={selectedLessonId}
                        open={chunkPreviewOpen}
                        onOpenChange={setChunkPreviewOpen}
                    />
                )}

                {/* VTT Prompt Modal - Shows after video upload */}
                <Dialog open={vttPromptOpen} onOpenChange={setVttPromptOpen}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                                    <Video className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <DialogTitle>Add Transcription for AI Assistant</DialogTitle>
                                    <DialogDescription>
                                        Enable AI-powered Q&A for this video
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <p className="text-sm text-muted-foreground">
                                To enable AI-powered Q&A for this video, please upload the transcription file (VTT format).
                                The AI Assistant will use this to answer student questions with precise citations.
                            </p>

                            <Alert>
                                <FileText className="h-4 w-4" />
                                <AlertDescription>
                                    VTT (WebVTT) files contain timed text tracks. You can generate these using video editing
                                    software or transcription services.
                                </AlertDescription>
                            </Alert>

                            {vttPromptLessonId && vttPromptVideoAssetId && (
                                <TranscriptUpload
                                    lessonId={vttPromptLessonId}
                                    videoAssetId={vttPromptVideoAssetId}
                                    onUploadComplete={() => {
                                        setVttPromptOpen(false)
                                        setVttPromptVideoAssetId(null)
                                        setVttPromptLessonId(null)
                                    }}
                                />
                            )}
                        </div>

                        <DialogFooter className="flex-col gap-2 sm:flex-row">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setVttPromptOpen(false)
                                    setVttPromptVideoAssetId(null)
                                    setVttPromptLessonId(null)
                                }}
                                className="w-full sm:w-auto"
                            >
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                Skip for Now
                            </Button>
                            <p className="text-xs text-muted-foreground text-center sm:hidden">
                                (AI will have limited knowledge without transcript)
                            </p>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    )
}
