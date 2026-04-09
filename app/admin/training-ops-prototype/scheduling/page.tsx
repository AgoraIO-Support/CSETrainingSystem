'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiClient } from '@/lib/api-client'
import type { TrainingOpsBridge } from '@/types'
import {
    ArrowLeft,
    ArrowRight,
    BrainCircuit,
    CalendarClock,
    CheckCircle2,
    Clock3,
    FileStack,
    Flag,
    UserRound,
} from 'lucide-react'

const weeklyGrid = [
    {
        day: 'Monday',
        focus: 'Conversational AI',
        owner: 'Conv AI SME',
        type: 'Blind Case Study',
        timing: '10:00 - 10:30',
        output: 'Initial attempt, baseline score, common failure patterns',
        accent: 'bg-[#effbff] text-[#006688]',
    },
    {
        day: 'Tuesday',
        focus: 'RTC',
        owner: 'RTC SME',
        type: 'FAQ Sharing + Quiz',
        timing: '15:00 - 15:30',
        output: 'Recurring issue playbook, short practice quiz, badge eligibility',
        accent: 'bg-[#eef7f8] text-[#0f5f73]',
    },
    {
        day: 'Wednesday',
        focus: 'Conversational AI',
        owner: 'Conv AI SME',
        type: 'Gap Training',
        timing: '16:00 - 16:45',
        output: 'Explain misses, show correct approach, prep re-test',
        accent: 'bg-[#effbff] text-[#006688]',
    },
    {
        day: 'Thursday',
        focus: 'Cloud Recording',
        owner: 'Recording SME',
        type: 'Case Study Review',
        timing: '14:00 - 14:45',
        output: 'Root-cause walkthrough, SME teaching notes, star award',
        accent: 'bg-[#eef7f8] text-[#0f5f73]',
    },
    {
        day: 'Friday',
        focus: 'All Domains',
        owner: 'Training Lead',
        type: 'Weekly Close-out',
        timing: '17:00 - 17:20',
        output: 'Leaderboard refresh, missed-topic summary, next-week prep',
        accent: 'bg-[#fff7e8] text-[#9a6a00]',
    },
]

const smeQueue = [
    { domain: 'Conversational AI', owner: 'Conv AI SME', nextItem: 'Release Sprint #14', dependency: 'New release notes and ticket replay', status: 'Ready' },
    { domain: 'RTC', owner: 'RTC SME', nextItem: 'Audio Routing FAQ', dependency: 'Top 5 support cases', status: 'Needs content' },
    { domain: 'RTM', owner: 'RTM SME', nextItem: 'Token Failure Case Study', dependency: 'Recent escalation timeline', status: 'In review' },
    { domain: 'Cloud Recording', owner: 'Recording SME', nextItem: 'Retry Logic Drill', dependency: 'Incident summary and logs', status: 'Scheduled' },
]

const releaseLane = [
    { trigger: 'Product launch / feature release', owner: 'PM + Domain SME', action: 'Create release-readiness event', due: 'Within 48h of launch' },
    { trigger: 'Training material delivered', owner: 'Training Lead', action: 'Schedule quiz and assign target audience', due: 'Within 24h of materials' },
    { trigger: 'Quiz completed', owner: 'Domain SME', action: 'Review misses and publish reinforcement notes', due: 'Within 72h of quiz' },
]

const schedulingRules = [
    'Each SME owns the next 4 to 6 weeks of titles for their product domain.',
    'Conversational AI keeps a reserved weekly slot because release cadence is unpredictable but constant.',
    'RTE domains rotate weekly so the team sees one strong deep-dive at a time instead of fragmented sessions.',
    'Release-driven events do not replace the weekly cadence; they are inserted into a separate readiness lane.',
    'Quarterly and year-end finals stay centrally scheduled by the training lead.',
]

