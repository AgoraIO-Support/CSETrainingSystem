'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainEffectivenessSummary, TrainingOpsBridge } from '@/types'
import {
    ArrowRight,
    Award,
    BrainCircuit,
    CalendarDays,
    CheckCircle2,
    GraduationCap,
    ShieldCheck,
    Star,
    TrendingUp,
} from 'lucide-react'

const streams = [
    {
        title: 'Agile Stream',
        subtitle: 'Conversational AI',
        rhythm: 'Weekly release sprint',
        format: 'Test first -> SME diagnosis -> guided replay',
        objective: 'Keep pace with rapid product releases and new support patterns.',
        accent: 'bg-[#effbff] text-[#006688]',
    },
    {
        title: 'Mastery Stream',
        subtitle: 'RTE Domains',
        rhythm: 'Weekly deep-dive rotation',
        format: 'Knowledge share or case study -> quiz -> badge',
        objective: 'Institutionalize proven best practices in stable product areas.',
        accent: 'bg-[#eef7f8] text-[#0f5f73]',
    },
    {
        title: 'Release Readiness',
        subtitle: 'PM-triggered launch events',
        rhythm: 'Ad hoc by release',
        format: 'Feature briefing -> launch quiz -> close-loop review',
        objective: 'Validate readiness on new launches without waiting for the quarterly cycle.',
        accent: 'bg-[#fff7e8] text-[#9a6a00]',
    },
]

const domains = [
    { domain: 'Conversational AI', owner: 'SE / SME Owner', cadence: 'Weekly', metric: '10% -> 80% pass lift', focus: 'Blind case study + post-mortem' },
    { domain: 'RTC', owner: 'RTC SME', cadence: 'Weekly', metric: 'Maintain >90% quiz pass rate', focus: 'Recurring escalations and ticket patterns' },
    { domain: 'RTM', owner: 'RTM SME', cadence: 'Weekly', metric: 'Maintain >90% quiz pass rate', focus: 'FAQ and protocol troubleshooting' },
    { domain: 'Cloud Recording', owner: 'Recording SME', cadence: 'Weekly', metric: 'Raise pass rate trend quarter over quarter', focus: 'Case study and failure analysis' },
    { domain: 'STT', owner: 'STT SME', cadence: 'Weekly', metric: 'Raise pass rate trend quarter over quarter', focus: 'Launch change review + support patterns' },
    { domain: 'Product Launches', owner: 'PM + Domain SME', cadence: 'Event-based', metric: 'Launch quiz completion within 7 days', focus: 'New features and release readiness' },
]

const scheduleRows = [
    { day: 'Monday', lane: 'Conv AI', activity: 'Blind Case Study', owner: 'Conv AI SME', output: 'Attempt baseline + issue clustering' },
    { day: 'Tuesday', lane: 'RTC / RTM', activity: 'Knowledge Share or FAQ Review', owner: 'Domain SME', output: 'Short quiz + badge opportunity' },
    { day: 'Wednesday', lane: 'Conv AI', activity: 'Gap Training Session', owner: 'Conv AI SME', output: 'Explain misses and corrected approach' },
    { day: 'Thursday', lane: 'Cloud Recording / STT', activity: 'Case Study Replay', owner: 'Domain SME', output: 'Support pattern reinforcement' },
    { day: 'Friday', lane: 'All Tracks', activity: 'Star Update + Weekly Review', owner: 'Training Lead', output: 'Leaderboard, pass trend, next actions' },
]

const actions = [
    'Each SME owns the calendar and content plan for their product domain.',
    'Conversational AI uses fail-first drills to prove delta improvement, not content volume.',
    'RTE SMEs are evaluated on retained pass rate and recurring issue reduction.',
    'Quarterly or year-end finals map missed topics back to the domain SME for corrective planning.',
]

