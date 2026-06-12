'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ApiClient } from '@/lib/api-client'
import type { TrainingOpsAdminReport, TrainingOpsLearnerRiskStatus, TrainingOpsReportRange } from '@/types'
import {
    AlertTriangle,
    Award,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    Download,
    FileText,
    Loader2,
    Settings2,
    Search,
    ShieldAlert,
    Target,
    Trophy,
    Users,
} from 'lucide-react'

const riskTone: Record<TrainingOpsLearnerRiskStatus, string> = {
    ON_TRACK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    WATCH: 'border-amber-200 bg-amber-50 text-amber-700',
    AT_RISK: 'border-rose-200 bg-rose-50 text-rose-700',
    NO_ASSIGNMENT: 'border-slate-200 bg-slate-100 text-slate-700',
}

const domainTone: Record<TrainingOpsAdminReport['domainProgress'][number]['status'], string> = {
    ON_TRACK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    MONITOR: 'border-amber-200 bg-amber-50 text-amber-700',
    AT_RISK: 'border-rose-200 bg-rose-50 text-rose-700',
    INSUFFICIENT_DATA: 'border-slate-200 bg-slate-100 text-slate-700',
}

const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return 'No activity'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'No activity'
    return date.toLocaleDateString()
}

const formatStatus = (value: string) => value.replaceAll('_', ' ')

const RANGE_OPTIONS: Array<{ value: TrainingOpsReportRange; label: string }> = [
    { value: '30d', label: 'Past 1 month' },
    { value: '90d', label: 'Past 3 months' },
    { value: '180d', label: 'Past 6 months' },
    { value: '365d', label: 'Past year' },
    { value: 'ytd', label: 'This year' },
    { value: 'all', label: 'All time' },
]

