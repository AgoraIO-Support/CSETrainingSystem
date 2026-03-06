'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiClient } from '@/lib/api-client'
import { Search, Plus, Edit, Trash2, Eye, Loader2, Send } from 'lucide-react'
import Link from 'next/link'
import type { Course } from '@/types'

export default function AdminCoursesPage() {
    const [courses, setCourses] = useState<Course[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [errorDialogMessage, setErrorDialogMessage] = useState('')

    useEffect(() => {
        let cancelled = false
        const timeout = window.setTimeout(() => {
            const loadCourses = async () => {
                setLoading(true)
                setError(null)
                try {
                    const query = searchQuery.trim()
                    const response = await ApiClient.getAdminCourses({
                        limit: 200,
                        status: 'ALL',
                        search: query ? query : undefined,
                    })
                    if (!cancelled) {
                        setCourses(response.data)
                    }
                } catch (err) {
                    if (!cancelled) {
                        setError(err instanceof Error ? err.message : 'Failed to load courses')
                    }
                } finally {
                    if (!cancelled) {
                        setLoading(false)
                    }
                }
            }

            loadCourses()
        }, 250)

        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [searchQuery])

    const filteredCourses = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()
        return courses.filter(course =>
            !query ||
            course.title.toLowerCase().includes(query) ||
            course.category.toLowerCase().includes(query) ||
            course.instructor?.name?.toLowerCase().includes(query)
        )
    }, [courses, searchQuery])

    const handleDelete = (courseId: string) => {
        setPendingDeleteId(courseId)
        setConfirmDeleteOpen(true)
    }

    const confirmDelete = async () => {
        const courseId = pendingDeleteId
        if (!courseId) {
            setConfirmDeleteOpen(false)
            return
        }
        setConfirmDeleteOpen(false)
        setPendingDeleteId(null)

        try {
            await ApiClient.deleteCourse(courseId)
            setCourses(prev => prev.filter(course => course.id !== courseId))
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete course'
            setErrorDialogMessage(message)
            setErrorDialogOpen(true)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Course Management</h1>
                        <p className="text-muted-foreground mt-1">
                            Create and manage training courses
                        </p>
                    </div>
                    <Link href="/admin/courses/create">
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Course
                        </Button>
                    </Link>
                </div>

                <Card>
                    <CardContent className="p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search courses..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>All Courses ({courses.length})</CardTitle>
                        <CardDescription>Manage your course library</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-12">
                                <p className="font-medium mb-2">Unable to load courses</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredCourses.map(course => (
                                    <div
                                        key={course.id}
                                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                                    >
                                        <div className="flex items-center space-x-4 flex-1">
                                            <img
                                                src={
                                                    course.thumbnail ||
                                                    'https://placehold.co/320x180/0f172a/ffffff?text=Course'
                                                }
                                                alt={course.title}
                                                className="w-20 h-14 object-cover rounded"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={course.status === 'PUBLISHED' ? 'default' : course.status === 'DRAFT' ? 'outline' : 'destructive'}>
                                                        {course.status}
                                                    </Badge>
                                                    <h4 className="font-semibold">{course.title}</h4>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                                                    <span className="text-muted-foreground">
                                                        {course.instructor?.name}
                                                    </span>
                                                    <Badge variant="outline">{course.category}</Badge>
                                                    <Badge variant="secondary">{course.level}</Badge>
                                                </div>
                                                <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                                                    <span>{course.enrolledCount.toLocaleString()} students</span>
                                                    <span>⭐ {course.rating}</span>
                                                    <span>{course.chapters?.length ?? 0} chapters</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Link href={`/courses/${course.slug || course.id}`}>
                                                <Button variant="ghost" size="icon">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            {course.status === 'PUBLISHED' ? (
                                                <Link href={`/admin/courses/${course.id}/invitations`}>
                                                    <Button variant="ghost" size="icon" title="Manage Invitations">
                                                        <Send className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Publish course first"
                                                    disabled
                                                >
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Link href={`/admin/courses/${course.id}/edit`}>
                                                <Button variant="ghost" size="icon">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600"
                                                onClick={() => handleDelete(course.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {filteredCourses.length === 0 && (
                                    <p className="text-center text-sm text-muted-foreground py-8">
                                        No courses match your search.
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={(open) => {
                    setConfirmDeleteOpen(open)
                    if (!open) setPendingDeleteId(null)
                }}
                title="Delete course?"
                description="This action cannot be undone."
                confirmLabel="Delete"
                confirmVariant="destructive"
                onConfirm={confirmDelete}
            />
            <ConfirmDialog
                open={errorDialogOpen}
                onOpenChange={setErrorDialogOpen}
                title="Unable to delete course"
                description={errorDialogMessage}
                confirmLabel="OK"
                showCancel={false}
                onConfirm={() => setErrorDialogOpen(false)}
            />
        </DashboardLayout>
    )
}
