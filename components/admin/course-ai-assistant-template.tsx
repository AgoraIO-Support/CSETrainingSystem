'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Loader2, Wand2 } from 'lucide-react'

type AIPromptUseCase = 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM'

type PromptTemplate = {
    id: string
    name: string
    description: string | null
    useCase: string
    isActive: boolean
    updatedAt: string
}

type PromptDefault = {
    id: string
    useCase: string
    templateId: string
    template: PromptTemplate
}

type CourseAssignment = {
    id: string
    courseId: string
    useCase: string
    templateId: string
    isEnabled: boolean
    template: PromptTemplate
}

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

export function CourseAIAssistantTemplate({
    courseId,
    canManageTemplates = true,
}: {
    courseId: string
    canManageTemplates?: boolean
}) {
    const useCase: AIPromptUseCase = 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM'

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [templates, setTemplates] = useState<PromptTemplate[]>([])
    const [defaultRow, setDefaultRow] = useState<PromptDefault | null>(null)
    const [assignment, setAssignment] = useState<CourseAssignment | null>(null)

    const selectedValue = assignment?.templateId ?? 'default'

    const activeTemplates = useMemo(() => templates.filter((t) => t.isActive), [templates])

    const defaultLabel = defaultRow?.template?.name ? `Default: ${defaultRow.template.name}` : 'Default (fallback)'

    const reload = async () => {
        setLoading(true)
        setError(null)
        try {
            const [t, d, a] = await Promise.all([
                api<PromptTemplate[]>(`/api/admin/ai/prompt-templates?useCase=${useCase}`, { headers: getAuthHeaders() }),
                api<PromptDefault[]>(`/api/admin/ai/defaults`, { headers: getAuthHeaders() }),
                api<CourseAssignment[]>(`/api/admin/ai/assignments/course?courseId=${courseId}`, { headers: getAuthHeaders() }),
            ])

            setTemplates(t)
            const defaultForUseCase = d.find((row) => row.useCase === useCase) ?? null
            setDefaultRow(defaultForUseCase)

            const override = a.find((row) => row.useCase === useCase) ?? null
            setAssignment(override)
        } catch (e: any) {
            setError(e?.message || 'Failed to load AI assistant template')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId])

    const onChange = async (value: string) => {
        setSaving(true)
        setError(null)
        try {
            if (value === 'default') {
                if (assignment) {
                    await api(`/api/admin/ai/assignments/course`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        body: JSON.stringify({ courseId, useCase }),
                    })
                }
                setAssignment(null)
                return
            }

            const row = await api<CourseAssignment>(`/api/admin/ai/assignments/course`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    courseId,
                    useCase,
                    templateId: value,
                    isEnabled: true,
                }),
            })
            setAssignment(row)
        } catch (e: any) {
            setError(e?.message || 'Failed to save template selection')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5" />
                        <CardTitle>AI Assistant Template</CardTitle>
                    </div>
                    {canManageTemplates ? (
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/admin/ai-config">Manage templates</Link>
                        </Button>
                    ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                    Select which prompt template to use for the AI assistant in this course.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-2">
                    <Select value={selectedValue} onValueChange={onChange} disabled={saving}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">{defaultLabel}</SelectItem>
                            {activeTemplates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        {assignment
                            ? `Course override: ${assignment.template?.name ?? assignment.templateId}`
                            : 'Using the global default template for this use case.'}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
