'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainSummary } from '@/types'
import { ArrowLeft, FileJson, Loader2, Plus } from 'lucide-react'

type DomainCatalogView = 'admin' | 'sme'

interface DomainCatalogPageProps {
    view: DomainCatalogView
}

export function DomainCatalogPage({ view }: DomainCatalogPageProps) {
    const isAdmin = view === 'admin'
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const loadDomains = async () => {
            try {
                setLoading(true)
                const response = isAdmin
                    ? await ApiClient.getTrainingOpsDomains({ limit: 100, search: search || undefined })
                    : await ApiClient.getSmeTrainingOpsDomains()
                setDomains(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load product domains')
            } finally {
                setLoading(false)
            }
        }

        void loadDomains()
    }, [isAdmin, search])

    const stats = useMemo(() => {
        const active = domains.filter((domain) => domain.active).length
        const ai = domains.filter((domain) => domain.category === 'AI').length
        const rte = domains.filter((domain) => domain.category === 'RTE').length
        return { total: domains.length, active, ai, rte }
    }, [domains])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className={isAdmin ? 'flex items-center gap-4' : ''}>
                        {isAdmin ? (
                            <Link href="/admin/training-ops">
                                <Button variant="ghost" size="icon">
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            </Link>
                        ) : null}
                        <div>
                            <h1 className="text-3xl font-bold">
                                {isAdmin ? 'Domain Governance' : 'My Domains'}
                            </h1>
                            <p className="mt-1 text-muted-foreground">
                                {isAdmin
                                    ? 'Govern product-domain ownership, cadence rules, KPI thresholds, and cross-domain reward signals.'
                                    : 'Domains currently in your SME scope, with cadence, baseline, and reward signals. Create series under a domain first, then schedule events from those series.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {isAdmin ? (
                            <>
                                <Link href="/admin/training-ops/badges">
                                    <Button variant="outline">All Domain Badges</Button>
                                </Link>
                                <Link href="/admin/training-ops/effectiveness">
                                    <Button variant="outline">Cross-Domain Effectiveness</Button>
                                </Link>
                                <Link href="/admin/training-ops/domains/import">
                                    <Button variant="outline">
                                        <FileJson className="mr-2 h-4 w-4" />
                                        Import JSON
                                    </Button>
                                </Link>
                                <Link href="/admin/training-ops/domains/new">
                                    <Button>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create Domain
                                    </Button>
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link href="/sme/training-ops/series/new">
                                    <Button>Create Series</Button>
                                </Link>
                                <Link href="/sme/training-ops/series">
                                    <Button variant="outline">My Series</Button>
                                </Link>
                                <Link href="/sme/training-ops/badges">
                                    <Button variant="outline">Domain Badges</Button>
                                </Link>
                                <Link href="/sme/training-ops/effectiveness">
                                    <Button variant="outline">Effectiveness</Button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Configured product domains.' : 'Domains in your SME scope.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Participating in current scheduling.' : 'Actively scheduled domains.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>AI</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.ai}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'AI-focused domains.' : 'AI-focused domains you support.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>RTE</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.rte}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'RTE-focused domains.' : 'RTE-focused domains you support.'}</p></CardContent></Card>
                </div>

                {isAdmin ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Search Domains</CardTitle>
                            <CardDescription>Search by name, slug, or description.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product domains..." />
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>{isAdmin ? 'All Domains' : 'Scoped Domains'}</CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? 'Open a domain to manage SME ownership, cadence rules, KPI targets, and downstream training setup.'
                                : 'Use these domains to plan cadence and decide where new events should be scheduled.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading domains...</div>
                        ) : domains.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                {isAdmin ? 'No product domains found.' : 'No domains are currently assigned to your SME scope.'}
                            </div>
                        ) : (
                            domains.map((domain) => (
                                <div key={domain.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge>{domain.category}</Badge>
                                                <Badge variant="outline">{domain.track}</Badge>
                                                <Badge variant="outline">{domain.kpiMode}</Badge>
                                                {!domain.active ? <Badge variant="outline">Inactive</Badge> : null}
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold">{domain.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {isAdmin
                                                        ? `${domain.primarySme?.name ?? 'No primary SME'} · ${domain.cadence ?? 'No cadence'}`
                                                        : `${domain.cadence ?? 'No cadence'} · ${domain.primarySme?.name ?? 'No primary SME'}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {isAdmin ? (
                                                <>
                                                    <Link href={`/admin/training-ops/domains/${domain.id}`}>
                                                        <Button variant="outline">Overview</Button>
                                                    </Link>
                                                    <Link href={`/admin/training-ops/series/new?domainId=${domain.id}`}>
                                                        <Button variant="outline">Create Series</Button>
                                                    </Link>
                                                    <Link href={`/admin/training-ops/domains/${domain.id}/edit`}>
                                                        <Button variant="outline">Edit</Button>
                                                    </Link>
                                                </>
                                            ) : (
                                                <>
                                                    <Link href={`/sme/training-ops/series/new?domainId=${domain.id}`}>
                                                        <Button>Create Series</Button>
                                                    </Link>
                                                    <Link href="/sme/training-ops/series">
                                                        <Button variant="outline">View Series</Button>
                                                    </Link>
                                                    <Link href="/sme/training-ops/effectiveness">
                                                        <Button variant="outline">Effectiveness</Button>
                                                    </Link>
                                                </>
                                            )}
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
                                                : isAdmin ? 'No scheduled event yet' : 'No recent event'}
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
