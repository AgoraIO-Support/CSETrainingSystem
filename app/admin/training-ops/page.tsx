'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainEffectivenessSummary, TrainingOpsBridge } from '@/types'
import { ArrowRight, Award, BrainCircuit, CalendarDays, GraduationCap, Loader2, ShieldCheck, Star } from 'lucide-react'

export default function TrainingOpsDashboardPage() {
    const [bridge, setBridge] = useState<TrainingOpsBridge | null>(null)
    const [effectiveness, setEffectiveness] = useState<ProductDomainEffectivenessSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [bridgeResponse, effectivenessResponse] = await Promise.all([
                    ApiClient.getTrainingOpsBridge(),
                    ApiClient.getTrainingOpsEffectiveness(),
                ])
                setBridge(bridgeResponse.data)
                setEffectiveness(effectivenessResponse.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load training operations dashboard')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [])

    const onTrackDomains = useMemo(
        () => effectiveness.filter((row) => row.status === 'ON_TRACK').length,
        [effectiveness]
    )

    const spotlightDomains = effectiveness.slice(0, 4)
    const topRewardDomains = bridge?.trainingOps.topRewardDomains ?? []
    const rewardedEvents = bridge?.trainingOps.rewardedEvents ?? []
    const topLearners = bridge?.rewards.topLearners ?? []

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
                    <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-5 p-7 md:p-8">
                            <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                                Training Ops
                            </Badge>
                            <div className="space-y-3">
                                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                                    Govern domain ownership, training operations, and cross-domain outcomes
                                </h1>
                                <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                                    Use this control tower to assign SME ownership, set KPI guardrails, bootstrap training structures,
                                    and compare event, effectiveness, and recognition signals across all domains.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/admin/training-ops/domains"><Button variant="outline">All Domains</Button></Link>
                                <Link href="/admin/training-ops/series"><Button variant="outline">All Series</Button></Link>
                                <Link href="/admin/training-ops/events"><Button variant="outline">All Events</Button></Link>
                                <Link href="/admin/training-ops/badges"><Button variant="outline">All Badges</Button></Link>
                                <Link href="/admin/training-ops/import"><Button variant="outline">Bootstrap Import</Button></Link>
                                <Link href="/admin/training-ops/effectiveness"><Button variant="outline">Cross-Domain Effectiveness</Button></Link>
                                <Link href="/admin/training-ops/leaderboard">
                                    <Button className="bg-[#006688] text-white hover:bg-[#0a7696]">
                                        Leaderboard
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl text-slate-950">Governance Focus</CardTitle>
                            <CardDescription className="text-slate-500">
                                The three system-level signals this dashboard keeps visible every week
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-slate-600">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Ownership coverage</p>
                                <p className="mt-1">Are the right SMEs assigned to the right domains, with enough active series to sustain execution?</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Cross-domain effectiveness</p>
                                <p className="mt-1">Are pass rates moving from baseline toward target, and which domains need governance attention?</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-900">Recognition coverage</p>
                                <p className="mt-1">Are stars, badges, and formal certifications appearing where training activity is actually happening?</p>
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
                    <Card><CardHeader className="pb-2"><CardDescription>Active Domains</CardDescription><CardTitle className="text-3xl">{loading ? '...' : bridge?.trainingOps.activeProductDomains ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Configured product lines in active circulation.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Scheduled Events</CardDescription><CardTitle className="text-3xl">{loading ? '...' : bridge?.trainingOps.scheduledEvents ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Live or upcoming learning events.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Domains On Track</CardDescription><CardTitle className="text-3xl">{loading ? '...' : onTrackDomains}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains currently meeting target pass rate.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Recognized Learners</CardDescription><CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.learnersWithRecognition ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{loading ? '...' : `${bridge?.rewards.starAwards ?? 0} stars · ${bridge?.rewards.badgeAwards ?? 0} badges`}</p></CardContent></Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Practice Rewards</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.starAwards ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Star awards issued from practice, case-study, and readiness activity.
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Badge Progression</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.badgeAwards ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Milestone unlocks generated from accumulated training stars.
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Formal Certifications</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.formalCertificateCount ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Certificates issued from formal assessments only.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Domain Performance Spotlight</CardTitle>
                            <CardDescription className="text-slate-500">Use this to see which SME-owned domains are improving and which need intervention.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {loading ? (
                                <div className="flex h-32 items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Loading effectiveness snapshot...
                                </div>
                            ) : spotlightDomains.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No effectiveness data yet.</div>
                            ) : spotlightDomains.map((row) => (
                                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-slate-950">{row.name}</p>
                                            <p className="mt-1 text-sm text-slate-500">{row.primarySme?.name ?? 'Unassigned SME'} · {row.track}</p>
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
                                            <p className="text-slate-500">Attempts</p>
                                            <p className="mt-1 text-lg font-semibold text-slate-950">{row.gradedAttempts}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <Progress value={Math.max(0, Math.min(100, row.currentPassRate))} className="h-2" />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl text-slate-950">Top Reward Domains</CardTitle>
                                <CardDescription className="text-slate-500">Which domains are producing the most learner recognition right now.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {loading ? (
                                    <div className="flex h-24 items-center justify-center text-muted-foreground">
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Loading reward domains...
                                    </div>
                                ) : topRewardDomains.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No reward data yet.</div>
                                ) : topRewardDomains.map((row) => (
                                    <div key={row.domainId ?? row.domainName} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="font-medium text-slate-950">{row.domainName ?? 'Unmapped domain'}</p>
                                                <p className="mt-1 text-sm text-slate-500">{row.recognizedLearners} recognized learners</p>
                                            </div>
                                            <div className="text-right text-sm text-slate-600">
                                                <div>{row.starAwards} stars</div>
                                                <div>{row.badgeAwards} badges</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl text-slate-950">Immediate Actions</CardTitle>
                                <CardDescription className="text-slate-500">Common next steps for weekly operations.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3">
                                <Link href="/admin/training-ops/events/new"><Button className="w-full justify-start"><CalendarDays className="mr-2 h-4 w-4" />Create Learning Event</Button></Link>
                                <Link href="/admin/training-ops/domains/new"><Button variant="outline" className="w-full justify-start"><ShieldCheck className="mr-2 h-4 w-4" />Create Product Domain</Button></Link>
                                <Link href="/admin/training-ops/series/new"><Button variant="outline" className="w-full justify-start"><GraduationCap className="mr-2 h-4 w-4" />Create Learning Series</Button></Link>
                                <Link href="/admin/training-ops/badges/new"><Button variant="outline" className="w-full justify-start"><Award className="mr-2 h-4 w-4" />Create Badge Milestone</Button></Link>
                                <Link href="/admin/training-ops-prototype"><Button variant="ghost" className="w-full justify-start"><BrainCircuit className="mr-2 h-4 w-4" />Open Prototype View</Button></Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Reward-Producing Events</CardTitle>
                            <CardDescription className="text-slate-500">Which events are actually producing stars and badges, not just getting scheduled.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {loading ? (
                                <div className="flex h-24 items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Loading rewarded events...
                                </div>
                            ) : rewardedEvents.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No reward-producing events yet.</div>
                            ) : rewardedEvents.map((event) => (
                                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-slate-950">{event.title}</p>
                                            <p className="mt-1 text-sm text-slate-500">{event.domainName ?? 'Unmapped domain'} · {event.scheduledAt ? new Date(event.scheduledAt).toLocaleDateString() : 'No date'}</p>
                                        </div>
                                        <Link href={`/admin/training-ops/events/${event.id}`}>
                                            <Button variant="outline">Open</Button>
                                        </Link>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
                                        <Badge>{event.starAwards} stars</Badge>
                                        <Badge variant="outline">{event.badgeAwards} badges</Badge>
                                        <Badge variant="outline">{event.recognizedLearners} learners</Badge>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-2xl text-slate-950">Top Learners</CardTitle>
                            <CardDescription className="text-slate-500">Current recognition leaderboard across training operations.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {loading ? (
                                <div className="flex h-24 items-center justify-center text-muted-foreground">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Loading top learners...
                                </div>
                            ) : topLearners.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No learner reward data yet.</div>
                            ) : topLearners.slice(0, 5).map((learner, index) => (
                                <div key={learner.userId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-white font-semibold text-slate-700">{index + 1}</div>
                                            <div>
                                                <p className="font-medium text-slate-950">{learner.name}</p>
                                                <p className="text-sm text-slate-500">{learner.email}</p>
                                            </div>
                                        </div>
                                        <div className="text-right text-sm">
                                            <div className="font-semibold text-slate-950"><Star className="mr-1 inline h-4 w-4 text-[#006688]" />{learner.stars}</div>
                                            <div className="text-slate-500">{learner.badges} badges</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl text-slate-950">Formal Certification Reporting</CardTitle>
                        <CardDescription className="text-slate-500">
                            Keep formal certificates visibly separate from daily practice rewards.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <div className="flex h-24 items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Loading formal certification data...
                            </div>
                        ) : (bridge?.rewards.certificateExams.length ?? 0) === 0 ? (
                            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                                No issued certificates from formal exams yet.
                            </div>
                        ) : bridge!.rewards.certificateExams.map((exam) => (
                            <div key={exam.examId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-medium text-slate-950">{exam.title}</p>
                                        <p className="mt-1 text-sm text-slate-500">
                                            {exam.learnerCount} certified learners
                                        </p>
                                    </div>
                                    <div className="text-right text-sm text-slate-600">
                                        <div>{exam.certificateCount} certificates</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