const exportLearnersCsv = (report: TrainingOpsAdminReport) => {
    const headers = [
        'Name',
        'Email',
        'Department',
        'Risk',
        'Course Assigned',
        'Course Completed',
        'Course Progress',
        'Exam Invitations',
        'Exam Attempts',
        'Pass Rate',
        'Average Score',
        'Best Score',
        'Certificates',
        'Retake Needed',
        'Overdue Exams',
        'Last Activity',
    ]
    const rows = report.learnerPerformance.map((learner) => [
        learner.name,
        learner.email,
        learner.department ?? '',
        learner.riskStatus,
        learner.courseAssigned,
        learner.courseCompleted,
        `${learner.averageCourseProgress}%`,
        learner.examInvitations,
        learner.examAttempts,
        `${learner.passRate}%`,
        `${learner.averageScore}%`,
        `${learner.bestScore}%`,
        learner.certificates,
        learner.retakeNeeded,
        learner.overdueExams,
        learner.lastActivityAt ? new Date(learner.lastActivityAt).toISOString() : '',
    ])
    const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `training-ops-learners-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

function MetricCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'default',
}: {
    label: string
    value: string | number
    hint: string
    icon: typeof Users
    tone?: 'default' | 'risk' | 'success'
}) {
    const iconTone = tone === 'risk'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-[#006688]'

    return (
        <Card className="border border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div>
                    <CardDescription className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {label}
                    </CardDescription>
                    <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                        {value}
                    </CardTitle>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconTone}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm leading-6 text-slate-500">{hint}</p>
            </CardContent>
        </Card>
    )
}

export default function TrainingOpsDashboardPage() {
    const [report, setReport] = useState<TrainingOpsAdminReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [learnerSearch, setLearnerSearch] = useState('')
    const [range, setRange] = useState<TrainingOpsReportRange>('30d')
    const [includeAdmins, setIncludeAdmins] = useState(true)
    const [excludedUserIds, setExcludedUserIds] = useState<string[]>([])
    const [filterDialogOpen, setFilterDialogOpen] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getTrainingOpsAdminReport({
                    range,
                    includeAdmins,
                    excludeUserIds: excludedUserIds,
                })
                setReport(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load training operations report')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [range, includeAdmins, excludedUserIds])

    const filteredLearners = useMemo(() => {
        if (!report) return []
        const query = learnerSearch.trim().toLowerCase()
        if (!query) return report.learnerPerformance
        return report.learnerPerformance.filter((learner) =>
            learner.name.toLowerCase().includes(query) ||
            learner.email.toLowerCase().includes(query) ||
            learner.department?.toLowerCase().includes(query) ||
            learner.title?.toLowerCase().includes(query) ||
            learner.riskStatus.toLowerCase().includes(query)
        )
    }, [learnerSearch, report])

    const activeFilterCount = (includeAdmins ? 1 : 0) + excludedUserIds.length

    const toggleExcludedUser = (userId: string, checked: boolean) => {
        setExcludedUserIds((prev) =>
            checked ? [...prev, userId] : prev.filter((id) => id !== userId)
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-4xl space-y-3">
                        <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                            Admin · Training Ops
                        </Badge>
                        <div>
                            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 md:text-4xl">
                                Team readiness and learner performance
                            </h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Select value={range} onValueChange={(value) => setRange(value as TrainingOpsReportRange)}>
                            <SelectTrigger className="w-40 border-slate-200 bg-slate-50">
                                <SelectValue placeholder="Select range" />
                            </SelectTrigger>
                            <SelectContent>
                                {RANGE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="border-slate-200 bg-slate-50">
                                    <Settings2 className="mr-2 h-4 w-4" />
                                    Filters
                                    {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Report filters</DialogTitle>
                                    <DialogDescription>
                                        Include admins in the report or exclude specific users from all metrics.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="space-y-1">
                                            <Label htmlFor="include-admins">Include admin users</Label>
                                            <p className="text-sm text-slate-500">
                                                When enabled, admins are counted in team summary, follow-up queue, and learner performance.
                                            </p>
                                        </div>
                                        <Switch
                                            id="include-admins"
                                            checked={includeAdmins}
                                            onCheckedChange={setIncludeAdmins}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <Label>Exclude users</Label>
                                                <p className="text-sm text-slate-500">
                                                    Useful for test accounts or people you do not want in this report.
                                                </p>
                                            </div>
                                            {excludedUserIds.length > 0 ? (
                                                <Button variant="ghost" size="sm" onClick={() => setExcludedUserIds([])}>
                                                    Clear all
                                                </Button>
                                            ) : null}
                                        </div>
                                        <ScrollArea className="h-72 rounded-xl border border-slate-200">
                                            <div className="space-y-2 p-3">
                                                {(report?.availableUsers ?? []).map((user) => {
                                                    const checked = excludedUserIds.includes(user.userId)
                                                    return (
                                                        <label
                                                            key={user.userId}
                                                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="mt-1 h-4 w-4 rounded border-slate-300"
                                                                checked={checked}
                                                                onChange={(event) => toggleExcludedUser(user.userId, event.target.checked)}
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <p className="font-medium text-slate-950">{user.name}</p>
                                                                    <Badge variant="outline">{user.role}</Badge>
                                                                </div>
                                                                <p className="text-sm text-slate-500">{user.email}</p>
                                                            </div>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setFilterDialogOpen(false)}>
                                        Done
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Link href="/admin/training-ops/effectiveness">
                            <Button variant="outline"><BarChart3 className="mr-2 h-4 w-4" />Effectiveness</Button>
                        </Link>
                        <Link href="/admin/training-ops/events">
                            <Button variant="outline"><CalendarDays className="mr-2 h-4 w-4" />Events</Button>
                        </Link>
                        <Link href="/admin/training-ops/domains">
                            <Button variant="outline"><Target className="mr-2 h-4 w-4" />Domains</Button>
                        </Link>
                        <Button
                            disabled={!report}
                            onClick={() => report ? exportLearnersCsv(report) : undefined}
                            className="bg-[#006688] text-white hover:bg-[#0a7696]"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Export Learners
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                {loading || !report ? (
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardContent className="flex h-72 items-center justify-center text-slate-500">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Loading team readiness report...
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <MetricCard
                                label="Team Members"
                                value={report.summary.teamMembers}
                                hint={`${report.summary.activeLearners} learners have recorded activity.`}
                                icon={Users}
                            />
                            <MetricCard
                                label="Course Completion"
                                value={`${report.summary.courseCompletionRate}%`}
                                hint="Completed learner-course records across assigned training."
                                icon={CheckCircle2}
                                tone="success"
                            />
                            <MetricCard
                                label="Exam Participation"
                                value={`${report.summary.examParticipationRate}%`}
                                hint={`${report.summary.examPassRate}% pass rate · ${report.summary.averageExamScore}% average score.`}
                                icon={FileText}
                            />
                            <MetricCard
                                label="Needs Follow-up"
                                value={report.summary.atRiskLearners}
                                hint={`${report.summary.watchLearners} watch · ${report.summary.retakeNeeded} retakes · ${report.summary.overdueLearners} overdue.`}
                                icon={ShieldAlert}
                                tone="risk"
                            />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <CardTitle className="text-2xl text-slate-950">Report Snapshot</CardTitle>
                                            <CardDescription className="text-slate-500">
                                                {RANGE_OPTIONS.find((option) => option.value === report.period.range)?.label ?? 'Selected range'} · {report.period.label} · generated {formatDate(report.generatedAt)}
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                                            Certification {report.summary.certificationRate}%
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Readiness Mix</p>
                                        <div className="mt-5 space-y-4">
                                            <div>
                                                <div className="mb-2 flex justify-between text-sm">
                                                    <span className="font-medium text-slate-700">Course completion</span>
                                                    <span className="text-slate-500">{report.summary.courseCompletionRate}%</span>
                                                </div>
                                                <Progress value={report.summary.courseCompletionRate} className="h-2" />
                                            </div>
                                            <div>
                                                <div className="mb-2 flex justify-between text-sm">
                                                    <span className="font-medium text-slate-700">Exam participation</span>
                                                    <span className="text-slate-500">{report.summary.examParticipationRate}%</span>
                                                </div>
                                                <Progress value={report.summary.examParticipationRate} className="h-2" />
                                            </div>
                                            <div>
                                                <div className="mb-2 flex justify-between text-sm">
                                                    <span className="font-medium text-slate-700">Exam pass rate</span>
                                                    <span className="text-slate-500">{report.summary.examPassRate}%</span>
                                                </div>
                                                <Progress value={report.summary.examPassRate} className="h-2" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid gap-3">
                                        {report.reportHighlights.map((highlight) => (
                                            <div key={highlight} className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                                                {highlight}
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                                        <AlertTriangle className="h-5 w-5 text-rose-600" />
                                        Follow-up Queue
                                    </CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Learners who need action before the next team report.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {report.riskQueue.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                                            No learners currently require follow-up.
                                        </div>
                                    ) : report.riskQueue.slice(0, 6).map((item) => (
                                        <div key={item.userId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-950">{item.name}</p>
                                                    <p className="text-sm text-slate-500">{item.email}</p>
                                                </div>
                                                <Badge className="border-rose-200 bg-rose-50 text-rose-700">Action</Badge>
                                            </div>
                                            <p className="mt-3 text-sm leading-6 text-slate-600">{item.reason}</p>
                                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                                                <span>Progress {item.averageCourseProgress}%</span>
                                                <span>Pass {item.passRate}%</span>
                                                <span>{formatDate(item.lastActivityAt)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-2xl text-slate-950">Domain Progress</CardTitle>
                                        <CardDescription className="text-slate-500">
                                            Pass-rate movement by product domain, sorted by intervention priority.
                                        </CardDescription>
                                    </div>
                                    <Link href="/admin/training-ops/effectiveness">
                                        <Button variant="outline">Open Full Board</Button>
                                    </Link>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {report.domainProgress.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                                        No domain effectiveness data yet.
                                    </div>
                                ) : (
                                    <div className="grid gap-3 lg:grid-cols-2">
                                        {report.domainProgress.map((domain) => (
                                            <div key={domain.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-semibold text-slate-950">{domain.name}</p>
                                                            <Badge variant="outline">{domain.track}</Badge>
                                                        </div>
                                                        <p className="mt-1 text-sm text-slate-500">
                                                            {domain.ownerName ?? 'Unassigned owner'} · {domain.gradedAttempts} graded attempts · {domain.scheduledEventCount} active events
                                                        </p>
                                                    </div>
                                                    <Badge className={domainTone[domain.status]}>{formatStatus(domain.status)}</Badge>
                                                </div>
                                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                    <div>
                                                        <p className="text-xs text-slate-500">Current</p>
                                                        <p className="mt-1 text-xl font-semibold text-slate-950">{domain.currentPassRate}%</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-slate-500">Target</p>
                                                        <p className="mt-1 text-xl font-semibold text-slate-950">{domain.targetPassRate ?? 'N/A'}{domain.targetPassRate === null ? '' : '%'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-slate-500">Gap</p>
                                                        <p className="mt-1 text-xl font-semibold text-slate-950">{domain.targetGap === null ? 'N/A' : `${domain.targetGap > 0 ? '-' : '+'}${Math.abs(domain.targetGap)}%`}</p>
                                                    </div>
                                                </div>
                                                <div className="mt-4">
                                                    <Progress value={Math.max(0, Math.min(100, domain.currentPassRate))} className="h-2" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-2xl text-slate-950">Individual Performance</CardTitle>
                                        <CardDescription className="text-slate-500">
                                            Search and compare every learner&apos;s training, exam, certification, and risk status.
                                        </CardDescription>
                                    </div>
                                    <div className="relative w-full sm:w-80">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            value={learnerSearch}
                                            onChange={(event) => setLearnerSearch(event.target.value)}
                                            placeholder="Search learner, team, risk"
                                            className="border-slate-200 bg-slate-50 pl-9"
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1040px] text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                <th className="py-3 pr-4">Learner</th>
                                                <th className="px-4 py-3">Risk</th>
                                                <th className="px-4 py-3">Courses</th>
                                                <th className="px-4 py-3">Exams</th>
                                                <th className="px-4 py-3">Pass / Score</th>
                                                <th className="px-4 py-3">Recognition</th>
                                                <th className="px-4 py-3">Follow-up</th>
                                                <th className="py-3 pl-4">Last Activity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="py-10 text-center text-slate-500">
                                                        No learners match the current search.
                                                    </td>
                                                </tr>
                                            ) : filteredLearners.slice(0, 80).map((learner) => (
                                                <tr key={learner.userId} className="align-top">
                                                    <td className="py-4 pr-4">
                                                        <p className="font-semibold text-slate-950">{learner.name}</p>
                                                        <p className="mt-1 text-xs text-slate-500">{learner.email}</p>
                                                        <p className="mt-1 text-xs text-slate-400">{learner.department ?? 'No department'} · {learner.title ?? 'No title'}</p>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <Badge className={riskTone[learner.riskStatus]}>{formatStatus(learner.riskStatus)}</Badge>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <p className="font-medium text-slate-950">{learner.courseCompleted}/{learner.courseAssigned}</p>
                                                        <p className="mt-1 text-xs text-slate-500">{learner.averageCourseProgress}% avg progress</p>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <p className="font-medium text-slate-950">{learner.examAttempts}/{learner.examInvitations}</p>
                                                        <p className="mt-1 text-xs text-slate-500">{learner.gradedAttempts} graded</p>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <p className="font-medium text-slate-950">{learner.passRate}% / {learner.averageScore}%</p>
                                                        <p className="mt-1 text-xs text-slate-500">Best {learner.bestScore}%</p>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            <Badge variant="outline"><Award className="mr-1 h-3 w-3" />{learner.certificates}</Badge>
                                                            <Badge variant="outline"><Trophy className="mr-1 h-3 w-3" />{learner.badges}</Badge>
                                                        </div>
                                                        <p className="mt-1 text-xs text-slate-500">{learner.stars} stars</p>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <p className="font-medium text-slate-950">{learner.retakeNeeded} retakes</p>
                                                        <p className="mt-1 text-xs text-slate-500">{learner.overdueExams} overdue exams</p>
                                                    </td>
                                                    <td className="py-4 pl-4 text-slate-500">
                                                        {formatDate(learner.lastActivityAt)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
