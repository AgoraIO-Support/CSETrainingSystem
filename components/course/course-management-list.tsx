'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiClient } from '@/lib/api-client'
import { Search, Plus, Edit, Trash2, Eye, Loader2, Send } from 'lucide-react'
import type { Course } from '@/types'

type CourseManagementListVariant = 'admin' | 'sme'
type UserRole = 'ADMIN' | 'SME' | 'USER' | null

interface CourseManagementListProps {
    variant: CourseManagementListVariant
    pageTitle: string
    pageDescription: string
    listTitle: string
    listDescription: string
}

export function CourseManagementList({
    variant,
    pageTitle,
    pageDescription,
    listTitle,
    listDescription,
}: CourseManagementListProps) {
    const [courses, setCourses] = useState<Course[]>([])
    const [currentUserRole, setCurrentUserRole] = useState<UserRole>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [errorDialogMessage, setErrorDialogMessage] = useState('')

    useEffect(() => {
        const loadUser = async () => {
            try {
                const response = await ApiClient.getMe()
                setCurrentUserRole(response.data.role)
            } catch {
                setCurrentUserRole(null)
            }
        }

        void loadUser()
    }, [])

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

            void loadCourses()
        }, 250)

        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [searchQuery])

    const filteredCourses = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()

        return courses.filter((course) =>
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
            setCourses((current) => current.filter((course) => course.id !== courseId))
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete course'
            setErrorDialogMessage(message)
            setErrorDialogOpen(true)
        }
    }

    const getCreateHref = () => {
        if (variant === 'sme' || currentUserRole === 'SME') {
            return '/admin/courses/create?sme=1'
        }

        return '/admin/courses/create'
    }

    const getViewHref = (course: Course) => {
        if (variant === 'sme' || currentUserRole === 'SME') {
            return `/sme/training-ops/courses/${course.id}`
        }

        return course.status === 'PUBLISHED' ? `/courses/${course.slug || course.id}` : `/admin/courses/${course.id}/edit`
    }

    const getEditHref = (course: Course) => {
        const isSmeMode = variant === 'sme' || currentUserRole === 'SME'
        return `/admin/courses/${course.id}/edit${isSmeMode ? '?sme=1' : ''}`
    }

    const getInvitationsHref = (course: Course) => {
        const isSmeMode = variant === 'sme' || currentUserRole === 'SME'
        return `/admin/courses/${course.id}/invitations${isSmeMode ? '?sme=1' : ''}`
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{pageTitle}</h1>
                    <p className="mt-1 text-muted-foreground">{pageDescription}</p>
                </div>
                <Link href={getCreateHref()}>
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
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
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Managed Courses</CardDescription>
                        <CardTitle className="text-3xl">{courses.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Draft</CardDescription>
                        <CardTitle className="text-3xl">
                            {courses.filter((course) => course.status === 'DRAFT').length}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Published</CardDescription>
                        <CardTitle className="text-3xl">
                            {courses.filter((course) => course.status === 'PUBLISHED').length}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{listTitle} ({courses.length})</CardTitle>
                    <CardDescription>{listDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : filteredCourses.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            No courses match your search.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {filteredCourses.map((course) => (
                                <div
                                    key={course.id}
                                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
                                >
                                    <div className="flex flex-1 items-center space-x-4">
                                        <Image
                                            src={course.thumbnail || 'https://placehold.co/320x180/0f172a/ffffff?text=Course'}
                                            alt={course.title}
                                            width={80}
                                            height={56}
                                            className="h-14 w-20 rounded object-cover"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant={
                                                        course.status === 'PUBLISHED'
                                                            ? 'default'
                                                            : course.status === 'DRAFT'
                                                              ? 'outline'
                                                              : 'destructive'
                                                    }
                                                >
                                                    {course.status}
                                                </Badge>
                                                <h4 className="font-semibold">{course.title}</h4>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                                <span className="text-muted-foreground">{course.instructor?.name}</span>
                                                <Badge variant="outline">{course.category}</Badge>
                                                <Badge variant="secondary">{course.level}</Badge>
                                            </div>
                                            <div className="mt-2 flex items-center space-x-4 text-sm text-muted-foreground">
                                                <span>{course.enrolledCount.toLocaleString()} students</span>
                                                <span>⭐ {course.rating}</span>
                                                <span>{course.chapters?.length ?? 0} chapters</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <Link href={getViewHref(course)}>
                                            <Button variant="ghost" size="icon" title="Open course">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </Link>

                                        {course.status === 'PUBLISHED' ? (
                                            <Link href={getInvitationsHref(course)}>
                                                <Button variant="ghost" size="icon" title="Manage invitations">
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        ) : (
                                            <Button variant="ghost" size="icon" title="Publish course first" disabled>
                                                <Send className="h-4 w-4" />
                                            </Button>
                                        )}

                                        <Link href={getEditHref(course)}>
                                            <Button variant="ghost" size="icon" title="Open course editor">
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                        </Link>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 hover:text-red-600"
                                            title="Delete course"
                                            onClick={() => handleDelete(course.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={(open) => {
                    setConfirmDeleteOpen(open)
                    if (!open) {
                        setPendingDeleteId(null)
                    }
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
        </div>
    )
}
