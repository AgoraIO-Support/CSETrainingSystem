'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainSummary } from '@/types'
import { Loader2 } from 'lucide-react'

export default function SmeTrainingOpsDomainsPage() {
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsDomains()
                setDomains(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load scoped domains')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    const stats = useMemo(() => ({
        total: domains.length,
        active: domains.filter((item) => item.active).length,
        ai: domains.filter((item) => item.category === 'AI').length,
        rte: domains.filter((item) => item.category === 'RTE').length,
    }), [domains])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Domains</h1>
                        <p className="mt-1 text-muted-foreground">
                            Domains currently in your SME scope, with cadence, baseline, and reward signals. Create series under a domain first, then schedule events from those series.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/sme/training-ops/series">
                            <Button>My Series</Button>
                        </Link>
                        <Link href="/sme/training-ops/effectiveness">
                            <Button variant="outline">Effectiveness</Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains in your SME scope.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Actively scheduled domains.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>AI</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.ai}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">AI-focused domains you support.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>RTE</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.rte}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">RTE-focused domains you support.</p></CardContent></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Scoped Domains</CardTitle>
                        <CardDescription>Use these domains to plan cadence and decide where new events should be scheduled.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading domains...</div>
                        ) : domains.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No domains are currently assigned to your SME scope.</div>
                        ) : (
                            domains.map((domain) => (
                                <div key={domain.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge>{domain.category}</Badge>
                                                <Badge variant="outline">{domain.track}</Badge>
                                                <Badge variant="outline">{domain.kpiMode}</Badge>
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold">{domain.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {domain.cadence ?? 'No cadence'} · {domain.primarySme?.name ?? 'No primary SME'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link href="/sme/training-ops/series">
                                                <Button variant="outline">View Series</Button>
                                            </Link>
                                            <Link href="/sme/training-ops/effectiveness">
                                                <Button variant="outline">Effectiveness</Button>
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm text-muted-foreground">
                                        <div>Baseline: {domain.baselinePassRate ?? '—'}%</div>
                                        <div>Target: {domain.targetPassRate ?? '—'}%</div>
                                        <div>Challenge: {domain.challengeThreshold ?? '—'}%</div>
                                        <div>{domain.counts.learningSeries} series · {domain.counts.exams} exams</div>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                                        <div>
                                            Recent event:{' '}
                                            {domain.recentEvent
                                                ? `${domain.recentEvent.title}${domain.recentEvent.scheduledAt ? ` · ${new Date(domain.recentEvent.scheduledAt).toLocaleDateString()}` : ''}`
                                                : 'No recent event'}
                                        </div>
                                        <div>
                                            Rewards: {domain.rewards?.starAwards ?? 0} stars · {domain.rewards?.badgeAwards ?? 0} badges · {domain.rewards?.recognizedLearners ?? 0} learners
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
