'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Plus, Save, Trash2, Pencil } from 'lucide-react'
import { SUPPORTED_OPENAI_MODELS, isSupportedOpenAIModel } from '@/lib/services/openai-models'

type AIPromptUseCase =
    | 'VTT_TO_XML_ENRICHMENT'
    | 'KNOWLEDGE_ANCHORS_GENERATION'
    | 'EXAM_GENERATION'
    | 'EXAM_GRADING_ESSAY'
    | 'AI_ASSISTANT_RAG_SYSTEM'
    | 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM'
    | 'MISC'

type AIResponseFormat = 'TEXT' | 'JSON_OBJECT'

type PromptTemplate = {
    id: string
    name: string
    description: string | null
    useCase: AIPromptUseCase
    template: string
    systemPrompt: string | null
    userPrompt: string | null
    variables: string[]
    model: string
    temperature: number
    maxTokens: number
    responseFormat: AIResponseFormat
    isActive: boolean
    createdAt: string
    updatedAt: string
}

type PromptDefault = {
    id: string
    useCase: AIPromptUseCase
    templateId: string
    template: PromptTemplate
}

type CourseRow = { id: string; title: string }
type ExamRow = { id: string; title: string; status?: string; courseId?: string | null }

type CourseAssignment = {
    id: string
    courseId: string
    useCase: AIPromptUseCase
    templateId: string
    modelOverride: string | null
    temperatureOverride: number | null
    maxTokensOverride: number | null
    isEnabled: boolean
    template: PromptTemplate
}

type ExamAssignment = {
    id: string
    examId: string
    useCase: AIPromptUseCase
    templateId: string
    modelOverride: string | null
    temperatureOverride: number | null
    maxTokensOverride: number | null
    isEnabled: boolean
    template: PromptTemplate
}

const USE_CASES: { value: Exclude<AIPromptUseCase, 'MISC'>; label: string; scope: 'course' | 'exam' | 'global' }[] = [
    { value: 'VTT_TO_XML_ENRICHMENT', label: 'VTT → XML enrichment', scope: 'course' },
    { value: 'KNOWLEDGE_ANCHORS_GENERATION', label: 'Key Moments (anchors)', scope: 'course' },
    { value: 'EXAM_GENERATION', label: 'Exam generation', scope: 'exam' },
    { value: 'EXAM_GRADING_ESSAY', label: 'Exam essay grading', scope: 'exam' },
    { value: 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM', label: 'AI assistant (Knowledge Context)', scope: 'global' },
]

function getAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {}
    const token = localStorage.getItem('accessToken')
    return token ? { Authorization: `Bearer ${token}` } : {}
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const res = await fetch(input, init)
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
        const message = json?.error?.message || `Request failed: ${res.status}`
        throw new Error(message)
    }
    return json.data as T
}

function buildTemplateOptions(templates: PromptTemplate[], useCase: AIPromptUseCase) {
    return templates
        .filter((t) => t.useCase === useCase)
        .map((t) => ({ id: t.id, name: t.name, isActive: t.isActive }))
}

