'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
import type { UserProgressOverview } from '@/types'
import { formatDate } from '@/lib/utils'
import {
    Loader2,
    TrendingUp,
    CheckCircle2,
    BookOpen,
    Clock,
    RefreshCcw,
    Play,
    CalendarDays,
    Award,
    Download,
} from 'lucide-react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    Tooltip as RechartsTooltip,
    YAxis,
} from 'recharts'

export default function ProgressPage() {
    const [overview, setOverview] = useState<UserProgressOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshIndex, setRefreshIndex] = useState(0)

    useEffect(() => {
        let cancelled = false

        const loadOverview = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await ApiClient.getProgressOverview()
                if (cancelled) return
                setOverview(response.data)
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load progress overview')
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadOverview()
        return () => {
            cancelled = true
        }
    }, [refreshIndex])

    const activityChartData = useMemo(() => {
        if (!overview) return []
        return [...overview.recentActivity]
            .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
            .map(entry => ({
                date: formatDate(entry.updatedAt),
                minutes: Math.round(entry.watchedDuration / 60),
            }))
    }, [overview])

    const handleRefresh = () => setRefreshIndex(prev => prev + 1)

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Progress</h1>
                        <p className="text-muted-foreground mt-1">Track your learning journey and resume where you left off</p>
                    </div>
                    <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {!loading && error && (
                    <Card>
                        <CardContent className="py-10 text-center">
                            <p className="font-medium mb-2">Unable to load progress details</p>
                            <p className="text-sm text-muted-foreground mb-4">{error}</p>
                            <Button onClick={handleRefresh}>Try again</Button>
                        </CardContent>
                    </Card>
                )}

                {!loading && !error && overview && (
                    <div className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                title="Enrolled courses"
                                value={overview.stats.totalEnrolled.toLocaleString()}
                                icon={BookOpen}
                                helper="Courses you are actively enrolled in"
                            />
                            <StatCard
                                title="Completed"
                                value={overview.stats.completedCourses.toLocaleString()}
                                icon={CheckCircle2}
                                helper="Courses fully completed"
                            />
                            <StatCard
                                title="In progress"
                                value={overview.stats.inProgressCourses.toLocaleString()}
                                icon={TrendingUp}
                                helper="Currently active courses"
                            />
                            <StatCard
                                title="Learning hours"
                                value={`${overview.stats.hoursLearned.toFixed(1)}`}
                                icon={Clock}
                                helper="Total time spent learning"
                            />
                        </div>

                        <div className="grid gap-6 lg:grid-cols-5">
                            <Card className="lg:col-span-3">
                                <CardHeader>
                                    <CardTitle>Study Activity</CardTitle>
                                    <CardDescription>Minutes watched per session</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px]">
                                    {activityChartData.length ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={activityChartData}>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                                <RechartsTooltip />
                                                <Line type="monotone" dataKey="minutes" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                            No recent activity logged yet.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Recent Activity</CardTitle>
                                    <CardDescription>Latest lessons you interacted with</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                                        {overview.recentActivity.map(entry => (
                                            <div key={entry.id} className="rounded-lg border p-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium">{entry.lessonTitle}</p>
                                                    <span className="text-xs text-muted-foreground">{formatDate(entry.updatedAt)}</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">{entry.courseTitle}</p>
                                                <div className="flex items-center justify-between text-xs mt-2">
                                                    <span className="flex items-center gap-1">
                                                        <Play className="h-3 w-3" />
                                                        {Math.round(entry.watchedDuration / 60)} min watched
                                                    </span>
                                                    <Badge variant={entry.completed ? 'default' : 'outline'}>
                                                        {entry.completed ? 'Completed' : 'In progress'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                        {!overview.recentActivity.length && (
                                            <p className="text-sm text-muted-foreground">No lessons started yet.</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Courses</CardTitle>
                                <CardDescription>Resume courses you are enrolled in</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {overview.courses.length ? (
                                        overview.courses.map(course => (
                                            <div
                                                key={course.courseId}
                                                className="flex flex-col md:flex-row md:items-center justify-between gap-4 border rounded-lg p-4"
                                            >
                                                <div>
                                                    <p className="font-semibold">{course.title}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {course.instructorName} · {course.category} · {course.level}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <Badge variant={course.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                                            {course.status === 'COMPLETED' ? 'Completed' : 'In progress'}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            Last accessed {course.lastAccessedAt ? formatDate(course.lastAccessedAt) : 'N/A'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-full md:w-64">
                                                    <div className="flex items-center justify-between text-sm mb-1">
                                                        <span>Progress</span>
                                                        <span className="font-medium">{course.progress}%</span>
                                                    </div>
                                                    <Progress value={course.progress} />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">You have not enrolled in any courses yet.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Upcoming Targets</CardTitle>
                                    <CardDescription>Suggested completion targets based on enrollment dates</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                                        {overview.upcomingDeadlines.length ? (
                                            overview.upcomingDeadlines.map(deadline => {
                                                const daysLeft = Math.max(
                                                    0,
                                                    Math.ceil(
                                                        (new Date(deadline.deadline).getTime() - Date.now()) /
                                                            (1000 * 60 * 60 * 24)
                                                    )
                                                )
                                                return (
                                                    <div key={deadline.courseId} className="rounded-lg border p-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="font-medium">{deadline.title}</p>
                                                        <Badge variant="outline">
                                                            <CalendarDays className="h-3 w-3 mr-1" />
                                                            {formatDate(deadline.deadline)}
                                                        </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mb-2">
                                                            {deadline.status === 'COMPLETED'
                                                                ? 'Completed'
                                                                : `${daysLeft} days remaining`}
                                                        </p>
                                                        <div className="flex items-center justify-between text-sm">
                                                            <div className="w-40">
                                                                <div className="flex items-center justify-between text-xs mb-1">
                                                                    <span>Progress</span>
                                                                    <span className="font-medium">
                                                                        {deadline.progress}%
                                                                    </span>
                                                                </div>
                                                                <Progress value={deadline.progress} />
                                                            </div>
                                                            {deadline.status !== 'COMPLETED' && (
                                                                <Badge variant="secondary">In progress</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No upcoming targets. Enroll in a course to get started!
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Certificates</CardTitle>
                                    <CardDescription>Download proof of completion for finished courses</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                                        {overview.certificates.length ? (
                                            overview.certificates.map(cert => (
                                                <div key={cert.id} className="rounded-lg border p-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="font-medium">{cert.courseTitle}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                Issued {formatDate(cert.issueDate)}
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline">
                                                            <Award className="h-3 w-3 mr-1" />
                                                            {cert.certificateNumber}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {cert.instructorName ? `Instructor: ${cert.instructorName}` : ''}
                                                    </p>
                                                    {cert.pdfUrl ? (
                                                        <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                                                            <a href={cert.pdfUrl} target="_blank" rel="noreferrer">
                                                                <Download className="h-4 w-4 mr-2" />
                                                                Download PDF
                                                            </a>
                                                        </Button>
                                                    ) : (
                                                        <p className="text-xs text-muted-foreground mt-2">
                                                            PDF not available for this certificate.
                                                        </p>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                Complete a course to generate your first certificate.
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}

interface StatCardProps {
    title: string
    value: string
    icon: React.ComponentType<{ className?: string }>
    helper: string
}

function StatCard({ title, value, icon: Icon, helper }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{helper}</p>
            </CardContent>
        </Card>
    )
}
