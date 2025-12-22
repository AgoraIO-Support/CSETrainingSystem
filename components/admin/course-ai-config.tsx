'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bot, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

interface CourseAIConfigProps {
    courseId: string
}

interface AIConfig {
    systemPrompt: string
    modelOverride: string | null
    temperature: number
    maxTokens: number
    isEnabled: boolean
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI learning assistant for this course. Answer questions about the lesson content clearly and concisely. When referencing specific topics, relate them back to the lesson material when possible.

Available context variables:
- Course title and description
- Current lesson title and objectives
- Lesson transcript (if available)
- Current video timestamp

Provide accurate, helpful responses and suggest follow-up questions to deepen understanding.`

export function CourseAIConfig({ courseId }: CourseAIConfigProps) {
    const [config, setConfig] = useState<AIConfig>({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        modelOverride: null,
        temperature: 0.2,
        maxTokens: 1024,
        isEnabled: true,
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [hasConfig, setHasConfig] = useState(false)

    const getAuthHeaders = (): Record<string, string> => {
        if (typeof window === 'undefined') return {}
        const token = localStorage.getItem('accessToken')
        return token ? { Authorization: `Bearer ${token}` } : {}
    }

    useEffect(() => {
        const loadConfig = async () => {
            setLoading(true)
            try {
                const response = await fetch(`/api/admin/courses/${courseId}/ai-config`, {
                    headers: getAuthHeaders(),
                })
                if (response.ok) {
                    const data = await response.json()
                    if (data.data) {
                        setConfig({
                            systemPrompt: data.data.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                            modelOverride: data.data.modelOverride || null,
                            temperature: data.data.temperature ?? 0.2,
                            maxTokens: data.data.maxTokens ?? 1024,
                            isEnabled: data.data.isEnabled ?? true,
                        })
                        setHasConfig(true)
                    }
                }
            } catch (err) {
                console.error('Failed to load AI config:', err)
            } finally {
                setLoading(false)
            }
        }

        loadConfig()
    }, [courseId])

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch(`/api/admin/courses/${courseId}/ai-config`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify(config),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error?.message || 'Failed to save configuration')
            }

            setSuccess('AI configuration saved successfully')
            setHasConfig(true)
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!window.confirm('Delete AI configuration? This will reset to default settings.')) {
            return
        }

        setSaving(true)
        setError(null)

        try {
            const response = await fetch(`/api/admin/courses/${courseId}/ai-config`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            })

            if (!response.ok) {
                throw new Error('Failed to delete configuration')
            }

            setConfig({
                systemPrompt: DEFAULT_SYSTEM_PROMPT,
                modelOverride: null,
                temperature: 0.2,
                maxTokens: 1024,
                isEnabled: true,
            })
            setHasConfig(false)
            setSuccess('AI configuration reset to defaults')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete configuration')
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
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        <CardTitle>AI Learning Assistant Configuration</CardTitle>
                    </div>
                    {hasConfig && (
                        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saving}>
                            Reset to Default
                        </Button>
                    )}
                </div>
                <p className="text-sm text-muted-foreground">
                    Configure how the AI assistant behaves for learners in this course.
                    These settings apply to all lessons unless overridden at the lesson level.
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                    </Alert>
                )}

                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                        <p className="font-medium">Enable AI Assistant</p>
                        <p className="text-sm text-muted-foreground">
                            Allow learners to use the AI chat assistant in this course
                        </p>
                    </div>
                    <Input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={config.isEnabled}
                        onChange={(e) => setConfig(prev => ({ ...prev, isEnabled: e.target.checked }))}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System Prompt</Label>
                    <Textarea
                        id="systemPrompt"
                        rows={8}
                        placeholder="Enter the system prompt for the AI assistant..."
                        value={config.systemPrompt}
                        onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                        This prompt defines how the AI assistant behaves. The lesson context (title, transcript, objectives)
                        will be automatically appended.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label>AI Model</Label>
                        <Select
                            value={config.modelOverride || 'default'}
                            onValueChange={(value) => setConfig(prev => ({
                                ...prev,
                                modelOverride: value === 'default' ? null : value
                            }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="default">Default (gpt-4o-mini)</SelectItem>
                                <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            More capable models may provide better responses but cost more.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Temperature: {config.temperature.toFixed(1)}</Label>
                        <Slider
                            value={[config.temperature]}
                            min={0}
                            max={1}
                            step={0.1}
                            onValueChange={([value]) => setConfig(prev => ({ ...prev, temperature: value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            Lower = more focused. Higher = more creative.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="maxTokens">Max Response Tokens</Label>
                        <Input
                            id="maxTokens"
                            type="number"
                            min={100}
                            max={4000}
                            value={config.maxTokens}
                            onChange={(e) => setConfig(prev => ({
                                ...prev,
                                maxTokens: parseInt(e.target.value) || 1024
                            }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            Maximum length of AI responses.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save AI Configuration
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export default CourseAIConfig