function numberOrNull(value: string): number | null {
    const v = value.trim()
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

export default function AdminAIConfigPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [templates, setTemplates] = useState<PromptTemplate[]>([])
    const [defaults, setDefaults] = useState<PromptDefault[]>([])
    const [courses, setCourses] = useState<CourseRow[]>([])
    const [exams, setExams] = useState<ExamRow[]>([])

    const [templateSearch, setTemplateSearch] = useState('')
    const [templateUseCaseFilter, setTemplateUseCaseFilter] = useState<AIPromptUseCase | 'ALL'>('ALL')

    // Assignments UI state
    const [selectedCourseId, setSelectedCourseId] = useState<string>('none')
    const [selectedExamId, setSelectedExamId] = useState<string>('none')
    const [courseAssignments, setCourseAssignments] = useState<CourseAssignment[]>([])
    const [examAssignments, setExamAssignments] = useState<ExamAssignment[]>([])

    const [savingDefault, setSavingDefault] = useState<Record<string, boolean>>({})
    const [savingAssignment, setSavingAssignment] = useState<Record<string, boolean>>({})

    // Create template dialog
    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createForm, setCreateForm] = useState<{
        name: string
        description: string
        useCase: Exclude<AIPromptUseCase, 'MISC'>
        systemPrompt: string
        userPrompt: string
        variables: string
        model: string
        temperature: string
        maxTokens: string
        responseFormat: AIResponseFormat
        isActive: boolean
    }>({
        name: '',
        description: '',
        useCase: 'VTT_TO_XML_ENRICHMENT',
        systemPrompt: '',
        userPrompt: '',
        variables: '',
        model: 'gpt-4o-mini',
        temperature: '0.2',
        maxTokens: '1024',
        responseFormat: 'TEXT',
        isActive: true,
    })

    // Edit template dialog
    const [editOpen, setEditOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editForm, setEditForm] = useState<{
        id: string
        name: string
        description: string
        useCase: AIPromptUseCase
        systemPrompt: string
        userPrompt: string
        variables: string
        model: string
        temperature: string
        maxTokens: string
        responseFormat: AIResponseFormat
        isActive: boolean
    } | null>(null)

    const editModelUnsupported = useMemo(() => {
        if (!editForm) return false
        return !isSupportedOpenAIModel(editForm.model)
    }, [editForm])

    const filteredTemplates = useMemo(() => {
        const q = templateSearch.trim().toLowerCase()
        return templates.filter((t) => {
            if (templateUseCaseFilter !== 'ALL' && t.useCase !== templateUseCaseFilter) return false
            if (!q) return true
            return (
                t.name.toLowerCase().includes(q) ||
                (t.description || '').toLowerCase().includes(q) ||
                (t.systemPrompt || t.template).toLowerCase().includes(q)
            )
        })
    }, [templates, templateSearch, templateUseCaseFilter])

    const defaultsByUseCase = useMemo(() => {
        const map = new Map<AIPromptUseCase, PromptDefault>()
        for (const d of defaults) map.set(d.useCase, d)
        return map
    }, [defaults])

    const courseAssignmentByUseCase = useMemo(() => {
        const map = new Map<AIPromptUseCase, CourseAssignment>()
        for (const a of courseAssignments) map.set(a.useCase, a)
        return map
    }, [courseAssignments])

    const examAssignmentByUseCase = useMemo(() => {
        const map = new Map<AIPromptUseCase, ExamAssignment>()
        for (const a of examAssignments) map.set(a.useCase, a)
        return map
    }, [examAssignments])

    const reloadAll = async () => {
        setLoading(true)
        setError(null)
        try {
            const [t, d, c, e] = await Promise.all([
                api<PromptTemplate[]>('/api/admin/ai/prompt-templates', { headers: getAuthHeaders() }),
                api<PromptDefault[]>('/api/admin/ai/defaults', { headers: getAuthHeaders() }),
                api<CourseRow[]>('/api/admin/courses?limit=50', { headers: getAuthHeaders() }),
                api<ExamRow[]>('/api/admin/exams?limit=50', { headers: getAuthHeaders() }),
            ])
            setTemplates(t)
            setDefaults(d)
            setCourses(c)
            setExams(e)
        } catch (e: any) {
            setError(e?.message || 'Failed to load AI configuration')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        reloadAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadCourseAssignments = async (courseId: string) => {
        if (!courseId || courseId === 'none') {
            setCourseAssignments([])
            return
        }
        const rows = await api<CourseAssignment[]>(`/api/admin/ai/assignments/course?courseId=${courseId}`, {
            headers: getAuthHeaders(),
        })
        setCourseAssignments(rows)
    }

    const loadExamAssignments = async (examId: string) => {
        if (!examId || examId === 'none') {
            setExamAssignments([])
            return
        }
        const rows = await api<ExamAssignment[]>(`/api/admin/ai/assignments/exam?examId=${examId}`, {
            headers: getAuthHeaders(),
        })
        setExamAssignments(rows)
    }

    const handleSetDefault = async (useCase: Exclude<AIPromptUseCase, 'MISC'>, templateId: string) => {
        setSavingDefault((p) => ({ ...p, [useCase]: true }))
        try {
            await api<PromptDefault>('/api/admin/ai/defaults', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ useCase, templateId }),
            })
            await reloadAll()
        } finally {
            setSavingDefault((p) => ({ ...p, [useCase]: false }))
        }
    }

    const handleUpsertCourseAssignment = async (
        courseId: string,
        useCase: Exclude<AIPromptUseCase, 'MISC'>,
        payload: {
            templateId: string
            isEnabled: boolean
            modelOverride: string | null
            temperatureOverride: number | null
            maxTokensOverride: number | null
        }
    ) => {
        const key = `course:${courseId}:${useCase}`
        setSavingAssignment((p) => ({ ...p, [key]: true }))
        try {
            await api<CourseAssignment>('/api/admin/ai/assignments/course', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ courseId, useCase, ...payload }),
            })
            await loadCourseAssignments(courseId)
        } finally {
            setSavingAssignment((p) => ({ ...p, [key]: false }))
        }
    }

    const handleDeleteCourseAssignment = async (courseId: string, useCase: Exclude<AIPromptUseCase, 'MISC'>) => {
        const key = `course:${courseId}:${useCase}`
        setSavingAssignment((p) => ({ ...p, [key]: true }))
        try {
            await api<{ ok: true }>('/api/admin/ai/assignments/course', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ courseId, useCase }),
            })
            await loadCourseAssignments(courseId)
        } finally {
            setSavingAssignment((p) => ({ ...p, [key]: false }))
        }
    }

    const handleUpsertExamAssignment = async (
        examId: string,
        useCase: Exclude<AIPromptUseCase, 'MISC'>,
        payload: {
            templateId: string
            isEnabled: boolean
            modelOverride: string | null
            temperatureOverride: number | null
            maxTokensOverride: number | null
        }
    ) => {
        const key = `exam:${examId}:${useCase}`
        setSavingAssignment((p) => ({ ...p, [key]: true }))
        try {
            await api<ExamAssignment>('/api/admin/ai/assignments/exam', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ examId, useCase, ...payload }),
            })
            await loadExamAssignments(examId)
        } finally {
            setSavingAssignment((p) => ({ ...p, [key]: false }))
        }
    }

    const handleDeleteExamAssignment = async (examId: string, useCase: Exclude<AIPromptUseCase, 'MISC'>) => {
        const key = `exam:${examId}:${useCase}`
        setSavingAssignment((p) => ({ ...p, [key]: true }))
        try {
            await api<{ ok: true }>('/api/admin/ai/assignments/exam', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ examId, useCase }),
            })
            await loadExamAssignments(examId)
        } finally {
            setSavingAssignment((p) => ({ ...p, [key]: false }))
        }
    }

    const handleCreateTemplate = async () => {
        setCreating(true)
        setError(null)
        try {
            const variables = createForm.variables
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            await api<PromptTemplate>('/api/admin/ai/prompt-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    name: createForm.name,
                    description: createForm.description || null,
                    useCase: createForm.useCase,
                    systemPrompt: createForm.systemPrompt,
                    userPrompt: createForm.userPrompt || null,
                    variables,
                    model: createForm.model,
                    temperature: Number(createForm.temperature),
                    maxTokens: Number(createForm.maxTokens),
                    responseFormat: createForm.responseFormat,
                    isActive: createForm.isActive,
                }),
            })
            setCreateOpen(false)
            setCreateForm((p) => ({ ...p, name: '', description: '', systemPrompt: '', userPrompt: '', variables: '' }))
            await reloadAll()
        } catch (e: any) {
            setError(e?.message || 'Failed to create template')
        } finally {
            setCreating(false)
        }
    }

    const openEditTemplate = (t: PromptTemplate) => {
        setEditForm({
            id: t.id,
            name: t.name,
            description: t.description || '',
            useCase: t.useCase,
            systemPrompt: t.systemPrompt || t.template,
            userPrompt: t.userPrompt || '',
            variables: (t.variables || []).join(','),
            model: t.model,
            temperature: String(t.temperature),
            maxTokens: String(t.maxTokens),
            responseFormat: t.responseFormat,
            isActive: t.isActive,
        })
        setEditOpen(true)
    }

    const handleUpdateTemplate = async () => {
        if (!editForm) return
        setEditing(true)
        setError(null)
        try {
            const variables = editForm.variables
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            await api<PromptTemplate>(`/api/admin/ai/prompt-templates/${editForm.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    name: editForm.name,
                    description: editForm.description || null,
                    useCase: editForm.useCase,
                    systemPrompt: editForm.systemPrompt,
                    userPrompt: editForm.userPrompt || null,
                    variables,
                    model: editForm.model,
                    temperature: Number(editForm.temperature),
                    maxTokens: Number(editForm.maxTokens),
                    responseFormat: editForm.responseFormat,
                    isActive: editForm.isActive,
                }),
            })
            setEditOpen(false)
            setEditForm(null)
            await reloadAll()
        } catch (e: any) {
            setError(e?.message || 'Failed to update template')
        } finally {
            setEditing(false)
        }
    }

    const handleDeleteTemplate = async (id: string) => {
        if (!window.confirm('Delete this template? If it is used by defaults/assignments, the server will block deletion.')) return
        setError(null)
        try {
            await api<{ ok: true }>(`/api/admin/ai/prompt-templates/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            })
            await reloadAll()
        } catch (e: any) {
            setError(e?.message || 'Failed to delete template')
        }
    }

    if (loading) {
        return (
            <DashboardLayout>
                <Card>
                    <CardContent className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </CardContent>
                </Card>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">AI Configuration</h1>
                        <p className="text-muted-foreground mt-1">Manage prompt templates, defaults, and per course/exam overrides.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={reloadAll}>
                            Reload
                        </Button>
                    </div>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Tabs defaultValue="templates" className="w-full">
                    <TabsList>
                        <TabsTrigger value="templates">Templates</TabsTrigger>
                        <TabsTrigger value="defaults">Defaults</TabsTrigger>
                        <TabsTrigger value="assignments">Assignments</TabsTrigger>
                    </TabsList>

                    <TabsContent value="templates" className="mt-6 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <Input
                                    placeholder="Search templates"
                                    className="w-[280px]"
                                    value={templateSearch}
                                    onChange={(e) => setTemplateSearch(e.target.value)}
                                />
                                <Select value={templateUseCaseFilter} onValueChange={(v) => setTemplateUseCaseFilter(v as any)}>
                                    <SelectTrigger className="w-[260px]">
                                        <SelectValue placeholder="Filter by use-case" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All use-cases</SelectItem>
                                        {USE_CASES.map((u) => (
                                            <SelectItem key={u.value} value={u.value}>
                                                {u.label}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="MISC">MISC</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Template
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl">
                                    <DialogHeader>
                                        <DialogTitle>Create Prompt Template</DialogTitle>
                                        <DialogDescription>
                                            Use {'{{variable}}'} placeholders. Save template defaults (model/temperature/maxTokens) here.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Name</Label>
                                            <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Use-case</Label>
                                            <Select
                                                value={createForm.useCase}
                                                onValueChange={(v) => setCreateForm((p) => ({ ...p, useCase: v as any }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {USE_CASES.map((u) => (
                                                        <SelectItem key={u.value} value={u.value}>
                                                            {u.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Description</Label>
                                            <Input
                                                value={createForm.description}
                                                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Variables (comma separated)</Label>
                                            <Input
                                                placeholder="courseTitle,chapterTitle,lessonTitle"
                                                value={createForm.variables}
                                                onChange={(e) => setCreateForm((p) => ({ ...p, variables: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>System Prompt</Label>
                                            <Textarea
                                                rows={8}
                                                value={createForm.systemPrompt}
                                                onChange={(e) => setCreateForm((p) => ({ ...p, systemPrompt: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>User Prompt (optional)</Label>
                                            <Textarea
                                                rows={8}
                                                value={createForm.userPrompt}
                                                onChange={(e) => setCreateForm((p) => ({ ...p, userPrompt: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Model</Label>
                                            <Select value={createForm.model} onValueChange={(v) => setCreateForm((p) => ({ ...p, model: v }))}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {SUPPORTED_OPENAI_MODELS.map((m) => (
                                                        <SelectItem key={m} value={m}>
                                                            {m}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Response format</Label>
                                            <Select
                                                value={createForm.responseFormat}
                                                onValueChange={(v) => setCreateForm((p) => ({ ...p, responseFormat: v as any }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="TEXT">TEXT</SelectItem>
                                                    <SelectItem value="JSON_OBJECT">JSON_OBJECT</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Temperature</Label>
                                            <Input
                                                value={createForm.temperature}
                                                onChange={(e) => setCreateForm((p) => ({ ...p, temperature: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Max tokens</Label>
                                            <Input value={createForm.maxTokens} onChange={(e) => setCreateForm((p) => ({ ...p, maxTokens: e.target.value }))} />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreateTemplate} disabled={creating || !createForm.name || !createForm.systemPrompt}>
                                            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                            Create
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                            <div className="rounded-lg border overflow-x-auto">
                                <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-muted-foreground border-b">
                                        <th className="py-3 px-4 font-medium">Name</th>
                                        <th className="py-3 px-4 font-medium">Use-case</th>
                                        <th className="py-3 px-4 font-medium">Model</th>
                                        <th className="py-3 px-4 font-medium">Active</th>
                                        <th className="py-3 px-4 font-medium text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTemplates.map((t) => (
                                        <tr key={t.id} className="border-b last:border-0">
                                            <td className="py-3 px-4">
                                                <div className="font-medium">{t.name}</div>
                                                <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge variant="secondary">{t.useCase}</Badge>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div>{t.model}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    temp={t.temperature}, maxTokens={t.maxTokens}, {t.responseFormat}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">{t.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Disabled</Badge>}</td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => openEditTemplate(t)}>
                                                        <Pencil className="h-4 w-4 mr-2" />
                                                        Edit
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t.id)}>
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredTemplates.length === 0 && (
                                        <tr>
                                            <td className="py-6 px-4 text-muted-foreground" colSpan={5}>
                                                No templates found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <Dialog open={editOpen} onOpenChange={setEditOpen}>
                            <DialogContent className="max-w-3xl">
                                <DialogHeader>
                                    <DialogTitle>Edit Prompt Template</DialogTitle>
                                    <DialogDescription>Changes apply immediately after saving.</DialogDescription>
                                </DialogHeader>
                                {editForm && (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Name</Label>
                                            <Input value={editForm.name} onChange={(e) => setEditForm((p) => (p ? { ...p, name: e.target.value } : p))} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Use-case</Label>
                                            <Select
                                                value={editForm.useCase}
                                                onValueChange={(v) => setEditForm((p) => (p ? { ...p, useCase: v as any } : p))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {[...USE_CASES.map((u) => u.value), 'MISC'].map((value) => (
                                                        <SelectItem key={value} value={value}>
                                                            {value}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Description</Label>
                                            <Input
                                                value={editForm.description}
                                                onChange={(e) => setEditForm((p) => (p ? { ...p, description: e.target.value } : p))}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Variables (comma separated)</Label>
                                            <Input
                                                value={editForm.variables}
                                                onChange={(e) => setEditForm((p) => (p ? { ...p, variables: e.target.value } : p))}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>System Prompt</Label>
                                            <Textarea
                                                rows={8}
                                                value={editForm.systemPrompt}
                                                onChange={(e) => setEditForm((p) => (p ? { ...p, systemPrompt: e.target.value } : p))}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>User Prompt (optional)</Label>
                                            <Textarea
                                                rows={8}
                                                value={editForm.userPrompt}
                                                onChange={(e) => setEditForm((p) => (p ? { ...p, userPrompt: e.target.value } : p))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Model</Label>
                                            <Select value={editForm.model} onValueChange={(v) => setEditForm((p) => (p ? { ...p, model: v } : p))}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {editModelUnsupported && (
                                                        <SelectItem value={editForm.model} disabled>
                                                            (unsupported) {editForm.model}
                                                        </SelectItem>
                                                    )}
                                                    {SUPPORTED_OPENAI_MODELS.map((m) => (
                                                        <SelectItem key={m} value={m}>
                                                            {m}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {editModelUnsupported && (
                                                <Alert variant="destructive">
                                                    <AlertTitle>Unsupported model</AlertTitle>
                                                    <AlertDescription>
                                                        This template uses an unsupported model: <span className="font-mono">{editForm.model}</span>. Please select a supported model to continue.
                                                    </AlertDescription>
                                                </Alert>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Response format</Label>
                                            <Select
                                                value={editForm.responseFormat}
                                                onValueChange={(v) => setEditForm((p) => (p ? { ...p, responseFormat: v as any } : p))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="TEXT">TEXT</SelectItem>
                                                    <SelectItem value="JSON_OBJECT">JSON_OBJECT</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Temperature</Label>
                                            <Input
                                                value={editForm.temperature}
                                                onChange={(e) => setEditForm((p) => (p ? { ...p, temperature: e.target.value } : p))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Max tokens</Label>
                                            <Input
                                                value={editForm.maxTokens}
                                                onChange={(e) => setEditForm((p) => (p ? { ...p, maxTokens: e.target.value } : p))}
                                            />
                                        </div>
                                    </div>
                                )}
                                <DialogFooter>
                                    <Button onClick={handleUpdateTemplate} disabled={editing || !editForm?.name || !editForm?.systemPrompt || editModelUnsupported}>
                                        {editing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                        Save
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </TabsContent>

                    <TabsContent value="defaults" className="mt-6 space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Defaults</CardTitle>
                                <CardDescription>Used when no course/exam override exists.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {USE_CASES.map((u) => {
                                    const d = defaultsByUseCase.get(u.value)
                                    const options = buildTemplateOptions(templates, u.value)
                                    const current = d?.templateId || 'none'
                                    return (
                                        <div key={u.value} className="flex items-center justify-between gap-4 flex-wrap border rounded-lg p-4">
                                            <div className="min-w-[260px]">
                                                <div className="font-medium">{u.label}</div>
                                                <div className="text-xs text-muted-foreground">{u.value}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={current}
                                                    onValueChange={(templateId) => handleSetDefault(u.value, templateId)}
                                                >
                                                    <SelectTrigger className="w-[360px]">
                                                        <SelectValue placeholder="Select default template" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {options.map((opt) => (
                                                            <SelectItem key={opt.id} value={opt.id}>
                                                                {opt.name}
                                                                {!opt.isActive ? ' (disabled)' : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {savingDefault[u.value] && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                            </div>
                                        </div>
                                    )
                                })}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="assignments" className="mt-6 space-y-6">
                        <Alert>
                            <AlertTitle>Priority</AlertTitle>
                            <AlertDescription>When both exist: Course override → Exam override → Default template → Hardcoded fallback.</AlertDescription>
                        </Alert>

                        <Card>
                            <CardHeader>
                                <CardTitle>Course Assignments</CardTitle>
                                <CardDescription>
                                    Course assignments apply to all use-cases and take precedence over exam assignments when both exist.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Select
                                        value={selectedCourseId}
                                        onValueChange={(courseId) => {
                                            setSelectedCourseId(courseId)
                                            loadCourseAssignments(courseId)
                                        }}
                                    >
                                        <SelectTrigger className="w-[520px]">
                                            <SelectValue placeholder="Select a course" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {courses.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedCourseId !== 'none' && (
                                    <div className="space-y-3">
                                        {USE_CASES.map((u) => {
                                            const row = courseAssignmentByUseCase.get(u.value)
                                            const options = buildTemplateOptions(templates, u.value)
                                            const key = `course:${selectedCourseId}:${u.value}`
                                            const saving = !!savingAssignment[key]
                                            return (
                                                <AssignmentRow
                                                    key={u.value}
                                                    title={u.label}
                                                    useCase={u.value}
                                                    options={options}
                                                    initial={{
                                                        templateId: row?.templateId || defaultsByUseCase.get(u.value)?.templateId || 'none',
                                                        isEnabled: row?.isEnabled ?? true,
                                                        modelOverride: row?.modelOverride ?? '',
                                                        temperatureOverride: row?.temperatureOverride?.toString() ?? '',
                                                        maxTokensOverride: row?.maxTokensOverride?.toString() ?? '',
                                                    }}
                                                    onSave={(payload) =>
                                                        handleUpsertCourseAssignment(selectedCourseId, u.value, {
                                                            templateId: payload.templateId,
                                                            isEnabled: payload.isEnabled,
                                                            modelOverride: payload.modelOverride || null,
                                                            temperatureOverride: numberOrNull(payload.temperatureOverride),
                                                            maxTokensOverride: payload.maxTokensOverride ? Number(payload.maxTokensOverride) : null,
                                                        })
                                                    }
                                                    onClear={() => handleDeleteCourseAssignment(selectedCourseId, u.value)}
                                                    saving={saving}
                                                />
                                            )
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Exam Assignments</CardTitle>
                                <CardDescription>Used by exam-scoped use-cases (generation/grading).</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Select
                                        value={selectedExamId}
                                        onValueChange={(examId) => {
                                            setSelectedExamId(examId)
                                            loadExamAssignments(examId)
                                        }}
                                    >
                                        <SelectTrigger className="w-[520px]">
                                            <SelectValue placeholder="Select an exam" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {exams.map((e) => (
                                                <SelectItem key={e.id} value={e.id}>
                                                    {e.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedExamId !== 'none' && (
                                    <div className="space-y-3">
                                        {USE_CASES.filter((u) => u.scope === 'exam').map((u) => {
                                            const row = examAssignmentByUseCase.get(u.value)
                                            const options = buildTemplateOptions(templates, u.value)
                                            const key = `exam:${selectedExamId}:${u.value}`
                                            const saving = !!savingAssignment[key]
                                            return (
                                                <AssignmentRow
                                                    key={u.value}
                                                    title={u.label}
                                                    useCase={u.value}
                                                    options={options}
                                                    initial={{
                                                        templateId: row?.templateId || defaultsByUseCase.get(u.value)?.templateId || 'none',
                                                        isEnabled: row?.isEnabled ?? true,
                                                        modelOverride: row?.modelOverride ?? '',
                                                        temperatureOverride: row?.temperatureOverride?.toString() ?? '',
                                                        maxTokensOverride: row?.maxTokensOverride?.toString() ?? '',
                                                    }}
                                                    onSave={(payload) =>
                                                        handleUpsertExamAssignment(selectedExamId, u.value, {
                                                            templateId: payload.templateId,
                                                            isEnabled: payload.isEnabled,
                                                            modelOverride: payload.modelOverride || null,
                                                            temperatureOverride: numberOrNull(payload.temperatureOverride),
                                                            maxTokensOverride: payload.maxTokensOverride ? Number(payload.maxTokensOverride) : null,
                                                        })
                                                    }
                                                    onClear={() => handleDeleteExamAssignment(selectedExamId, u.value)}
                                                    saving={saving}
                                                />
                                            )
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}

function AssignmentRow(props: {
    title: string
    useCase: string
    options: { id: string; name: string; isActive: boolean }[]
    initial: {
        templateId: string
        isEnabled: boolean
        modelOverride: string
        temperatureOverride: string
        maxTokensOverride: string
    }
    saving: boolean
    onSave: (payload: {
        templateId: string
        isEnabled: boolean
        modelOverride: string
        temperatureOverride: string
        maxTokensOverride: string
    }) => Promise<void>
    onClear: () => Promise<void>
}) {
    const [templateId, setTemplateId] = useState(props.initial.templateId)
    const [isEnabled, setIsEnabled] = useState(props.initial.isEnabled)
    const [modelOverride, setModelOverride] = useState(props.initial.modelOverride)
    const [temperatureOverride, setTemperatureOverride] = useState(props.initial.temperatureOverride)
    const [maxTokensOverride, setMaxTokensOverride] = useState(props.initial.maxTokensOverride)
    const modelOverrideUnsupported = modelOverride ? !isSupportedOpenAIModel(modelOverride) : false

    useEffect(() => {
        setTemplateId(props.initial.templateId)
        setIsEnabled(props.initial.isEnabled)
        setModelOverride(props.initial.modelOverride)
        setTemperatureOverride(props.initial.temperatureOverride)
        setMaxTokensOverride(props.initial.maxTokensOverride)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.initial.templateId])

    return (
        <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <div className="font-medium">{props.title}</div>
                    <div className="text-xs text-muted-foreground">{props.useCase}</div>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
                        Enabled
                    </label>
                    <Button
                        size="sm"
                        onClick={() =>
                            props.onSave({
                                templateId,
                                isEnabled,
                                modelOverride,
                                temperatureOverride,
                                maxTokensOverride,
                            })
                        }
                        disabled={props.saving || templateId === 'none' || modelOverrideUnsupported}
                    >
                        {props.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={props.onClear} disabled={props.saving}>
                        Clear
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={templateId} onValueChange={setTemplateId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {props.options.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                    {opt.name}
                                    {!opt.isActive ? ' (disabled)' : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label>Model override</Label>
                        <Select
                            value={modelOverride ? modelOverride : 'none'}
                            onValueChange={(v) => setModelOverride(v === 'none' ? '' : v)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="(optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">(none)</SelectItem>
                                {modelOverrideUnsupported && (
                                    <SelectItem value={modelOverride} disabled>
                                        (unsupported) {modelOverride}
                                    </SelectItem>
                                )}
                                {SUPPORTED_OPENAI_MODELS.map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {modelOverrideUnsupported && (
                            <div className="text-xs text-destructive">
                                Unsupported model override. Please pick a supported model or clear it.
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>Temp override</Label>
                        <Input
                            placeholder="(optional)"
                            value={temperatureOverride}
                            onChange={(e) => setTemperatureOverride(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Max tokens override</Label>
                        <Input placeholder="(optional)" value={maxTokensOverride} onChange={(e) => setMaxTokensOverride(e.target.value)} />
                    </div>
                </div>
            </div>
        </div>
    )
}
