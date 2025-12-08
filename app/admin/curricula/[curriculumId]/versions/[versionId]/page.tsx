'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CurriculumStatusBadge } from '@/components/curriculum/curriculum-status-badge'
import type { CurriculumModule, CurriculumVersion } from '@/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Save, Send } from 'lucide-react'

const fallbackVersion: CurriculumVersion = {
    id: 'cv_fallback',
    curriculumId: 'cur_fallback',
    versionNumber: 1,
    status: 'DRAFT',
    title: 'RTC Core Support',
    description: 'Draft curriculum for RTC support onboarding.',
    audienceLevel: 'L1',
    learningOutcomes: ['Diagnose auth errors', 'Collect client logs'],
    requirements: ['Basic networking'],
    tags: ['rtc', 'support'],
    modules: [
        {
            id: 'mod_auth',
            title: 'Auth & Triage',
            description: 'Handle auth failures and quick triage.',
            position: 1,
            lessons: [
                { id: 'les_auth', title: 'Diagnose 40x auth errors', durationSeconds: 600, skillLevel: 'L1' },
                { id: 'les_logs', title: 'Collect client logs', durationSeconds: 480, skillLevel: 'L1' },
            ],
        },
        {
            id: 'mod_media',
            title: 'Media Basics',
            description: 'Intro to media quality signals.',
            position: 2,
            lessons: [{ id: 'les_media', title: 'Read WebRTC stats', durationSeconds: 720, skillLevel: 'L1' }],
        },
    ],
}

type EditorState = {
    version: CurriculumVersion
    loading: boolean
    saving: boolean
    error: string | null
}