export default function TrainingOpsPrototypePage() {
    const [bridge, setBridge] = useState<TrainingOpsBridge | null>(null)
    const [bridgeLoading, setBridgeLoading] = useState(true)
    const [bridgeError, setBridgeError] = useState<string | null>(null)
    const [effectivenessRows, setEffectivenessRows] = useState<ProductDomainEffectivenessSummary[]>([])

    useEffect(() => {
        let active = true

        const loadData = async () => {
            try {
                const [bridgeResponse, effectivenessResponse] = await Promise.all([
                    ApiClient.getTrainingOpsBridge(),
                    ApiClient.getTrainingOpsEffectiveness(),
                ])
                if (!active) return
                setBridge(bridgeResponse.data)
                setEffectivenessRows(effectivenessResponse.data)
                setBridgeError(null)
            } catch (error) {
                if (!active) return
                setBridgeError(error instanceof Error ? error.message : 'Failed to load bridge data')
            } finally {
                if (active) {
                    setBridgeLoading(false)
                }
            }
        }

        void loadData()

        return () => {
            active = false
        }
    }, [])

    const overviewStats = [
        { label: 'Weekly Training Slots', value: '12', hint: 'Agile + mastery cadence', icon: CalendarDays },
        {
            label: 'Current Active Learners',
            value: bridgeLoading ? '...' : String(bridge?.analytics.activeUsers ?? 0),
            hint: 'Live from current analytics',
            icon: ShieldCheck,
        },
        { label: 'Target Pass Lift', value: '+70%', hint: 'Conv AI baseline to year-end', icon: TrendingUp },
        {
            label: 'Recognized Learners',
            value: bridgeLoading ? '...' : String(bridge?.rewards.learnersWithRecognition ?? 0),
            hint: 'Achievements, badges, certificates, stars',
            icon: Star,
        },
    ]

    const topRewardDomains = bridge?.trainingOps.topRewardDomains ?? []
    const topLearners = bridge?.rewards.topLearners ?? []
    const accountabilityRows = effectivenessRows.length > 0
        ? effectivenessRows.slice(0, 4).map((row) => ({
            domain: row.name,
            baseline: row.baselinePassRate ?? 0,
            current: row.currentPassRate,
            target: row.targetPassRate ?? 100,
            status:
                row.status === 'ON_TRACK'
                    ? 'On track'
                    : row.status === 'AT_RISK'
                        ? 'At risk'
                        : row.status === 'MONITOR'
                            ? 'Monitor'
                            : 'Insufficient data',
        }))
        : [
            { domain: 'Conversational AI', baseline: 10, current: 46, target: 80, status: 'On track' },
            { domain: 'RTC', baseline: 72, current: 88, target: 90, status: 'Needs push' },
            { domain: 'RTM', baseline: 68, current: 84, target: 90, status: 'Needs push' },
            { domain: 'Cloud Recording', baseline: 61, current: 79, target: 85, status: 'Recovering' },
        ]

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
                    <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                        <CardContent className="p-7 md:p-8">
                            <div className="space-y-5">
                                <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                                    Prototype · Training Operations
                                </Badge>
                                <div className="space-y-3">
                                    <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                                        Dual-Track Gamified Mastery System
                                    </h1>
                                    <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                                        A training operating model that separates fast-moving Conversational AI readiness from
                                        deep RTE mastery, while keeping SME accountability, star accumulation, badge milestones,
                                        and final exam ownership in one unified system.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Badge className="rounded-full bg-[#006688] px-3 py-1 text-white">Agile Stream</Badge>
                                    <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">Mastery Stream</Badge>
                                    <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">Release Readiness</Badge>
                                    <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">Quarterly / Final Exam</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl text-slate-950">Prototype Goals</CardTitle>
                            <CardDescription className="text-slate-500">
                                What this version is meant to validate first
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-slate-600">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Leadership view</p>
                                <p className="mt-1">Can you immediately see cadence, SME ownership, and pass-rate movement?</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">SME view</p>
                                <p className="mt-1">Can each SME understand what they own and how they will be measured?</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Learner view</p>
                                <p className="mt-1">Can every engineer understand stars, badges, and year-end expectations without needing separate tracks?</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {overviewStats.map((item) => {
                        const Icon = item.icon
                        return (
                            <Card key={item.label} className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader className="flex flex-row items-start justify-between pb-2">
                                    <div>
                                        <CardDescription className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                            {item.label}
                                        </CardDescription>
                                        <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                            {item.value}
                                        </CardTitle>
                                    </div>
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#006688]">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-500">{item.hint}</p>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link href="/admin/training-ops/domains">
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                            Configure Domains
                        </Button>
                    </Link>
                    <Link href="/admin/training-ops/series">
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                            Configure Series
                        </Button>
                    </Link>
                    <Link href="/admin/training-ops/events">
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                            Browse Learning Events
                        </Button>
                    </Link>
                    <Link href="/admin/training-ops-prototype/scheduling">
                        <Button className="bg-[#006688] text-white hover:bg-[#0a7696]">
                            Open Scheduling Prototype
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href="/admin/training-ops/leaderboard">
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                            Open Learner Leaderboard
                        </Button>
                    </Link>
                    <Link href="/admin/training-ops/badges">
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                            Manage Badge Milestones
                        </Button>
                    </Link>
                    <Link href="/admin/training-ops/effectiveness">
                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                            Open SME Effectiveness
                        </Button>
                    </Link>
                </div>

                <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <CardTitle className="text-2xl text-slate-950">Current System Bridge</CardTitle>
                            <CardDescription className="text-slate-500">
                                Live counts from the existing analytics, exam, achievement, certificate, and new training-ops tables.
                            </CardDescription>
                        </div>
                        <Badge className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                            {bridgeLoading
                                ? 'Loading live data'
                                : bridge
                                    ? `Updated ${new Date(bridge.generatedAt).toLocaleString()}`
                                    : 'Live data unavailable'}
                        </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {bridgeError ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                                Failed to load live training-ops bridge data: {bridgeError}
                            </div>
                        ) : null}

                        <div className="grid gap-4 xl:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Learner Base</p>
                                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.analytics.totalUsers ?? 0}
                                </p>
                                <p className="mt-2 text-sm text-slate-500">
                                    {bridgeLoading
                                        ? 'Loading analytics snapshot'
                                        : `${bridge?.analytics.activeUsers ?? 0} active users · ${bridge?.analytics.completionRate ?? 0}% completion rate`}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Exam Engine</p>
                                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.exams.publishedExams ?? 0}
                                </p>
                                <p className="mt-2 text-sm text-slate-500">
                                    {bridgeLoading
                                        ? 'Loading exam snapshot'
                                        : `${bridge?.exams.totalExams ?? 0} total exams · ${bridge?.exams.attempts ?? 0} attempts · ${bridge?.exams.invitations ?? 0} invitations`}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reward Signals</p>
                                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.rewards.achievementAwards ?? 0}
                                </p>
                                <p className="mt-2 text-sm text-slate-500">
                                    {bridgeLoading
                                        ? 'Loading reward snapshot'
                                        : `${bridge?.rewards.certificateCount ?? 0} certificates · ${bridge?.rewards.learnersWithRecognition ?? 0} recognized learners`}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Training Ops Readiness</p>
                                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.trainingOps.productDomains ?? 0}
                                </p>
                                <p className="mt-2 text-sm text-slate-500">
                                    {bridgeLoading
                                        ? 'Checking new schema tables'
                                        : bridge?.trainingOps.migrated
                                            ? `${bridge?.trainingOps.learningSeries ?? 0} series · ${bridge?.trainingOps.scheduledEvents ?? 0} scheduled events`
                                            : 'Training-ops tables are pending database migration'}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                            <div className="rounded-2xl border border-[#b8ecff] bg-[#effbff] p-4 text-sm text-slate-700">
                                <p className="font-semibold text-slate-950">Assessment mix</p>
                                <p className="mt-2">
                                    Practice:{' '}
                                    <span className="font-medium text-[#006688]">
                                        {bridgeLoading ? '...' : bridge?.exams.practiceExams ?? 'pending'}
                                    </span>
                                    {' · '}Readiness:{' '}
                                    <span className="font-medium text-[#006688]">
                                        {bridgeLoading ? '...' : bridge?.exams.readinessExams ?? 'pending'}
                                    </span>
                                    {' · '}Formal:{' '}
                                    <span className="font-medium text-[#006688]">
                                        {bridgeLoading ? '...' : bridge?.exams.formalExams ?? 'pending'}
                                    </span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                <p className="font-semibold text-slate-950">Domain mapping coverage</p>
                                <p className="mt-2">
                                    Exams mapped:{' '}
                                    <span className="font-medium text-slate-950">
                                        {bridgeLoading ? '...' : bridge?.exams.examsMappedToDomain ?? 'pending'}
                                    </span>
                                    {' · '}Questions mapped:{' '}
                                    <span className="font-medium text-slate-950">
                                        {bridgeLoading ? '...' : bridge?.exams.questionsMappedToDomain ?? 'pending'}
                                    </span>
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                <p className="font-semibold text-slate-950">Gamification bridge</p>
                                <p className="mt-2">
                                    Badge milestones:{' '}
                                    <span className="font-medium text-slate-950">
                                        {bridgeLoading ? '...' : bridge?.rewards.badgeMilestones ?? 'pending'}
                                    </span>
                                    {' · '}Star awards:{' '}
                                    <span className="font-medium text-slate-950">
                                        {bridgeLoading ? '...' : bridge?.rewards.starAwards ?? 'pending'}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Top reward domains</p>
                                <div className="mt-4 space-y-3">
                                    {topRewardDomains.length > 0 ? topRewardDomains.map((item) => (
                                        <div key={`${item.domainId ?? 'global'}-${item.domainName ?? 'global'}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                                            <div>
                                                <p className="font-semibold text-slate-950">{item.domainName ?? 'Cross-domain rewards'}</p>
                                                <p className="mt-1 text-sm text-slate-500">
                                                    {item.recognizedLearners} recognized learner{item.recognizedLearners === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                            <div className="text-right text-sm text-slate-600">
                                                <p><span className="font-semibold text-slate-950">{item.starAwards}</span> stars</p>
                                                <p><span className="font-semibold text-slate-950">{item.badgeAwards}</span> badges</p>
                                            </div>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-slate-500">No star or badge rewards have been issued yet.</p>
                                    )}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Why this matters</p>
                                <p className="mt-3 text-sm leading-6 text-slate-600">
                                    This turns gamification from a decorative badge system into a measurable training signal:
                                    which domains are actually driving repeated learner success, and which ones still need
                                    better coaching design.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue="leadership" className="space-y-6">
                    <TabsList className="rounded-2xl border border-slate-200 bg-white p-1">
                        <TabsTrigger value="leadership" className="rounded-xl data-[state=active]:bg-[#006688] data-[state=active]:text-white">
                            Leadership View
                        </TabsTrigger>
                        <TabsTrigger value="sme" className="rounded-xl data-[state=active]:bg-[#006688] data-[state=active]:text-white">
                            SME View
                        </TabsTrigger>
                        <TabsTrigger value="learner" className="rounded-xl data-[state=active]:bg-[#006688] data-[state=active]:text-white">
                            Learner View
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="leadership" className="space-y-6">
                        <div className="grid gap-5 xl:grid-cols-3">
                            {streams.map((stream) => (
                                <Card key={stream.title} className="border border-slate-200 bg-white shadow-sm">
                                    <CardHeader className="space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <CardTitle className="text-xl text-slate-950">{stream.title}</CardTitle>
                                                <CardDescription className="mt-1 text-slate-500">{stream.subtitle}</CardDescription>
                                            </div>
                                            <Badge className={`rounded-full px-3 py-1 text-[11px] font-semibold ${stream.accent}`}>
                                                {stream.rhythm}
                                            </Badge>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                            <p className="font-semibold text-slate-900">Operating format</p>
                                            <p className="mt-1">{stream.format}</p>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm leading-6 text-slate-600">{stream.objective}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-2xl text-slate-950">Product Domain Ownership</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Each domain has explicit cadence, accountability, and an SME owner.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {domains.map((item) => (
                                        <div key={item.domain} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.1fr_0.75fr_0.8fr_1fr]">
                                            <div>
                                                <p className="font-semibold text-slate-950">{item.domain}</p>
                                                <p className="mt-1 text-sm text-slate-500">{item.focus}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Owner</p>
                                                <p className="mt-1 text-sm font-medium text-slate-800">{item.owner}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Cadence</p>
                                                <p className="mt-1 text-sm font-medium text-slate-800">{item.cadence}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">KPI</p>
                                                <p className="mt-1 text-sm font-medium text-slate-800">{item.metric}</p>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-2xl text-slate-950">Leadership Signals</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        What your boss should be able to see at a glance.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-2xl border border-[#b8ecff] bg-[#effbff] p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#006688]">Primary success story</p>
                                                <p className="mt-2 text-lg font-semibold text-slate-950">Conv AI pass rate growth</p>
                                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                                    Show baseline failure at the start of the year, then prove training effectiveness through measurable uplift.
                                                </p>
                                            </div>
                                            <BrainCircuit className="h-6 w-6 text-[#006688]" />
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Secondary signal</p>
                                        <p className="mt-2 text-lg font-semibold text-slate-950">Star accumulation by engineer</p>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                                Year-end readiness is not just one final exam. It is sustained participation, repeated success, and badge collection over time for every engineer.
                                            </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Escalation loop</p>
                                        <p className="mt-2 text-lg font-semibold text-slate-950">Final exam gaps map back to SME owners</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                            If a domain underperforms in the quarterly or year-end final, the feedback loop goes directly to the responsible SME for corrective action.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-2xl text-slate-950">Weekly Operating Rhythm</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        A realistic schedule that keeps practice frequency high without blending every program together.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {scheduleRows.map((row) => (
                                        <div key={`${row.day}-${row.lane}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-950">{row.day}</p>
                                                    <p className="mt-1 text-sm text-slate-500">{row.lane}</p>
                                                </div>
                                                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                                    {row.owner}
                                                </Badge>
                                            </div>
                                            <div className="mt-3">
                                                <p className="font-medium text-slate-900">{row.activity}</p>
                                                <p className="mt-1 text-sm text-slate-600">{row.output}</p>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-2xl text-slate-950">SME Accountability Scorecards</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Result-oriented metrics, not slide-count metrics.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {accountabilityRows.map((row) => {
                                        const delta = row.current - row.baseline
                                        const progressValue = row.target > 0 ? Math.min(100, Math.round((row.current / row.target) * 100)) : 0
                                        return (
                                            <div key={row.domain} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-semibold text-slate-950">{row.domain}</p>
                                                        <p className="mt-1 text-sm text-slate-500">
                                                            Baseline {row.baseline}% · Current {row.current}% · Target {row.target}%
                                                        </p>
                                                    </div>
                                                    <Badge className="rounded-full bg-[#006688] px-3 py-1 text-white">{row.status}</Badge>
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                    <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                                        <span>Progress to target</span>
                                                        <span>Delta +{delta}%</span>
                                                    </div>
                                                    <Progress value={progressValue} className="h-2 bg-slate-200" />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="sme" className="space-y-6">
                        <div className="grid gap-5 xl:grid-cols-3">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-xl text-slate-950">Conv AI SME Playbook</CardTitle>
                                    <CardDescription className="text-slate-500">Fail-first, adapt-fast workflow</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3 text-sm text-slate-600">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="font-semibold text-slate-900">Monday</p>
                                        <p className="mt-1">Release the blind case study based on new release notes.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="font-semibold text-slate-900">Wednesday</p>
                                        <p className="mt-1">Review misses and run gap training focused on the wrong mental models.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="font-semibold text-slate-900">Friday</p>
                                        <p className="mt-1">Check whether the pass-rate delta is moving toward the year-end target.</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-xl text-slate-950">RTE SME Playbook</CardTitle>
                                    <CardDescription className="text-slate-500">Stable-domain rotation</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3 text-sm text-slate-600">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="font-semibold text-slate-900">Case-based topics</p>
                                        <p className="mt-1">Use ticket history, recurring escalations, and field mistakes to drive weekly drills.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="font-semibold text-slate-900">FAQ shares</p>
                                        <p className="mt-1">Short knowledge shares can alternate with quizzes to keep frequency sustainable.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="font-semibold text-slate-900">Challenge rule</p>
                                        <p className="mt-1">If pass rate does not improve, the SME revisits test design and training approach.</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-xl text-slate-950">Immediate SME Actions</CardTitle>
                                    <CardDescription className="text-slate-500">What the kickoff should request first</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {actions.map((item) => (
                                        <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#006688]" />
                                            <p className="text-sm leading-6 text-slate-600">{item}</p>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="learner" className="space-y-6">
                        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-2xl text-slate-950">Star Economy</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Practice is frequent, but formal performance impact stays separate until final assessment.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4 text-sm text-slate-600">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="font-semibold text-slate-900">Weekly Quiz</p>
                                            <Badge className="rounded-full bg-[#006688] text-white">1 Star</Badge>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="font-semibold text-slate-900">Conv AI Case Study Solved</p>
                                            <Badge className="rounded-full bg-[#006688] text-white">2 Stars</Badge>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="font-semibold text-slate-900">Product Launch Exam</p>
                                            <Badge className="rounded-full bg-[#006688] text-white">3 Stars</Badge>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-[#b8ecff] bg-[#effbff] p-5">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#006688]">Badge ladder</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Badge className="rounded-full bg-[#006688] text-white">Speedster</Badge>
                                            <Badge className="rounded-full border border-slate-200 bg-white text-slate-700">Architect</Badge>
                                            <Badge className="rounded-full border border-slate-200 bg-white text-slate-700">Grand Master</Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-slate-200 bg-white shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-2xl text-slate-950">Learner Progress Snapshot</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        A live view of who is actually accumulating stars and badges.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    {(topLearners.length > 0 ? topLearners.slice(0, 4).map((learner) => (
                                        <div key={learner.userId} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-950">{learner.name}</p>
                                                    <p className="mt-1 text-sm text-slate-500">
                                                        {learner.email}
                                                        {learner.lastRewardedAt ? ` · Last reward ${new Date(learner.lastRewardedAt).toLocaleDateString()}` : ''}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Badge className="rounded-full bg-[#006688] text-white">{learner.badges} badges</Badge>
                                                </div>
                                            </div>
                                            <div className="mt-4 space-y-2">
                                                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                                    <span>Stars earned</span>
                                                    <span>{learner.stars} / 24</span>
                                                </div>
                                                <Progress value={Math.min(100, Math.round((learner.stars / 24) * 100))} className="h-2 bg-slate-200" />
                                            </div>
                                            <p className="mt-3 text-sm text-slate-500">
                                                Recent sources: {learner.recentSources.length > 0 ? learner.recentSources.join(' · ') : 'No recent sources'}
                                            </p>
                                        </div>
                                    )) : [
                                        { name: 'Engineer Group A', stars: 14, badges: 1, note: 'Needs 10 more stars before year-end.' },
                                        { name: 'Engineer Group B', stars: 19, badges: 2, note: 'Close to the yearly threshold, but still needs consistent participation.' },
                                    ].map((group) => (
                                        <div key={group.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-950">{group.name}</p>
                                                    <p className="mt-1 text-sm text-slate-500">{group.note}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Badge className="rounded-full bg-[#006688] text-white">{group.badges} badges</Badge>
                                                </div>
                                            </div>
                                            <div className="mt-4 space-y-2">
                                                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                                    <span>Stars earned</span>
                                                    <span>{group.stars} / 24</span>
                                                </div>
                                                <Progress value={Math.round((group.stars / 24) * 100)} className="h-2 bg-slate-200" />
                                            </div>
                                        </div>
                                    )))}

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                            <div className="flex items-center gap-3">
                                                <Award className="h-5 w-5 text-[#006688]" />
                                                <p className="font-semibold text-slate-950">Shared yearly target</p>
                                            </div>
                                            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">24</p>
                                            <p className="mt-2 text-sm text-slate-500">Stars expected from every engineer by year-end.</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                            <div className="flex items-center gap-3">
                                                <GraduationCap className="h-5 w-5 text-[#006688]" />
                                                <p className="font-semibold text-slate-950">Final assessment gate</p>
                                            </div>
                                            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Pass</p>
                                            <p className="mt-2 text-sm text-slate-500">Quarterly or year-end finals still determine whether the training translated into mastery.</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>

                <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle className="text-2xl text-slate-950">Prototype Recommendation</CardTitle>
                            <CardDescription className="text-slate-500">
                                This prototype now reads live analytics, exam, and reward signals. The next step is to turn the new training-ops schema into real scheduling and assessment workflows.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Link href="/admin/exams">
                                <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                    Review current exam engine
                                </Button>
                            </Link>
                            <Link href="/admin/training-ops-prototype/scheduling">
                                <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                    Open SME Scheduling
                                </Button>
                            </Link>
                            <Link href="/admin/training-ops/leaderboard">
                                <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                    Open Learner Leaderboard
                                </Button>
                            </Link>
                            <Link href="/admin/training-ops/effectiveness">
                                <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                    Open SME Effectiveness
                                </Button>
                            </Link>
                            <Link href="/admin/training-ops/domains">
                                <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                    Configure Domains
                                </Button>
                            </Link>
                            <Link href="/admin/training-ops/series">
                                <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                    Configure Series
                                </Button>
                            </Link>
                            <Link href="/admin/analytics">
                                <Button className="bg-[#006688] text-white hover:bg-[#0a7696]">
                                    Compare with current analytics
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                </Card>
            </div>
        </DashboardLayout>
    )
}
