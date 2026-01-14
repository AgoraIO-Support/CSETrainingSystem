'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Bot, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

interface CourseAIConfigProps {
    courseId: string
}

interface AIConfig {
    isEnabled: boolean
}

export function CourseAIConfig({ courseId }: CourseAIConfigProps) {
    const [config, setConfig] = useState<AIConfig>({
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
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify({ isEnabled: config.isEnabled }),
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
                <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    <CardTitle>AI Learning Assistant</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">Enable or disable the AI assistant for learners in this course.</p>
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
