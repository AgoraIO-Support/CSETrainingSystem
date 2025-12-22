'use client'

import { useState, useEffect, use } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    Download,
    Users,
    Trophy,
    TrendingUp,
    Clock,
    Target,
    Award,
    XCircle,
    BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamAnalytics } from '@/types'

type PageProps = {
    params: Promise<{ id: string }>
}

interface LeaderboardEntry {
    rank: number
    userId: string
    userName: string
    score: number
    percentageScore: number
    completedAt: string
}

export default function ExamAnalyticsPage({ params }: PageProps) {
    const { id: examId } = use(params)
    const [exam, setExam] = useState<Exam | null>(null)
    const [analytics, setAnalytics] = useState<ExamAnalytics | null>(null)
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        loadData()
    }, [examId])

    const loadData = async () => {
        setLoading(true)
        try {
            const [examRes, analyticsRes, leaderboardRes] = await Promise.all([
                ApiClient.getAdminExam(examId),
                ApiClient.getExamAnalytics(examId),
                ApiClient.getExamLeaderboard(examId, 10),
            ])
            setExam(examRes.data)
            setAnalytics(analyticsRes.data)
            // Backward/forward compatible: some API versions return `{ leaderboard: [...] }`.
            const leaderboardData: any = (leaderboardRes as any)?.data
            const nextLeaderboard = Array.isArray(leaderboardData)
                ? leaderboardData
                : Array.isArray(leaderboardData?.leaderboard)
                    ? leaderboardData.leaderboard
                    : []
            setLeaderboard(nextLeaderboard)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load analytics')
        } finally {
            setLoading(false)
        }
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            const blob = await ApiClient.exportExamResults(examId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `exam-analytics-${examId}.csv`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export')
        } finally {
            setExporting(false)
        }
    }

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return '-'
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    const formatDuration = (minutes: number | null | undefined) => {
        if (!minutes || minutes <= 0) return '-'
        if (minutes < 1) return '<1m'
        if (minutes < 60) return `${Math.round(minutes)}m`
        const hours = Math.floor(minutes / 60)
        const mins = Math.round(minutes % 60)
        return `${hours}h ${mins}m`
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        )
    }

    if (!exam || !analytics) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <p className="text-muted-foreground">
                        {error || 'No analytics data available'}
                    </p>
                    <Link href="/admin/exams">
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const passDenom = analytics.passCount + analytics.failCount
    const passRate = passDenom > 0 ? Math.round((analytics.passCount / passDenom) * 100) : 0

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/exams">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Exam Analytics</h1>
                            <p className="text-muted-foreground mt-1">{exam.title}</p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={handleExport} disabled={exporting}>
                        {exporting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        Export Report
                    </Button>
                </div>

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {/* Key Metrics */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{analytics.totalAttempts}</div>
                            <p className="text-xs text-muted-foreground">
                                {analytics.uniqueUsers} unique users
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                            <Target className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{passRate}%</div>
                            <Progress value={passRate} className="mt-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                                {analytics.passCount} passed, {analytics.failCount} failed
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{Math.round(analytics.avgScore)}%</div>
                            <p className="text-xs text-muted-foreground">
                                Median: {analytics.medianScore ? `${Math.round(analytics.medianScore)}%` : '-'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Avg. Completion Time</CardTitle>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatDuration(analytics.avgCompletionTime)}
                            </div>
                            {exam.timeLimit && (
                                <p className="text-xs text-muted-foreground">
                                    Time limit: {exam.timeLimit}m
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Score Distribution */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5" />
                                Score Summary
                            </CardTitle>
                            <CardDescription>Score range statistics</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="text-sm text-muted-foreground">Highest Score</p>
                                    <p className="text-xl font-bold text-green-600">
                                        {analytics.highestScore}%
                                    </p>
                                </div>
                                <Trophy className="h-8 w-8 text-yellow-500" />
                            </div>

                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="text-sm text-muted-foreground">Average Score</p>
                                    <p className="text-xl font-bold">
                                        {Math.round(analytics.avgScore)}%
                                    </p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-blue-500" />
                            </div>

                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="text-sm text-muted-foreground">Lowest Score</p>
                                    <p className="text-xl font-bold text-red-600">
                                        {analytics.lowestScore}%
                                    </p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-red-500 rotate-180" />
                            </div>

                            <div className="p-3 border rounded-lg">
                                <p className="text-sm text-muted-foreground mb-2">Passing Score</p>
                                <div className="flex items-center gap-2">
                                    <Progress
                                        value={(exam.passingScore / exam.totalScore) * 100}
                                        className="flex-1"
                                    />
                                    <span className="text-sm font-medium">
                                        {exam.passingScore}/{exam.totalScore}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Leaderboard */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Award className="h-5 w-5" />
                                Top Performers
                            </CardTitle>
                            <CardDescription>Highest scoring participants</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {leaderboard.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    No completed attempts yet
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {leaderboard.map((entry, index) => (
                                        <div
                                            key={entry.userId}
                                            className={`flex items-center justify-between p-3 rounded-lg ${
                                                index === 0
                                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                                                    : index === 1
                                                        ? 'bg-gray-50 dark:bg-gray-800/50 border'
                                                        : index === 2
                                                            ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                                                            : 'border'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                                    index === 0
                                                        ? 'bg-yellow-200 text-yellow-800'
                                                        : index === 1
                                                            ? 'bg-gray-200 text-gray-800'
                                                            : index === 2
                                                                ? 'bg-orange-200 text-orange-800'
                                                                : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {entry.rank}
                                                </span>
                                                <div>
                                                    <p className="font-medium">{entry.userName}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatDate(entry.completedAt)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge variant={index < 3 ? 'default' : 'secondary'}>
                                                {entry.percentageScore}%
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            <Link href={`/admin/exams/${examId}/attempts`}>
                                <Button variant="outline">
                                    <Users className="h-4 w-4 mr-2" />
                                    View All Attempts
                                </Button>
                            </Link>
                            <Link href={`/admin/exams/${examId}/questions`}>
                                <Button variant="outline">
                                    <BarChart3 className="h-4 w-4 mr-2" />
                                    Manage Questions
                                </Button>
                            </Link>
                            <Link href={`/admin/exams/${examId}/invitations`}>
                                <Button variant="outline">
                                    <Users className="h-4 w-4 mr-2" />
                                    Manage Invitations
                                </Button>
                            </Link>
                            <Link href={`/admin/exams/${examId}/edit`}>
                                <Button variant="outline">
                                    Edit Exam Settings
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground text-center">
                    Last updated: {formatDate(analytics.lastUpdatedAt)}
                </p>
            </div>
        </DashboardLayout>
    )
}
