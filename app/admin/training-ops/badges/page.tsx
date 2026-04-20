'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import type { BadgeMilestoneSummary, ProductDomainSummary } from '@/types'
import { ArrowLeft, Award, FileJson, Loader2, Plus } from 'lucide-react'

const EMPTY_OPTION = '__all__'

export default function TrainingOpsBadgesPage() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [badges, setBadges] = useState<BadgeMilestoneSummary[]>([])
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [filters, setFilters] = useState({
        search: '',
        active: EMPTY_OPTION,
        domainId: EMPTY_OPTION,
    })

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                setError(null)

                const [badgesResponse, domainsResponse] = await Promise.all([
                    ApiClient.getTrainingOpsBadgeMilestones({
                        limit: 100,
                        search: filters.search || undefined,
                        active: filters.active === EMPTY_OPTION ? undefined : filters.active === 'true',
                        domainId: filters.domainId === EMPTY_OPTION ? undefined : filters.domainId,
                    }),
                    ApiClient.getTrainingOpsDomains({ limit: 100 }),
                ])

                setBadges(badgesResponse.data)
                setDomains(domainsResponse.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load badge milestones')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [filters])

    const stats = useMemo(() => {
        const active = badges.filter((item) => item.active).length
        const domainScoped = badges.filter((item) => item.domain).length
        const totalAwards = badges.reduce((sum, item) => sum + item.awardCount, 0)

        return {
            total: badges.length,
            active,
            domainScoped,
            totalAwards,
        }
    }, [badges])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/training-ops">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Badge Milestones</h1>
                            <p className="mt-1 text-muted-foreground">
                                Define star thresholds that convert consistent practice into visible recognition.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/admin/training-ops/leaderboard">
                            <Button variant="outline">Learner Leaderboard</Button>
                        </Link>
                        <Link href="/admin/training-ops/badges/import">
                            <Button variant="outline">
                                <FileJson className="mr-2 h-4 w-4" />
                                Import JSON
                            </Button>
                        </Link>
                        <Link href="/admin/training-ops/badges/new">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Badge Milestone
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Milestones</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : stats.total}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Configured badge thresholds.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Active</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : stats.active}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Currently eligible for auto-award.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Domain Scoped</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : stats.domainScoped}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Milestones tied to a specific product domain.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Awards</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : stats.totalAwards}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Badge awards already issued to learners.</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Filters</CardTitle>
                        <CardDescription>Filter milestones by search text, active state, or domain scope.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="search">Search</Label>
                            <Input
                                id="search"
                                value={filters.search}
                                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                                placeholder="Search badge name or slug..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="active">Active</Label>
                            <select
                                id="active"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={filters.active}
                                onChange={(event) => setFilters((prev) => ({ ...prev, active: event.target.value }))}
                            >
                                <option value={EMPTY_OPTION}>All milestones</option>
                                <option value="true">Active only</option>
                                <option value="false">Inactive only</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="domainId">Domain</Label>
                            <select
                                id="domainId"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={filters.domainId}
                                onChange={(event) => setFilters((prev) => ({ ...prev, domainId: event.target.value }))}
                            >
                                <option value={EMPTY_OPTION}>All domains</option>
                                {domains.map((domain) => (
                                    <option key={domain.id} value={domain.id}>
                                        {domain.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Badge Catalog</CardTitle>
                        <CardDescription>Manage domain-based recognition milestones.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {error ? (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {error}
                            </div>
                        ) : null}

                        {loading ? (
                            <div className="flex h-32 items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Loading badge milestones...
                            </div>
                        ) : badges.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No badge milestones match the current filters.
                            </div>
                        ) : (
                            badges.map((badge) => (
                                <div key={badge.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge>{badge.active ? 'Active' : 'Inactive'}</Badge>
                                                {badge.domain ? <Badge variant="outline">{badge.domain.name}</Badge> : null}
                                            </div>
                                            <div>
                                                <p className="text-lg font-semibold">{badge.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {badge.slug} · unlocks at {badge.thresholdStars} star{badge.thresholdStars === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link href={`/admin/training-ops/badges/${badge.id}/edit`}>
                                                <Button variant="outline">Edit</Button>
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                                        <div>{badge.description || 'No description provided.'}</div>
                                        <div className="flex items-center gap-2">
                                            <Award className="h-4 w-4 text-[#006688]" />
                                            {badge.awardCount} award{badge.awardCount === 1 ? '' : 's'} issued
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
