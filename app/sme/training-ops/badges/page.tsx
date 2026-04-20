'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainSummary, SmeBadgeLadderOverview } from '@/types'
import { Loader2, PencilLine, Plus } from 'lucide-react'

export default function SmeTrainingOpsBadgesPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [overview, setOverview] = useState<SmeBadgeLadderOverview | null>(null)
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const [badgesResponse, domainsResponse] = await Promise.all([
                    ApiClient.getSmeTrainingOpsBadges(),
                    ApiClient.getSmeTrainingOpsDomains(),
                ])
                setOverview(badgesResponse.data)
                setDomains(domainsResponse.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load domain badge overview')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    const stats = useMemo(() => {
        const ladders = overview?.domainLadders ?? []
        return {
            domains: ladders.length,
            milestones: ladders.reduce((sum, ladder) => sum + ladder.milestones.length, 0),
            unlocks: ladders.reduce((sum, ladder) => sum + ladder.totalUnlocks, 0),
            learners: ladders.reduce((sum, ladder) => sum + ladder.recognizedLearners, 0),
        }
    }, [overview])

    const ladders = overview?.domainLadders ?? []
    const recentUnlocks = overview?.recentUnlocks ?? []
    const scopedDomainIds = useMemo(() => new Set(domains.map((domain) => domain.id)), [domains])
    const defaultCreateHref = domains[0] ? `/sme/training-ops/badges/new?domainId=${domains[0].id}` : '/sme/training-ops/badges/new'

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <Badge className="mb-3 w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                            SME Workspace
                        </Badge>
                        <h1 className="text-3xl font-bold">My Domain Badges</h1>
                        <p className="mt-1 text-muted-foreground">
                            Configure badge thresholds for domains in your SME scope, including domains you reach through owned series.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {domains.length > 0 ? (
                            <Link href={defaultCreateHref}>
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Badge
                                </Button>
                            </Link>
                        ) : null}
                        <Link href="/sme/training-ops/domains">
                            <Button variant="outline">My Domains</Button>
                        </Link>
                        <Link href="/sme/training-ops/events">
                            <Button variant="outline">My Events</Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Domains</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.domains}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains with visible badge progressions.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Milestones</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.milestones}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Configured badge thresholds across your domains.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Total Unlocks</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.unlocks}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Badge awards issued from your domains.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Recognized Learners</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.learners}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Distinct learners recognized by domain badges.</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Domain Badge Ladders</CardTitle>
                            <CardDescription>
                                Badges now unlock from cumulative stars inside each product domain.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <Badge className="bg-emerald-600 hover:bg-emerald-600">Manageable</Badge>
                                <span>All domains shown here are inside your SME scope, so you can create and edit their badge ladders.</span>
                            </div>
                            {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                            {loading ? (
                                <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading domain badge progressions...</div>
                            ) : ladders.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No domain badge progressions are currently available in your SME scope.
                                </div>
                            ) : (
                                ladders.map((ladder) => (
                                    <div key={ladder.domain.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-lg font-semibold">{ladder.domain.name}</p>
                                                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Manageable</Badge>
                                                </div>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {ladder.totalUnlocks} unlocks · {ladder.recognizedLearners} recognized learners
                                                    {ladder.latestUnlockedAt ? ` · latest ${new Date(ladder.latestUnlockedAt).toLocaleDateString()}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">{ladder.milestones.length} milestones</Badge>
                                                {scopedDomainIds.has(ladder.domain.id) ? (
                                                    <Link href={`/sme/training-ops/badges/new?domainId=${ladder.domain.id}`}>
                                                        <Button variant="outline" size="sm">
                                                            <Plus className="mr-2 h-4 w-4" />
                                                            Add Badge
                                                        </Button>
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                            {ladder.milestones.map((milestone) => (
                                                <div key={milestone.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                    <p className="font-medium text-slate-950">{milestone.name}</p>
                                                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                                        {milestone.thresholdStars} stars
                                                    </p>
                                                    <p className="mt-3 text-2xl font-semibold text-slate-950">{milestone.awardCount}</p>
                                                    <p className="text-sm text-slate-500">unlocks</p>
                                                    {milestone.description ? (
                                                        <p className="mt-3 text-sm leading-6 text-slate-600">{milestone.description}</p>
                                                    ) : null}
                                                    {scopedDomainIds.has(ladder.domain.id) ? (
                                                        <div className="mt-4">
                                                            <Link href={`/sme/training-ops/badges/${milestone.id}/edit`}>
                                                                <Button variant="outline" size="sm">
                                                                    <PencilLine className="mr-2 h-4 w-4" />
                                                                    Edit
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>How Domain Badges Work</CardTitle>
                                <CardDescription>
                                    Domain badges reflect cumulative practice within a product area instead of a single training path.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                                <div className="rounded-lg border p-4">
                                    Stars earned from any mapped event or exam contribute to the learner&apos;s domain total.
                                </div>
                                <div className="rounded-lg border p-4">
                                    When a learner crosses a configured domain threshold, the matching badge unlocks automatically.
                                </div>
                                <div className="rounded-lg border p-4">
                                    Domains visible in your SME workspace can be configured here, including domains you reach through owned series.
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Unlocks</CardTitle>
                                <CardDescription>Most recent domain badge awards in your scope.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {loading ? (
                                    <div className="flex h-24 items-center justify-center text-muted-foreground">
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Loading unlocks...
                                    </div>
                                ) : recentUnlocks.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                        No badge unlocks have been recorded yet.
                                    </div>
                                ) : recentUnlocks.map((unlock) => (
                                    <div key={unlock.id} className="rounded-lg border p-4">
                                        <p className="font-medium">{unlock.badge.name}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {unlock.domain.name} · {unlock.user.name} · {new Date(unlock.awardedAt).toLocaleString()}
                                        </p>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {unlock.event ? `Event: ${unlock.event.title}` : unlock.exam ? `Exam: ${unlock.exam.title}` : 'Domain reward'}
                                        </p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