export default function CurriculumEditorPage() {
    const params = useParams<{ curriculumId: string; versionId: string }>()
    const router = useRouter()
    const [state, setState] = useState<EditorState>({ version: fallbackVersion, loading: true, saving: false, error: null })
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null)
    const isMock = state.version.id === 'cv_fallback' || String(params.versionId).startsWith('draft')
    const isDraft = state.version.status === 'DRAFT' && !isMock

    useEffect(() => {
        let mounted = true
        const load = async () => {
            setState(prev => ({ ...prev, loading: true, error: null }))
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
                const res = await fetch(`/api/admin/curricula/${params.curriculumId}?versionId=${params.versionId}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                if (!res.ok) throw new Error('Failed to load curriculum')
                const data = await res.json()
                if (mounted) {
                    const version = data.version as CurriculumVersion
                    setState({ version, loading: false, saving: false, error: null })
                    setActiveModuleId(version.modules[0]?.id ?? null)
                }
            } catch (err) {
                console.warn('Using fallback curriculum version', err)
                if (mounted) {
                    setState({ version: fallbackVersion, loading: false, saving: false, error: null })
                    setActiveModuleId(fallbackVersion.modules[0]?.id ?? null)
                }
            }
        }
        load()
        return () => {
            mounted = false
        }
    }, [params.curriculumId, params.versionId])

    const onFieldChange = (field: keyof CurriculumVersion, value: any) => {
        setState(prev => ({ ...prev, version: { ...prev.version, [field]: value } }))
    }

    const updateModule = (moduleId: string, patch: Partial<CurriculumModule>) => {
        setState(prev => ({
            ...prev,
            version: {
                ...prev.version,
                modules: prev.version.modules.map(m => (m.id === moduleId ? { ...m, ...patch } : m)),
            },
        }))
    }

    const addModule = () => {
        const nextIndex = state.version.modules.length + 1
        const newMod: CurriculumModule = {
            id: `mod_${Date.now()}`,
            title: 'New module',
            description: '',
            position: nextIndex,
            lessons: [],
        }
        setState(prev => ({
            ...prev,
            version: { ...prev.version, modules: [...prev.version.modules, newMod] },
        }))
        setActiveModuleId(newMod.id)
    }

    const saveDraft = async () => {
        if (!isDraft || isMock) return
        setState(prev => ({ ...prev, saving: true, error: null }))
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
            await fetch(`/api/admin/curricula/versions/${state.version.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    title: state.version.title,
                    description: state.version.description,
                    audienceLevel: state.version.audienceLevel,
                    learningOutcomes: state.version.learningOutcomes,
                    requirements: state.version.requirements,
                    modules: state.version.modules,
                }),
            })
        } catch (err) {
            setState(prev => ({ ...prev, error: 'Failed to save draft' }))
        } finally {
            setState(prev => ({ ...prev, saving: false }))
        }
    }

    const runPublish = async () => {
        if (isMock) {
            setState(prev => ({ ...prev, error: 'This is sample data; create a real curriculum to publish.' }))
            return
        }
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
            const res = await fetch(`/api/admin/curricula/versions/${state.version.id}/publish`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (!res.ok) throw new Error('Publish failed')
            router.refresh()
        } catch (err) {
            setState(prev => ({ ...prev, error: 'Publish failed. Fix checklist items and retry.' }))
        }
    }

    const currentModule = useMemo(
        () => state.version.modules.find(m => m.id === activeModuleId) ?? state.version.modules[0] ?? null,
        [state.version.modules, activeModuleId]
    )

    const checklistIssues = useMemo(() => {
        const issues: string[] = []
        if (!state.version.title.trim()) issues.push('Title is required')
        if (!state.version.learningOutcomes?.length) issues.push('Add at least one learning outcome')
        if (!state.version.requirements?.length) issues.push('Add at least one requirement')
        if (!state.version.modules.length) issues.push('Add at least one module')
        const lessonCount = state.version.modules.reduce((sum, m) => sum + m.lessons.length, 0)
        if (lessonCount < 1) issues.push('Add at least one lesson')
        return issues
    }, [state.version])

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{state.version.title || 'Untitled curriculum'}</h1>
                        <CurriculumStatusBadge status={state.version.status} />
                        <Badge variant="outline">v{state.version.versionNumber}</Badge>
                        <Badge variant="secondary">{state.version.audienceLevel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Curriculum ID: {params.curriculumId} • Version: {state.version.id}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    {isDraft ? (
                        <>
                            <Button variant="outline" size="sm" onClick={saveDraft} disabled={state.saving}>
                                {state.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Save draft
                            </Button>
                            <Button size="sm" onClick={runPublish} disabled={checklistIssues.length > 0 || isMock}>
                                <Send className="h-4 w-4 mr-2" />
                                Publish
                            </Button>
                        </>
                    ) : (
                        <Link href={`/admin/curricula/${params.curriculumId}/versions/new-draft`}>
                            <Button size="sm">Duplicate as draft</Button>
                        </Link>
                    )}
                </div>
            </div>

            {state.error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{state.error}</AlertDescription>
                </Alert>
            )}
            {isMock && (
                <Alert variant="default">
                    <AlertDescription>
                        You are viewing sample data (no backend record). Create a new curriculum or open one from the list to edit and publish.
                    </AlertDescription>
                </Alert>
            )}

            {state.loading ? (
                <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    Loading...
                </div>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Tabs defaultValue="overview">
                            <TabsList className="grid grid-cols-4 w-full">
                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                <TabsTrigger value="structure">Structure</TabsTrigger>
                                <TabsTrigger value="modules">Modules</TabsTrigger>
                                <TabsTrigger value="checklist">Checklist</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-4 mt-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Title</label>
                                        <Input value={state.version.title} onChange={e => onFieldChange('title', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Audience level</label>
                                        <Select
                                            value={state.version.audienceLevel}
                                            onValueChange={value => onFieldChange('audienceLevel', value)}
                                            disabled={!isDraft}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select level" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="L1">L1</SelectItem>
                                                <SelectItem value="L2">L2</SelectItem>
                                                <SelectItem value="L3">L3</SelectItem>
                                                <SelectItem value="L4">L4</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Description</label>
                                    <Textarea
                                        rows={3}
                                        value={state.version.description || ''}
                                        onChange={e => onFieldChange('description', e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">What you'll learn</label>
                                        <Textarea
                                            rows={4}
                                            value={state.version.learningOutcomes.join('\n')}
                                            onChange={e =>
                                                onFieldChange(
                                                    'learningOutcomes',
                                                    e.target.value.split('\n').filter(line => line.length > 0)
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Requirements</label>
                                        <Textarea
                                            rows={4}
                                            value={state.version.requirements.join('\n')}
                                            onChange={e =>
                                                onFieldChange(
                                                    'requirements',
                                                    e.target.value.split('\n').filter(line => line.length > 0)
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="structure" className="space-y-3 mt-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold">Modules</h3>
                                    {isDraft && (
                                        <Button size="sm" onClick={addModule}>
                                            Add module
                                        </Button>
                                    )}
                                </div>
                                <div className="grid gap-3">
                                    {state.version.modules
                                        .sort((a, b) => a.position - b.position)
                                        .map(mod => (
                                            <Card key={mod.id} className={mod.id === activeModuleId ? 'border-primary' : ''}>
                                                <CardContent className="p-4 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold">{mod.title}</span>
                                                                <Badge variant="outline">#{mod.position}</Badge>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground">
                                                                {mod.description || 'No description'}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => setActiveModuleId(mod.id)}>
                                                                Edit lessons
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                </div>
                            </TabsContent>

                            <TabsContent value="modules" className="mt-4">
                                {!currentModule ? (
                                    <div className="text-sm text-muted-foreground">Add a module to start mapping lessons.</div>
                                ) : (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>{currentModule.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Module title</label>
                                                <Input
                                                    value={currentModule.title}
                                                    onChange={e => updateModule(currentModule.id, { title: e.target.value })}
                                                    disabled={!isDraft}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Description</label>
                                                <Textarea
                                                    rows={3}
                                                    value={currentModule.description || ''}
                                                    onChange={e => updateModule(currentModule.id, { description: e.target.value })}
                                                    disabled={!isDraft}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold">Lessons</span>
                                                    {isDraft && (
                                                        <Button size="sm" variant="outline" disabled>
                                                            Add lesson (reuse)
                                                        </Button>
                                                    )}
                                                </div>
                                                {currentModule.lessons.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground">
                                                        No lessons in this module yet. Add lessons from the library.
                                                    </p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {currentModule.lessons.map(les => (
                                                            <div
                                                                key={les.id}
                                                                className="flex items-center justify-between rounded border p-3"
                                                            >
                                                                <div>
                                                                    <p className="font-medium">{les.title}</p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {les.skillLevel || 'N/A'} • {Math.round((les.durationSeconds ?? 0) / 60)} min
                                                                    </p>
                                                                </div>
                                                                {isDraft && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            updateModule(currentModule.id, {
                                                                                lessons: currentModule.lessons.filter(l => l.id !== les.id),
                                                                            })
                                                                        }
                                                                    >
                                                                        Remove
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </TabsContent>

                            <TabsContent value="checklist" className="mt-4 space-y-3">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Publish checklist</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {checklistIssues.length === 0 ? (
                                            <div className="flex items-center text-sm text-green-600">
                                                <CheckCircle2 className="h-4 w-4 mr-2" /> Ready to publish
                                            </div>
                                        ) : (
                                            checklistIssues.map(item => (
                                                <div key={item} className="flex items-center text-sm text-destructive">
                                                    <AlertCircle className="h-4 w-4 mr-2" /> {item}
                                                </div>
                                            ))
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
