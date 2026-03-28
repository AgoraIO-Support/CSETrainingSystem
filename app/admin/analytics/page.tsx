'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
import type { AdminAnalyticsSummary } from '@/types'
import { formatDate } from '@/lib/utils'
import { Loader2, Users, Activity, BookOpen, Target, RefreshCcw, Laptop, Cpu, Search } from 'lucide-react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
} from 'recharts'

const RANGE_OPTIONS = [
    { label: '7 days', value: '7' },
    { label: '14 days', value: '14' },
    { label: '30 days', value: '30' },
]

export default function AdminAnalyticsPage() {
    const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null)
    const [range, setRange] = useState('14')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshIndex, setRefreshIndex] = useState(0)
    const [learnerSearch, setLearnerSearch] = useState('')

    useEffect(() => {
        let cancelled = false

        const loadAnalytics = async () => {
            setLoading(true)
            setError(null)
            try {
                const days = Number(range)
                const endDate = new Date()
                const startDate = new Date(endDate)
                startDate.setDate(startDate.getDate() - (days - 1))
                startDate.setHours(0, 0, 0, 0)
                endDate.setHours(23, 59, 59, 999)

                const response = await ApiClient.getAnalytics({
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                })
                if (cancelled) return
                setSummary(response.data)
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load analytics')
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadAnalytics()
        return () => {
            cancelled = true
        }
    }, [range, refreshIndex])

    const normalizedActivity = useMemo(() => {
        const entries = summary?.recentActivity
        if (!Array.isArray(entries)) return []

        return entries
            .map((item, index) => {
                const timestamp = new Date(item.date).getTime()
                if (Number.isNaN(timestamp)) return null

                return {
                    id: item.id || `${item.date}-${index}`,
                    date: new Date(item.date).toISOString(),
                    timestamp,
                    activeUsers: Number(item.activeUsers ?? 0),
                    newEnrollments: Number(item.newEnrollments ?? 0),
                    completedCourses: Number(item.completedCourses ?? 0),
                    totalViews: Number(item.totalViews ?? 0),
                    aiInteractions: Number(item.aiInteractions ?? 0),
                }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
    }, [summary])

    const activityData = useMemo(() => {
        return [...normalizedActivity]
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(item => ({
                date: formatDate(item.date),
                activeUsers: item.activeUsers,
                newEnrollments: item.newEnrollments,
                aiInteractions: item.aiInteractions,
                totalViews: item.totalViews,
            }))
    }, [normalizedActivity])

    const recentActivityData = useMemo(
        () => [...normalizedActivity].sort((a, b) => b.timestamp - a.timestamp),
        [normalizedActivity]
    )

    const latestActivity = recentActivityData[0]
    const filteredLearnerProgress = useMemo(() => {
        const learnerProgress = summary?.learnerProgress ?? []
        const query = learnerSearch.trim().toLowerCase()
        if (!query) return learnerProgress

        return learnerProgress.filter((learner) => {
            const userMatch =
                learner.name.toLowerCase().includes(query) ||
                learner.email.toLowerCase().includes(query)
            const courseMatch = learner.courses.some((course) => course.title.toLowerCase().includes(query))
            return userMatch || courseMatch
        })
    }, [summary?.learnerProgress, learnerSearch])

    const handleRefresh = () => {
        setRefreshIndex(prev => prev + 1)
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="space-y-2">
                        <div className="inline-flex items-center rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#006688]">
                            Operations Overview
                        </div>
                        <div>
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Analytics Overview</h1>
                            <p className="mt-1 text-sm text-slate-500">Monitor platform health, engagement signals, and learner progress trends.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <Select value={range} onValueChange={setRange}>
                            <SelectTrigger className="w-36 border-slate-200 bg-slate-50">
                                <SelectValue placeholder="Select range" />
                            </SelectTrigger>
                            <SelectContent>
                                {RANGE_OPTIONS.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]" onClick={handleRefresh} disabled={loading}>
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </div>
                </div>

                {loading && (
                    <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 shadow-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {!loading && error && (
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardContent className="py-10 text-center">
                            <p className="font-medium mb-2">Unable to load analytics</p>
                            <p className="text-sm text-muted-foreground mb-4">{error}</p>
                            <Button onClick={handleRefresh}>Try again</Button>
                        </CardContent>
                    </Card>
                )}

                {!loading && !error && summary && (
                    <div className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-600">Total Users</CardTitle>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#006688]">
                                        <Users className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-semibold tracking-tight text-slate-950">{summary.totalUsers.toLocaleString()}</div>
                                    <p className="text-xs text-slate-500">Overall learner accounts</p>
                                </CardContent>
                            </Card>
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-600">Active Users</CardTitle>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#006688]">
                                        <Activity className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-semibold tracking-tight text-slate-950">{summary.activeUsers.toLocaleString()}</div>
                                    <p className="text-xs text-slate-500">Currently active accounts</p>
                                </CardContent>
                            </Card>
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-600">Published Courses</CardTitle>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#006688]">
                                        <BookOpen className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-semibold tracking-tight text-slate-950">{summary.totalCourses.toLocaleString()}</div>
                                    <p className="text-xs text-slate-500">Live training programs</p>
                                </CardContent>
                            </Card>
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-600">Completion Rate</CardTitle>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#006688]">
                                        <Target className="h-4 w-4" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-semibold tracking-tight text-slate-950">{summary.completionRate}%</div>
                                    <p className="text-xs text-slate-500">Share of completed enrollments</p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-7">
                            <Card className="border border-slate-200 bg-white shadow-sm lg:col-span-4">
                                <CardHeader>
                                    <CardTitle className="text-slate-950">Engagement Trend</CardTitle>
                                    <CardDescription className="text-slate-500">Active users and enrollments over time</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[320px]">
                                    {activityData.length ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={activityData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <RechartsTooltip cursor={{ strokeDasharray: '4 4' }} />
                                                <Line type="monotone" dataKey="activeUsers" stroke="#006688" strokeWidth={2.5} dot={false} />
                                                <Line type="monotone" dataKey="newEnrollments" stroke="#00c2ff" strokeWidth={2.5} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                            No analytics records for this range
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm lg:col-span-3">
                                <CardHeader>
                                    <CardTitle className="text-slate-950">AI & Platform Usage</CardTitle>
                                    <CardDescription className="text-slate-500">Daily AI interactions vs. total views</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[320px]">
                                    {activityData.length ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={activityData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <RechartsTooltip />
                                                <Bar dataKey="totalViews" fill="#006688" radius={[6, 6, 0, 0]} />
                                                <Bar dataKey="aiInteractions" fill="#00c2ff" radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                            No analytics records for this range
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-slate-950">Latest Snapshot</CardTitle>
                                            <CardDescription className="text-slate-500">Most recent analytics record</CardDescription>
                                        </div>
                                        {latestActivity && (
                                            <p className="text-xs text-slate-500">{formatDate(latestActivity.date)}</p>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {latestActivity ? (
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div className="flex items-center space-x-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <Users className="h-4 w-4 text-[#006688]" />
                                                <div>
                                                    <p className="text-xs text-slate-500">Active Users</p>
                                                    <p className="font-semibold text-slate-950">{latestActivity.activeUsers.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <BookOpen className="h-4 w-4 text-[#006688]" />
                                                <div>
                                                    <p className="text-xs text-slate-500">New Enrollments</p>
                                                    <p className="font-semibold text-slate-950">{latestActivity.newEnrollments.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <Target className="h-4 w-4 text-[#006688]" />
                                                <div>
                                                    <p className="text-xs text-slate-500">Completed Courses</p>
                                                    <p className="font-semibold text-slate-950">{latestActivity.completedCourses.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <Laptop className="h-4 w-4 text-[#006688]" />
                                                <div>
                                                    <p className="text-xs text-slate-500">Total Views</p>
                                                    <p className="font-semibold text-slate-950">{latestActivity.totalViews.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="col-span-2 flex items-center space-x-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <Cpu className="h-4 w-4 text-[#006688]" />
                                                <div>
                                                    <p className="text-xs text-slate-500">AI Interactions</p>
                                                    <p className="font-semibold text-slate-950">{latestActivity.aiInteractions.toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No analytics entries recorded yet.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-950">Recent Activity</CardTitle>
                                    <CardDescription className="text-slate-500">Chronological view of analytics entries</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                                        {recentActivityData.map(entry => (
                                            <div
                                                key={entry.id}
                                                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm"
                                            >
                                                <div>
                                                    <p className="font-medium text-slate-900">{formatDate(entry.date)}</p>
                                                    <p className="text-xs text-slate-500">
                                                        {entry.newEnrollments.toLocaleString()} new enrollments ·{' '}
                                                        {entry.aiInteractions.toLocaleString()} AI requests
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-slate-950">{entry.activeUsers.toLocaleString()} active</p>
                                                    <p className="text-xs text-slate-500">
                                                        {entry.completedCourses.toLocaleString()} completions
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        {!recentActivityData.length && (
                                            <p className="text-sm text-muted-foreground">No analytics records found.</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <CardTitle className="text-slate-950">Learner Progress</CardTitle>
                                        <CardDescription className="text-slate-500">
                                            Review each learner&apos;s enrolled courses and per-course completion progress
                                        </CardDescription>
                                    </div>
                                    <div className="relative w-full sm:w-80">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            value={learnerSearch}
                                            onChange={(event) => setLearnerSearch(event.target.value)}
                                            placeholder="Search learner or course"
                                            className="border-slate-200 bg-slate-50 pl-9"
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {filteredLearnerProgress.length === 0 ? (
                                    <div className="py-10 text-center text-sm text-muted-foreground">
                                        No learner progress records match the current search.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredLearnerProgress.map((learner) => (
                                            <details
                                                key={learner.userId}
                                                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                                                open={filteredLearnerProgress.length <= 3}
                                            >
                                                <summary className="cursor-pointer list-none">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="font-semibold text-slate-950">{learner.name}</p>
                                                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">{learner.status}</Badge>
                                                            </div>
                                                            <p className="text-sm text-slate-500">{learner.email}</p>
                                                            <p className="text-xs text-slate-500">
                                                                Last login: {learner.lastLoginAt ? formatDate(learner.lastLoginAt) : 'No login yet'}
                                                            </p>
                                                        </div>
                                                        <div className="grid gap-3 text-sm sm:grid-cols-3">
                                                            <div>
                                                                <p className="text-xs text-slate-500">Enrollments</p>
                                                                <p className="font-semibold text-slate-950">{learner.enrollmentCount}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-slate-500">Completed</p>
                                                                <p className="font-semibold text-slate-950">{learner.completedCourses}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-slate-500">Average progress</p>
                                                                <p className="font-semibold text-slate-950">{learner.averageProgress}%</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </summary>

                                                <div className="mt-4 space-y-3">
                                                    {learner.courses.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground">This learner has no enrollments yet.</p>
                                                    ) : (
                                                        learner.courses.map((course) => (
                                                            <div
                                                                key={`${learner.userId}-${course.courseId}`}
                                                                className="rounded-2xl border border-slate-200 bg-white p-3"
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <p className="font-medium text-slate-900">{course.title}</p>
                                                                            <Badge variant="secondary" className="rounded-full border border-slate-200 bg-slate-50 text-slate-600">{course.status}</Badge>
                                                                        </div>
                                                                        <div className="mt-2">
                                                                            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                                                                                <span>Progress</span>
                                                                                <span>{course.progress}%</span>
                                                                            </div>
                                                                            <Progress value={course.progress} className="h-2 bg-slate-200" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right text-xs text-slate-500">
                                                                        <p>Enrolled {formatDate(course.enrolledAt)}</p>
                                                                        <p>
                                                                            Last active {course.lastAccessedAt ? formatDate(course.lastAccessedAt) : 'N/A'}
                                                                        </p>
                                                                        <p>
                                                                            Completed {course.completedAt ? formatDate(course.completedAt) : 'Not yet'}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
