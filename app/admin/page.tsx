'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import { Users, BookOpen, TrendingUp, Plus, RefreshCcw } from 'lucide-react'
import type { AdminAnalyticsSummary, AdminUser, Course } from '@/types'

type RecentCourse = Pick<Course, 'id' | 'title' | 'status'> & {
    createdAt?: string | Date
}

export default function AdminDashboardPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshIndex, setRefreshIndex] = useState(0)

    const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null)
    const [recentCourses, setRecentCourses] = useState<RecentCourse[]>([])
    const [recentUsers, setRecentUsers] = useState<AdminUser[]>([])

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const [analyticsRes, coursesRes, usersRes] = await Promise.all([
                    ApiClient.getAnalytics(),
                    ApiClient.getAdminCourses({ page: 1, limit: 3 }),
                    ApiClient.getUsers({ page: 1, limit: 3 }),
                ])

                if (cancelled) return
                setSummary(analyticsRes.data)
                setRecentCourses(Array.isArray(coursesRes.data) ? coursesRes.data : [])
                setRecentUsers(Array.isArray(usersRes.data?.users) ? usersRes.data.users : [])
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        load()
        return () => {
            cancelled = true
        }
    }, [refreshIndex])

    const stats = useMemo(() => {
        return {
            totalUsers: summary?.totalUsers ?? 0,
            totalCourses: summary?.totalCourses ?? 0,
            totalEnrollments: summary?.totalEnrollments ?? 0,
            completionRate: summary?.completionRate ?? 0,
        }
    }, [summary])

    const formatShortDate = (value: string | Date | null | undefined) => {
        if (!value) return '-'
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) return '-'
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
                    <Card className="overflow-hidden">
                        <CardContent className="p-7 md:p-8">
                            <div className="space-y-4">
                                <Badge className="w-fit">Admin Workspace</Badge>
                                <div className="space-y-3">
                                    <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Admin dashboard</h1>
                                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                                        Monitor operational health, review recent activity, and manage courses, users, and training analytics from one executive view.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex space-x-2">
                        <Button
                            variant="outline"
                            onClick={() => setRefreshIndex(prev => prev + 1)}
                            disabled={loading}
                        >
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                        <Link href="/admin/courses/create">
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Course
                            </Button>
                        </Link>
                    </div>
                </div>

                {error && (
                    <div className="rounded-2xl border border-destructive/15 bg-destructive/5 p-4 text-destructive">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Total Users</CardTitle>
                            <Users className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em]">{stats.totalUsers.toLocaleString()}</div>
                            <p className="mt-2 text-sm text-muted-foreground">All accounts</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Courses</CardTitle>
                            <BookOpen className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em]">{stats.totalCourses.toLocaleString()}</div>
                            <p className="mt-2 text-sm text-muted-foreground">Total courses</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Enrollments</CardTitle>
                            <Users className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em]">{stats.totalEnrollments.toLocaleString()}</div>
                            <p className="mt-2 text-sm text-muted-foreground">Active + completed</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold">Completion Rate</CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tracking-[-0.04em]">{stats.completionRate}%</div>
                            <p className="mt-2 text-sm text-muted-foreground">Completed enrollments</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Courses</CardTitle>
                            <CardDescription>Latest courses</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {recentCourses.length ? (
                                <div className="space-y-4">
                                    {recentCourses.map(course => (
                                        <div key={course.id} className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <p className="font-medium">{course.title}</p>
                                                <div className="flex items-center space-x-4 mt-1">
                                                    <span className="text-sm text-muted-foreground">{course.status}</span>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {formatShortDate(course.createdAt)}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <Link href={`/admin/courses/${course.id}/edit`}>
                                                <Button variant="ghost" size="sm">
                                                    Edit
                                                </Button>
                                            </Link>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No courses yet</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Users</CardTitle>
                            <CardDescription>Latest registrations</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {recentUsers.length ? (
                                <div className="space-y-4">
                                    {recentUsers.map(user => (
                                        <div key={user.id} className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <span className="font-semibold text-primary">
                                                        {(user.name || user.email || '?').charAt(0)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="font-medium">{user.name || '—'}</p>
                                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium">{user.role}</p>
                                                <p className="text-xs text-muted-foreground">{formatShortDate(user.createdAt)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No users yet</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Quick actions</CardTitle>
                        <CardDescription>Common administrative tasks</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                            <Link href="/admin/courses/create">
                                <Button variant="outline" className="flex h-auto w-full flex-col py-5">
                                    <BookOpen className="h-6 w-6 mb-2" />
                                    <span>Create New Course</span>
                                </Button>
                            </Link>
                            <Link href="/admin/users">
                                <Button variant="outline" className="flex h-auto w-full flex-col py-5">
                                    <Users className="h-6 w-6 mb-2" />
                                    <span>Manage Users</span>
                                </Button>
                            </Link>
                            <Link href="/admin/analytics">
                                <Button variant="outline" className="flex h-auto w-full flex-col py-5">
                                    <TrendingUp className="h-6 w-6 mb-2" />
                                    <span>View Analytics</span>
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
