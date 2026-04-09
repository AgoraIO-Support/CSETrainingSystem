'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainEffectivenessSummary, SmeWorkspaceSummary } from '@/types'
import { AlertTriangle, Award, CalendarClock, GraduationCap, Loader2, TrendingUp, Users } from 'lucide-react'

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

        return {
            domains: domains.length,
            series: series.length,
            events: events.length,
            scheduledEvents: events.filter((item) => item.status === 'SCHEDULED').length,
            atRiskDomains: effectiveness.filter((item) => item.status === 'AT_RISK').length,
            weakTopics: overview?.weakTopics.length ?? 0,
            learnerGaps: overview?.learnerGaps.length ?? 0,
        }
    }, [overview])

    const spotlightDomains = (overview?.effectiveness ?? []).slice(0, 4)
    const recentEvents = (overview?.events ?? []).slice(0, 6)
    const weakTopics = overview?.weakTopics ?? []
    const learnerGaps = overview?.learnerGaps ?? []

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-5 p-7 md:p-8">
                            <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                                SME Workspace
                            </Badge>
                            <div className="space-y-3">
                                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                                    Manage your domains, schedule training, and monitor learning impact
                                </h1>
                                <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                                    This workspace is scoped to the product domains and learning series you own. Use it to
                                    keep cadence on track, organize events, and watch pass-rate movement in the areas you support.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/sme/training-ops/domains"><Button variant="outline">My Domains</Button></Link>
                                <Link href="/sme/training-ops/series"><Button variant="outline">My Series</Button></Link>
                                <Link href="/sme/training-ops/badges"><Button variant="outline">My Badges</Button></Link>
                                <Link href="/sme/training-ops/events"><Button>My Events</Button></Link>
                                <Link href="/sme/training-ops/effectiveness"><Button variant="outline">Effectiveness</Button></Link>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl text-slate-950">Operating Goals</CardTitle>
                            <CardDescription className="text-slate-500">
                                Keep these three signals visible every week.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-slate-600">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Keep event cadence</p>
                                <p className="mt-1">Maintain weekly or release-driven learning sessions for your owned products.</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Move pass rates</p>
                                <p className="mt-1">Use case study and knowledge sharing sessions to improve effectiveness over time.</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Close knowledge gaps</p>
                                <p className="mt-1">Watch weak topics and struggling learners before they show up in formal assessments.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Owned Domains</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.domains}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains currently in your SME scope.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active Series</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.series}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Series you own directly or inherit through domain ownership.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Scheduled Events</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.scheduledEvents}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Upcoming sessions already placed on the calendar.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>At-Risk Domains</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.atRiskDomains}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains currently below challenge threshold.</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">My Domain Snapshot</CardTitle>
                            <CardDescription className="text-slate-500">
                                Effectiveness summary for the domains you directly influence.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {loading ? (
                                <div className="flex h-32 items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Loading workspace snapshot...
                                </div>
                            ) : spotlightDomains.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No domains are currently assigned to your SME scope.
                                </div>
                            ) : (
                                spotlightDomains.map((row: ProductDomainEffectivenessSummary) => (
                                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-slate-950">{row.name}</p>
                                                <p className="mt-1 text-sm text-slate-500">
                                                    {row.track} · {row.kpiMode} · {row.gradedAttempts} graded attempts
                                                </p>
                                            </div>
                                            <Badge variant="outline">{row.status.replaceAll('_', ' ')}</Badge>
                                        </div>
                                        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
                                            <div>
                                                <p className="text-slate-500">Current</p>
                                                <p className="mt-1 text-lg font-semibold text-slate-950">{row.currentPassRate}%</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Baseline / Target</p>
                                                <p className="mt-1 text-lg font-semibold text-slate-950">{row.baselinePassRate ?? '—'}% / {row.targetPassRate ?? '—'}%</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">Delta</p>
                                                <p className="mt-1 text-lg font-semibold text-slate-950">
                                                    {row.deltaFromBaseline === null ? '—' : `${row.deltaFromBaseline > 0 ? '+' : ''}${row.deltaFromBaseline}%`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl text-slate-950">Quick Actions</CardTitle>
                            <CardDescription className="text-slate-500">
                                Common SME actions for weekly execution.
                            </CardDescription>
                        </CardHeader>
                            <CardContent className="grid gap-3">
                            <Link href="/sme/training-ops/domains"><Button variant="outline" className="w-full justify-start"><Users className="mr-2 h-4 w-4" />Open My Domains</Button></Link>
                            <Link href="/sme/training-ops/series"><Button variant="outline" className="w-full justify-start"><GraduationCap className="mr-2 h-4 w-4" />Open My Series</Button></Link>
                            <Link href="/sme/training-ops/badges"><Button variant="outline" className="w-full justify-start"><Award className="mr-2 h-4 w-4" />Open My Badges</Button></Link>
                            <Link href="/sme/training-ops/events/new"><Button className="w-full justify-start"><CalendarClock className="mr-2 h-4 w-4" />Create Learning Event</Button></Link>
                            <Link href="/sme/training-ops/events"><Button variant="outline" className="w-full justify-start"><GraduationCap className="mr-2 h-4 w-4" />Review My Events</Button></Link>
                            <Link href="/sme/training-ops/effectiveness"><Button variant="outline" className="w-full justify-start"><TrendingUp className="mr-2 h-4 w-4" />Open Effectiveness View</Button></Link>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Recent Events</CardTitle>
                            <CardDescription className="text-slate-500">
                                Your most recent or upcoming scoped training events.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {loading ? (
                                <div className="flex h-24 items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Loading events...
                                </div>
                            ) : recentEvents.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                                    No scoped events available yet.
                                </div>
                            ) : (
                                recentEvents.map((event) => (
                                    <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="font-medium text-slate-950">{event.title}</p>
                                                <p className="mt-1 text-sm text-slate-500">
                                                    {event.domain?.name ?? 'No domain'} · {event.series?.name ?? 'No series'}
                                                </p>
                                            </div>
                                            <Badge variant="outline">{event.status}</Badge>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
                                            <span>{event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Not scheduled'}</span>
                                            <span>·</span>
                                            <span>{event.exams.length} linked exam{event.exams.length === 1 ? '' : 's'}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Knowledge Gaps</CardTitle>
                            <CardDescription className="text-slate-500">
                                Topic-level misses and learner groups that need follow-up.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <AlertTriangle className="h-4 w-4 text-[#006688]" />
                                    Weak topics
                                </div>
                                <div className="mt-3 space-y-2">
                                    {weakTopics.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No weak topics surfaced yet.</p>
                                    ) : weakTopics.slice(0, 5).map((topic) => (
                                        <div key={`${topic.domainName}-${topic.topic}`} className="flex items-center justify-between text-sm">
                                            <div>
                                                <p className="font-medium text-slate-900">{topic.topic || 'Unlabeled topic'}</p>
                                                <p className="text-slate-500">{topic.domainName ?? 'Unmapped domain'}</p>
                                            </div>
                                            <Badge variant="outline">{topic.misses}/{topic.answered}</Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Users className="h-4 w-4 text-[#006688]" />
                                    Learner gap watchlist
                                </div>
                                <div className="mt-3 space-y-2">
                                    {learnerGaps.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No learner gap signals yet.</p>
                                    ) : learnerGaps.slice(0, 5).map((learner) => (
                                        <div key={learner.userId} className="flex items-center justify-between text-sm">
                                            <div>
                                                <p className="font-medium text-slate-900">{learner.name}</p>
                                                <p className="text-slate-500">{learner.email}</p>
                                            </div>
                                            <Badge variant="outline">{learner.passRate}% pass</Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
