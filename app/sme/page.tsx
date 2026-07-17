'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { OpsHero, SectionHeading, SignalCard } from '@/components/training-ops/overview-primitives'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainEffectivenessSummary, SmeWorkspaceSummary } from '@/types'
import {
    AlertTriangle,
    ArrowUpRight,
    BarChart3,
    BookOpen,
    CalendarClock,
    FileText,
    GraduationCap,
    Loader2,
    Target,
    Users,
} from 'lucide-react'

const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return 'Date not set'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Date not set'
    return date.toLocaleString()
}

const effectivenessTone: Record<ProductDomainEffectivenessSummary['status'], string> = {
    ON_TRACK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    MONITOR: 'border-amber-200 bg-amber-50 text-amber-700',
    AT_RISK: 'border-rose-200 bg-rose-50 text-rose-700',
    INSUFFICIENT_DATA: 'border-slate-200 bg-slate-100 text-slate-700',
}

export default function SmeDashboardPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [overview, setOverview] = useState<SmeWorkspaceSummary | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsOverview()
                setOverview(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME workspace')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [])

    const summary = useMemo(() => {
        const domains = overview?.domains ?? []
        const series = overview?.series ?? []
        const events = overview?.events ?? []
        const effectiveness = overview?.effectiveness ?? []
        const meaningfulLearnerGaps = (overview?.learnerGaps ?? []).filter((learner) => learner.passRate < 80)

        return {
            domains: domains.length,
            programs: series.filter((item) => item.isActive).length,
            scheduledEvents: events.filter((item) => item.status === 'SCHEDULED' && item.scheduledAt).length,
            needsScheduling: events.filter((item) => item.status === 'SCHEDULED' && !item.scheduledAt).length,
            atRiskDomains: effectiveness.filter((item) => item.status === 'AT_RISK').length,
            learnerGaps: meaningfulLearnerGaps.length,
            attentionItems:
                events.filter((item) => item.status === 'SCHEDULED' && !item.scheduledAt).length +
                meaningfulLearnerGaps.length +
                effectiveness.filter((item) => item.status === 'AT_RISK').length,
        }
    }, [overview])

    const domainHealth = overview?.effectiveness ?? []
    const recentEvents = (overview?.events ?? []).slice(0, 5)
    const activePrograms = (overview?.series ?? []).filter((item) => item.isActive).slice(0, 4)
    const weakTopics = (overview?.weakTopics ?? []).filter((topic) => topic.answered > 0).slice(0, 5)
    const learnerGaps = (overview?.learnerGaps ?? []).filter((learner) => learner.passRate < 80).slice(0, 5)

    return (
        <DashboardLayout>
            <div className="space-y-8 pb-8">
                <OpsHero
                    eyebrow="SME · Training Ops"
                    title="Operate your learning scope from one clear workspace."
                    description="Keep programs moving, resolve unscheduled sessions, and act on capability gaps across the product domains you own."
                    scope={loading ? 'Loading owned domains' : `${summary.domains} owned domains`}
                    meta="Ownership-scoped view"
                    actions={(
                        <>
                            <Link href="/sme/training-ops/events/new">
                                <Button className="bg-[#00b7df] text-[#05202a] hover:bg-[#67dcf3]"><CalendarClock className="mr-2 h-4 w-4" />Create event</Button>
                            </Link>
                            <Link href="/sme/training-ops/series">
                                <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white hover:text-slate-950"><GraduationCap className="mr-2 h-4 w-4" />Learning programs</Button>
                            </Link>
                        </>
                    )}
                />

                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        SME workspace data is unavailable: {error}
                    </div>
                ) : null}

                {loading || !overview ? (
                    <Card className="border-slate-200 bg-white shadow-sm">
                        <CardContent className="flex h-72 items-center justify-center text-slate-500">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading your learning scope...
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <section aria-label="SME operating signals" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <SignalCard
                                label="Owned domains"
                                value={summary.domains}
                                hint="Your governance and effectiveness scope."
                                icon={Target}
                            />
                            <SignalCard
                                label="Active programs"
                                value={summary.programs}
                                hint="Recurring or release-driven learning programs in your scope."
                                icon={GraduationCap}
                                tone="positive"
                            />
                            <SignalCard
                                label="Calendar ready"
                                value={summary.scheduledEvents}
                                denominator={`${summary.needsScheduling} need dates`}
                                hint="Only scheduled events with an actual date count as calendar ready."
                                icon={CalendarClock}
                                tone={summary.needsScheduling > 0 ? 'warning' : 'positive'}
                            />
                            <SignalCard
                                label="Needs attention"
                                value={summary.attentionItems}
                                denominator={`${summary.atRiskDomains} domain risk`}
                                hint={`${summary.learnerGaps} learners below the 80% watch threshold.`}
                                icon={AlertTriangle}
                                tone={summary.attentionItems > 0 ? 'risk' : 'positive'}
                            />
                        </section>

                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-5 py-4">
                            <span className="mr-2 text-sm font-semibold text-slate-800">Current scope</span>
                            {overview.domains.map((domain) => (
                                <Badge key={domain.id} variant="outline" className="border-cyan-200 bg-white text-[#006688]">{domain.name}</Badge>
                            ))}
                            <Link href="/sme/training-ops/domains" className="ml-auto text-sm font-semibold text-[#006688] hover:underline">Review ownership</Link>
                        </div>

                        <section className="space-y-5">
                            <SectionHeading
                                eyebrow="Weekly operating board"
                                title="What needs your attention now"
                                description="The workspace prioritizes executable gaps instead of repeating long-term operating guidance on every visit."
                            />
                            <div className="grid gap-5 lg:grid-cols-3">
                                <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-lg text-slate-950">Events missing dates</CardTitle>
                                        <CardDescription>Marked scheduled but not actually on the calendar.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-semibold tracking-[-0.05em] text-amber-800">{summary.needsScheduling}</p>
                                        <Link href="/sme/training-ops/events"><Button variant="outline" className="mt-5 w-full border-amber-200 bg-white">Review events</Button></Link>
                                    </CardContent>
                                </Card>
                                <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-lg text-slate-950">Learner gaps</CardTitle>
                                        <CardDescription>Scoped learners currently below 80% pass rate.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-semibold tracking-[-0.05em] text-rose-800">{summary.learnerGaps}</p>
                                        <Link href="#knowledge-gaps"><Button variant="outline" className="mt-5 w-full border-rose-200 bg-white">Review gaps</Button></Link>
                                    </CardContent>
                                </Card>
                                <Card className="border-slate-200 bg-white shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-lg text-slate-950">Capability health</CardTitle>
                                        <CardDescription>Domains currently below their configured threshold.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-4xl font-semibold tracking-[-0.05em] text-slate-950">{summary.atRiskDomains}</p>
                                        <Link href="/sme/training-ops/effectiveness"><Button variant="outline" className="mt-5 w-full">Open effectiveness</Button></Link>
                                    </CardContent>
                                </Card>
                            </div>
                        </section>

                        <section className="space-y-5">
                            <SectionHeading
                                eyebrow="Capability"
                                title="Domain health"
                                description="The same effectiveness language used by Admin, restricted to the domains you own."
                                action={<Link href="/sme/training-ops/effectiveness"><Button variant="outline"><BarChart3 className="mr-2 h-4 w-4" />Full effectiveness</Button></Link>}
                            />
                            {domainHealth.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">No domain effectiveness data is available in your scope.</div>
                            ) : (
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {domainHealth.map((row) => (
                                        <Card key={row.id} className="border-slate-200 bg-white shadow-sm">
                                            <CardContent className="p-5">
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="font-semibold text-slate-950">{row.name}</h3>
                                                            <Badge variant="outline" className={effectivenessTone[row.status]}>{row.status.replaceAll('_', ' ')}</Badge>
                                                        </div>
                                                        <p className="mt-1 text-sm text-slate-500">{row.track} · {row.gradedAttempts} graded attempts</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">{row.gradedAttempts > 0 ? `${row.currentPassRate}%` : 'No data'}</p>
                                                        <p className="text-xs text-slate-500">Target {row.targetPassRate ?? 'N/A'}%</p>
                                                    </div>
                                                </div>
                                                {row.gradedAttempts > 0 ? <Progress value={row.currentPassRate} className="mt-5 h-2" /> : null}
                                                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                                                    <div><p className="text-slate-400">Baseline</p><p className="font-semibold text-slate-800">{row.baselinePassRate ?? 'N/A'}%</p></div>
                                                    <div><p className="text-slate-400">Delta</p><p className="font-semibold text-slate-800">{row.deltaFromBaseline === null ? 'N/A' : `${row.deltaFromBaseline > 0 ? '+' : ''}${row.deltaFromBaseline}%`}</p></div>
                                                    <div><p className="text-slate-400">Target gap</p><p className="font-semibold text-slate-800">{row.targetGap === null ? 'N/A' : `${row.targetGap > 0 ? '+' : ''}${row.targetGap}%`}</p></div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="space-y-5">
                            <SectionHeading
                                eyebrow="Operations"
                                title="Programs and sessions"
                                description="Learning Programs define cadence; Events represent individual sessions. Courses and exams remain reusable content assets."
                            />
                            <div className="grid gap-6 xl:grid-cols-2">
                                <Card className="border-slate-200 bg-white shadow-sm">
                                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                                        <div><CardTitle className="text-xl text-slate-950">Learning Programs</CardTitle><CardDescription>Active programs in your ownership scope.</CardDescription></div>
                                        <Link href="/sme/training-ops/series"><Button size="sm" variant="outline">View all</Button></Link>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {activePrograms.length === 0 ? (
                                            <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No active learning programs are assigned.</div>
                                        ) : activePrograms.map((program) => (
                                            <div key={program.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-semibold text-slate-950">{program.name}</p>
                                                        <p className="mt-1 text-sm text-slate-500">{program.domain?.name ?? 'No domain'} · {program.cadence ?? 'Cadence not set'}</p>
                                                    </div>
                                                    <Badge variant="outline">{program.type.replaceAll('_', ' ')}</Badge>
                                                </div>
                                                <p className="mt-3 text-sm text-slate-600">{program.counts.events} events · {program.counts.exams} exams</p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>

                                <Card className="border-slate-200 bg-white shadow-sm">
                                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                                        <div><CardTitle className="text-xl text-slate-950">Recent Events</CardTitle><CardDescription>Sessions and scheduling state in your scope.</CardDescription></div>
                                        <Link href="/sme/training-ops/events"><Button size="sm" variant="outline">View all</Button></Link>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {recentEvents.length === 0 ? (
                                            <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No scoped events are available.</div>
                                        ) : recentEvents.map((event) => (
                                            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <p className="font-semibold text-slate-950">{event.title}</p>
                                                        <p className="mt-1 text-sm text-slate-500">{event.domain?.name ?? 'No domain'} · {event.series?.name ?? 'Standalone event'}</p>
                                                    </div>
                                                    <Badge variant="outline" className={event.status === 'SCHEDULED' && !event.scheduledAt ? 'border-amber-200 bg-amber-50 text-amber-700' : ''}>
                                                        {event.status === 'SCHEDULED' && !event.scheduledAt ? 'NEEDS DATE' : event.status}
                                                    </Badge>
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                                    <span>{formatDateTime(event.scheduledAt)}</span><span>·</span><span>{event.exams.length} exams</span><span>·</span><span>{event.courses.length} courses</span>
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        </section>

                        <section id="knowledge-gaps" className="scroll-mt-24 space-y-5">
                            <SectionHeading
                                eyebrow="Intervention"
                                title="Knowledge gaps"
                                description="Miss rates are labeled explicitly, and the learner watchlist excludes people already at or above the 80% threshold."
                            />
                            <div className="grid gap-6 xl:grid-cols-2">
                                <Card className="border-slate-200 bg-white shadow-sm">
                                    <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5 text-[#006688]" />Weak topics</CardTitle><CardDescription>Topic misses within your owned domains.</CardDescription></CardHeader>
                                    <CardContent className="space-y-3">
                                        {weakTopics.length === 0 ? (
                                            <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No weak topic signals are available.</div>
                                        ) : weakTopics.map((topic) => {
                                            const missRate = Math.round((topic.misses / topic.answered) * 100)
                                            const content = (
                                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-[#006688]/40 hover:bg-[#f2fbfd]">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div><p className="font-semibold text-slate-950">{topic.topic || 'Unlabeled topic'}</p><p className="text-sm text-slate-500">{topic.domainName ?? 'Unmapped domain'}</p></div>
                                                        <Badge variant="outline" className={missRate >= 40 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>{missRate}% miss rate</Badge>
                                                    </div>
                                                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{topic.misses} misses across {topic.answered} answered items</span><span className="inline-flex items-center font-medium text-[#006688]">View examples <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></span></div>
                                                </div>
                                            )
                                            return topic.domainId && topic.topic
                                                ? <Link key={`${topic.domainId}-${topic.topic}`} href={`/sme/training-ops/knowledge-gaps?kind=topic&topic=${encodeURIComponent(topic.topic)}&domainId=${topic.domainId}`}>{content}</Link>
                                                : <div key={`${topic.domainName}-${topic.topic}`}>{content}</div>
                                        })}
                                    </CardContent>
                                </Card>

                                <Card className="border-slate-200 bg-white shadow-sm">
                                    <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><Users className="h-5 w-5 text-[#006688]" />Learner watchlist</CardTitle><CardDescription>People below the 80% pass threshold in your scope.</CardDescription></CardHeader>
                                    <CardContent className="space-y-3">
                                        {learnerGaps.length === 0 ? (
                                            <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No learners are currently below the watch threshold.</div>
                                        ) : learnerGaps.map((learner) => (
                                            <Link key={learner.userId} href={`/sme/training-ops/knowledge-gaps?kind=learner&userId=${learner.userId}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006688]">
                                            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-[#006688]/40 hover:bg-[#f2fbfd] sm:flex-row sm:items-center">
                                                <div><p className="font-semibold text-slate-950">{learner.name}</p><p className="text-sm text-slate-500">{learner.email}</p><p className="mt-1 text-xs text-slate-500">{learner.gradedAttempts} graded · {learner.failedAttempts} failed</p></div>
                                                <div className="flex items-center gap-3"><Badge variant="outline" className="w-fit border-rose-200 bg-rose-50 text-rose-700">{learner.passRate}% pass</Badge><ArrowUpRight className="h-4 w-4 text-[#006688]" /></div>
                                            </div>
                                            </Link>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        </section>

                        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-6">
                            <Link href="/sme/training-ops/courses"><Button variant="outline"><BookOpen className="mr-2 h-4 w-4" />Courses</Button></Link>
                            <Link href="/sme/training-ops/exams"><Button variant="outline"><FileText className="mr-2 h-4 w-4" />Exams</Button></Link>
                            <Link href="/sme/training-ops/badges"><Button variant="outline"><Target className="mr-2 h-4 w-4" />Recognition rules</Button></Link>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    )
}