export default function TrainingOpsSchedulingPrototypePage() {
    const [bridge, setBridge] = useState<TrainingOpsBridge | null>(null)
    const [bridgeLoading, setBridgeLoading] = useState(true)
    const [bridgeError, setBridgeError] = useState<string | null>(null)

    useEffect(() => {
        let active = true

        const loadBridge = async () => {
            try {
                const response = await ApiClient.getTrainingOpsBridge()
                if (!active) return
                setBridge(response.data)
                setBridgeError(null)
            } catch (error) {
                if (!active) return
                setBridgeError(error instanceof Error ? error.message : 'Failed to load scheduling bridge data')
            } finally {
                if (active) {
                    setBridgeLoading(false)
                }
            }
        }

        void loadBridge()

        return () => {
            active = false
        }
    }, [])

    const previewDomains = bridge?.trainingOps.previewDomains ?? []
    const previewSeries = bridge?.trainingOps.previewSeries ?? []
    const previewEvents = bridge?.trainingOps.previewEvents ?? []
    const rewardedEvents = bridge?.trainingOps.rewardedEvents ?? []
    const recentExams = bridge?.exams.recentExams ?? []

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-2">
                        <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                            Prototype · SME Scheduling
                        </Badge>
                        <div>
                            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                                Weekly Scheduling Control Center
                            </h1>
                            <p className="mt-1 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                                A planning surface for assigning SME ownership, maintaining weekly cadence, and absorbing
                                ad hoc release-readiness quizzes without breaking the core training rhythm.
                            </p>
                        </div>
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
                                View Learning Events
                            </Button>
                        </Link>
                        <Link href="/admin/training-ops/effectiveness">
                            <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                SME Effectiveness
                            </Button>
                        </Link>
                        <Link href="/admin/training-ops/events/new">
                            <Button className="bg-[#006688] text-white hover:bg-[#0a7696]">
                                Create Learning Event
                            </Button>
                        </Link>
                        <Link href="/admin/training-ops-prototype">
                            <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Prototype
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader className="flex flex-row items-start justify-between pb-2">
                            <div>
                                <CardDescription className="text-xs uppercase tracking-[0.14em] text-slate-500">Reserved weekly slots</CardDescription>
                                <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">5</CardTitle>
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#006688]">
                                <CalendarClock className="h-5 w-5" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-500">One anchor slot for each weekday keeps the cadence visible.</p>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader className="flex flex-row items-start justify-between pb-2">
                            <div>
                                <CardDescription className="text-xs uppercase tracking-[0.14em] text-slate-500">Active SME owners</CardDescription>
                                <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.trainingOps.activeProductDomains ?? 0}
                                </CardTitle>
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#006688]">
                                <UserRound className="h-5 w-5" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-500">
                                {bridgeLoading
                                    ? 'Loading current domain ownership'
                                    : `${previewDomains.length} preview domains currently available from the real schema.`}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader className="flex flex-row items-start justify-between pb-2">
                            <div>
                                <CardDescription className="text-xs uppercase tracking-[0.14em] text-slate-500">Release lane SLA</CardDescription>
                                <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.trainingOps.scheduledEvents ?? 0}
                                </CardTitle>
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#006688]">
                                <Clock3 className="h-5 w-5" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-500">Scheduled learning events currently in the system.</p>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader className="flex flex-row items-start justify-between pb-2">
                            <div>
                                <CardDescription className="text-xs uppercase tracking-[0.14em] text-slate-500">Planning horizon</CardDescription>
                                <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                                    {bridgeLoading ? '...' : bridge?.exams.approvedExams ?? 0}
                                </CardTitle>
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#006688]">
                                <FileStack className="h-5 w-5" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-500">Approved exams waiting to be scheduled or published into the cadence.</p>
                        </CardContent>
                    </Card>
                </div>

                {bridgeError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        Failed to load live scheduling bridge data: {bridgeError}
                    </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Weekly Cadence Board</CardTitle>
                            <CardDescription className="text-slate-500">
                                The fixed rhythm that keeps training visible and predictable.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {weeklyGrid.map((slot) => (
                                <div key={`${slot.day}-${slot.focus}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{slot.day}</p>
                                            <p className="mt-2 text-xl font-semibold text-slate-950">{slot.type}</p>
                                        </div>
                                        <Badge className={`rounded-full px-3 py-1 text-[11px] font-semibold ${slot.accent}`}>
                                            {slot.focus}
                                        </Badge>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Owner</p>
                                            <p className="mt-1 text-sm font-medium text-slate-800">{slot.owner}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Time</p>
                                            <p className="mt-1 text-sm font-medium text-slate-800">{slot.timing}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Output</p>
                                            <p className="mt-1 text-sm font-medium text-slate-800">{slot.output}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-2xl text-slate-950">SME Planning Queue</CardTitle>
                                <CardDescription className="text-slate-500">
                                    The next deliverable each SME still needs to prepare. Real domain rows appear here when the new schema is populated.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {previewDomains.length > 0
                                    ? previewDomains.map((item) => {
                                        const nextEvent = previewEvents.find((event) => event.domainName === item.name)
                                        return (
                                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-950">{item.name}</p>
                                                    <p className="mt-1 text-sm text-slate-500">{item.primarySmeName ?? 'Unassigned SME owner'}</p>
                                                </div>
                                                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                                    {item.cadence ?? 'Cadence TBD'}
                                                </Badge>
                                            </div>
                                            <div className="mt-3 space-y-2">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Mapped series</p>
                                                    <p className="mt-1 text-sm font-medium text-slate-800">
                                                        {previewSeries.find((series) => series.domainName === item.name)?.name ?? 'No learning series mapped yet'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next scheduled item</p>
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        {nextEvent?.title ?? 'No scheduled event yet'}
                                                    </p>
                                                </div>
                                            </div>
                                            {nextEvent ? (
                                                <div className="mt-4">
                                                    <Link href={`/admin/training-ops/events/${nextEvent.id}`}>
                                                        <Button variant="outline" size="sm">
                                                            Open Scheduled Event
                                                        </Button>
                                                    </Link>
                                                </div>
                                            ) : null}
                                        </div>
                                    )})
                                    : smeQueue.map((item) => (
                                        <div key={`${item.domain}-${item.nextItem}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-950">{item.domain}</p>
                                                    <p className="mt-1 text-sm text-slate-500">{item.owner}</p>
                                                </div>
                                                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                                                    {item.status}
                                                </Badge>
                                            </div>
                                            <div className="mt-3 space-y-2">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next item</p>
                                                    <p className="mt-1 text-sm font-medium text-slate-800">{item.nextItem}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Dependency</p>
                                                    <p className="mt-1 text-sm text-slate-600">{item.dependency}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-2xl text-slate-950">Release Readiness Lane</CardTitle>
                                <CardDescription className="text-slate-500">
                                    A separate scheduling lane for product launches and new features.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {releaseLane.map((step) => (
                                    <div key={step.trigger} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-slate-950">{step.trigger}</p>
                                                <p className="mt-1 text-sm text-slate-600">{step.action}</p>
                                            </div>
                                            <Badge className="rounded-full bg-[#006688] px-3 py-1 text-white">{step.due}</Badge>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">Owner · {step.owner}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-2xl text-slate-950">Reward-Producing Events</CardTitle>
                                <CardDescription className="text-slate-500">
                                    Real sessions that have already generated stars or badges.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {rewardedEvents.length > 0 ? rewardedEvents.map((event) => (
                                    <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-slate-950">{event.title}</p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {event.domainName ?? 'No domain'} · {event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Unscheduled'}
                                                </p>
                                            </div>
                                            <Badge className="rounded-full bg-[#006688] px-3 py-1 text-white">
                                                {event.starAwards} stars
                                            </Badge>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                                            {event.badgeAwards} badges · {event.recognizedLearners} recognized learner{event.recognizedLearners === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                )) : (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                        No events have produced stars or badges yet.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl text-slate-950">Scheduling Rules</CardTitle>
                        <CardDescription className="text-slate-500">
                            The operating assumptions that keep the calendar manageable.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 lg:grid-cols-2">
                        {schedulingRules.map((rule) => (
                            <div key={rule} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#006688]" />
                                <p className="text-sm leading-6 text-slate-600">{rule}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <div className="grid gap-6 xl:grid-cols-3">
                    <Card className="border border-slate-200 bg-white shadow-sm xl:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">How this should map into the actual system</CardTitle>
                            <CardDescription className="text-slate-500">
                                This prototype page is showing the data relationships the real scheduling module will need.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <BrainCircuit className="h-5 w-5 text-[#006688]" />
                                <p className="mt-3 font-semibold text-slate-950">Learning Series</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Stores recurring programs like weekly drills, FAQ rotations, and quarterly finals.
                                </p>
                                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                                    Live count · {bridgeLoading ? '...' : bridge?.trainingOps.learningSeries ?? 0}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <CalendarClock className="h-5 w-5 text-[#006688]" />
                                <p className="mt-3 font-semibold text-slate-950">Learning Event</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Stores one concrete scheduled session with owner, time, materials, and optional exam.
                                </p>
                                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                                    Live count · {bridgeLoading ? '...' : bridge?.trainingOps.scheduledEvents ?? 0} scheduled
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                <Flag className="h-5 w-5 text-[#006688]" />
                                <p className="mt-3 font-semibold text-slate-950">Domain Ownership</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Keeps every missed final-exam topic traceable back to an accountable SME.
                                </p>
                                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                                    Live count · {bridgeLoading ? '...' : bridge?.trainingOps.productDomains ?? 0} domains
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Next build step</CardTitle>
                            <CardDescription className="text-slate-500">
                                After scheduling, the next phase is wiring the real exam and analytics engines back in.
                            </CardDescription>
                        </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="rounded-2xl border border-[#b8ecff] bg-[#effbff] p-5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#006688]">Step 3 preview</p>
                                    <p className="mt-2 text-lg font-semibold text-slate-950">Bridge current exam pipeline</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                        Draft: {bridgeLoading ? '...' : bridge?.exams.draftExams ?? 0} · Pending review: {bridgeLoading ? '...' : bridge?.exams.pendingReviewExams ?? 0} · Approved: {bridgeLoading ? '...' : bridge?.exams.approvedExams ?? 0} · Published: {bridgeLoading ? '...' : bridge?.exams.publishedExams ?? 0}
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent real exams</p>
                                    {(recentExams.length > 0 ? recentExams : []).slice(0, 3).map((exam) => (
                                        <div key={exam.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="font-semibold text-slate-950">{exam.title}</p>
                                                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">{exam.status}</Badge>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-600">
                                                {exam.questionCount} questions · {exam.invitationCount} invitations · {exam.attemptCount} attempts
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Link href="/admin/training-ops-prototype">
                                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                            Overview
                                        </Button>
                                    </Link>
                                    <Link href="/admin/training-ops/events">
                                        <Button variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]">
                                            Event Catalog
                                        </Button>
                                    </Link>
                                    <Link href="/admin/analytics">
                                        <Button className="bg-[#006688] text-white hover:bg-[#0a7696]">
                                            Compare current analytics
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
