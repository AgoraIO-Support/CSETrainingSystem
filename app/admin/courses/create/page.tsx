'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiClient } from '@/lib/api-client'
import type { CourseLevel } from '@/types'
import Link from 'next/link'

const levels: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']

export default function CreateCoursePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [instructors, setInstructors] = useState<Array<{ id: string; name: string }>>([])

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

    useEffect(() => {
        let mounted = true
        ApiClient.getInstructors()
            .then(res => {
                if (mounted) {
                    const list = res.data.map(instr => ({ id: instr.id, name: instr.name }))
                    setInstructors(list)
                    if (list.length > 0) {
                        setForm(prev => (prev.instructorId ? prev : { ...prev, instructorId: list[0].id }))
                    }
                }
            })
            .catch(err => {
                console.error('Failed to load instructors', err)
            })
        return () => {
            mounted = false
        }
    }, [])

    const handleChange = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
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
                learningOutcomes: form.learningOutcomes
                    .split('\n')
                    .map(item => item.trim())
                    .filter(Boolean),
                requirements: form.requirements
                    .split('\n')
                    .map(item => item.trim())
                    .filter(Boolean),
                instructorId: form.instructorId,
                status: form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
            }

            await ApiClient.createCourse(payload)
            setSuccess('Course created successfully')
            setTimeout(() => router.push('/admin/courses'), 1200)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else if (typeof err === 'object' && err !== null && 'error' in err) {
                const apiError = err as { error?: { message?: string } }
                setError(apiError.error?.message || 'Failed to create course')
            } else {
                setError('Failed to create course')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <Card className="max-w-3xl mx-auto">
                <CardHeader>
                    <CardTitle>Create Course</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="title">Title</Label>
                                <Input id="title" value={form.title} onChange={e => handleChange('title', e.target.value)} required />
                            </div>
                            <div>
                                <Label htmlFor="slug">Slug</Label>
                                <Input id="slug" value={form.slug} onChange={e => handleChange('slug', e.target.value)} required />
                            </div>
                        </div>

                        <div>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="thumbnail">Thumbnail URL</Label>
                                <Input id="thumbnail" value={form.thumbnail} onChange={e => handleChange('thumbnail', e.target.value)} />
                            </div>
                            <div>
                                <Label htmlFor="category">Category</Label>
                                <Input id="category" value={form.category} onChange={e => handleChange('category', e.target.value)} required />
                            </div>

                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
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
                            <div>
                                <Label>Status</Label>
                                <Select value={form.status} onValueChange={value => handleChange('status', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PUBLISHED">Published</SelectItem>
                                        <SelectItem value="DRAFT">Draft</SelectItem>
                                        <SelectItem value="ARCHIVED">Archived</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label>Instructor</Label>
                            <Select
                                value={form.instructorId}
                                onValueChange={value => handleChange('instructorId', value)}
                                disabled={instructors.length === 0}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={instructors.length ? 'Select instructor' : 'No instructors available'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {instructors.map(instr => (
                                        <SelectItem key={instr.id} value={instr.id}>
                                            {instr.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {instructors.length === 0 && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    No instructors found. Make sure at least one admin/instructor account exists.
                                </p>
                            )}
                        </div>
                        <div>
                            <Label htmlFor="tags">Tags (comma separated)</Label>
                            <Input id="tags" value={form.tags} onChange={e => handleChange('tags', e.target.value)} />
                        </div>

                        {error && <p className="text-sm text-destructive">{error}</p>}
                        {success && <p className="text-sm text-green-600">{success}</p>}

                        <div className="flex items-center space-x-3">
                            <Button type="submit" disabled={loading || !form.instructorId}>
                                {loading ? 'Creating...' : 'Create Course'}
                            </Button>
                            <Link href="/admin/courses">
                                <Button type="button" variant="outline">
                                    Cancel
                                </Button>
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </DashboardLayout>
    )
}
