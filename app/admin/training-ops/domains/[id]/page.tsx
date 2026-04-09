'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, Loader2, TrendingUp } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { BadgeMilestoneSummary, Exam, LearningEventSummary, ProductDomainEffectivenessSummary, ProductDomainSummary } from '@/types'

export default function TrainingOpsDomainDetailPage() {
    const params = useParams<{ id: string }>()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [domain, setDomain] = useState<ProductDomainSummary | null>(null)
    const [events, setEvents] = useState<LearningEventSummary[]>([])
    const [exams, setExams] = useState<Exam[]>([])
    const [badges, setBadges] = useState<BadgeMilestoneSummary[]>([])
    const [effectiveness, setEffectiveness] = useState<ProductDomainEffectivenessSummary | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const [domainRes, eventsRes, examsRes, badgesRes, effectivenessRes] = await Promise.all([
                    ApiClient.getTrainingOpsDomain(params.id),
                    ApiClient.getTrainingOpsEvents({ limit: 100, domainId: params.id }),
                    ApiClient.getAdminExams({ limit: 200 }),
                    ApiClient.getTrainingOpsBadgeMilestones({ limit: 100, domainId: params.id }),
                    ApiClient.getTrainingOpsEffectiveness(),
                ])

                setDomain(domainRes.data)
                setEvents(eventsRes.data)
                setExams(examsRes.data.filter((exam) => exam.productDomainId === params.id))
                setBadges(badgesRes.data)
                setEffectiveness(effectivenessRes.data.find((row) => row.id === params.id) ?? null)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load product domain overview')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [params.id])

    const recentEvents = useMemo(
        () =>
            [...events]
                .sort((a, b) => new Date(b.scheduledAt ?? b.createdAt).getTime() - new Date(a.scheduledAt ?? a.createdAt).getTime())
                .slice(0, 5),
        [events]
    )

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading product domain...
                </div>
            </DashboardLayout>
        )
    }

    if (!domain) {
        return (
            <DashboardLayout>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error || 'Product domain not found'}
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/training-ops/domains">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">{domain.name}</h1>
                            <p className="mt-1 text-muted-foreground">Domain overview for SME ownership, scheduling cadence, reward output, and assessment performance.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href={`/admin/training-ops/series/new?domainId=${domain.id}`}>
                            <Button>Create Series</Button>
                        </Link>
                        <Link href={`/admin/training-ops/domains/${domain.id}/edit`}>
                            <Button variant="outline">Edit Domain</Button>
                        </Link>
                    </div>
                </div>

                {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Domain Overview</CardTitle>
                            <CardDescription>Core ownership and KPI rules for this product line.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge>{domain.category}</Badge>
                                <Badge variant="outline">{domain.track}</Badge>
                                <Badge variant="outline">{domain.kpiMode}</Badge>
                                {!domain.active ? <Badge variant="outline">Inactive</Badge> : null}
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Primary SME</p>
                                    <p className="mt-2 font-medium">{domain.primarySme?.name ?? 'Unassigned'}</p>
                                    <p className="text-sm text-muted-foreground">{domain.primarySme?.email ?? 'No owner configured'}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cadence</p>
                                    <p className="mt-2 font-medium">{domain.cadence ?? 'Not set'}</p>
                                    <p className="text-sm text-muted-foreground">Backup SME: {domain.backupSme?.name ?? 'Not assigned'}</p>
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{domain.description || 'No description provided yet.'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Effectiveness Snapshot</CardTitle>
                            <CardDescription>Current performance movement based on linked exams and graded attempts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-lg border p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <TrendingUp className="h-4 w-4 text-[#006688]" />
                                    Current pass rate
                                </div>
                                <p className="mt-3 text-3xl font-semibold">{effectiveness?.currentPassRate ?? 0}%</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                    Baseline / Target
                                    <p className="mt-2 text-lg font-semibold text-foreground">
                                        {domain.baselinePassRate ?? '—'}% / {domain.targetPassRate ?? '—'}%
                                    </p>
                                </div>
                                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                    Challenge Threshold
                                    <p className="mt-2 text-lg font-semibold text-foreground">{domain.challengeThreshold ?? '—'}%</p>
                                </div>
                            </div>
                            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                Status
                                <p className="mt-2 text-lg font-semibold text-foreground">{effectiveness?.status?.replaceAll('_', ' ') ?? 'INSUFFICIENT DATA'}</p>
                                <p className="mt-2">
                                    {effectiveness?.passedAttempts ?? 0} passed / {effectiveness?.failedAttempts ?? 0} failed · {effectiveness?.gradedAttempts ?? 0} graded attempts
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Learning Series</CardDescription><CardTitle className="text-3xl">{domain.counts.learningSeries}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Series attached to this domain.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Learning Events</CardDescription><CardTitle className="text-3xl">{events.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Events currently mapped to this domain.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl">{exams.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Existing exams using this domain mapping.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Badge Milestones</CardDescription><CardTitle className="text-3xl">{badges.length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{domain.rewards?.starAwards ?? 0} stars · {domain.rewards?.badgeAwards ?? 0} badges awarded</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Events</CardTitle>
                            <CardDescription>Latest training sessions and assessments scheduled for this domain.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {recentEvents.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No events scheduled for this domain yet.</div>
                            ) : recentEvents.map((event) => (
                                <div key={event.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{event.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {event.series?.name || 'No series'} · {event.format}
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                <CalendarDays className="mr-1 inline h-4 w-4" />
                                                {event.scheduledAt ? new Date(event.scheduledAt).toLocaleString() : 'Not scheduled'}
                                            </p>
                                        </div>
                                        <Link href={`/admin/training-ops/events/${event.id}`}>
                                            <Button variant="outline">Open</Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Linked Exams</CardTitle>
                            <CardDescription>Current exams associated to this domain across practice, readiness, and formal assessment.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {exams.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No exams mapped to this domain yet.</div>
                            ) : exams.slice(0, 6).map((exam) => (
                                <div key={exam.id} className="rounded-lg border p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{exam.title}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {exam.status} · {exam.assessmentKind ?? 'UNCLASSIFIED'}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link href={`/admin/exams/${exam.id}`}>
                                                <Button variant="outline">Exam</Button>
                                            </Link>
                                            <Link href={`/admin/exams/${exam.id}/analytics`}>
                                                <Button variant="outline">Analytics</Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
