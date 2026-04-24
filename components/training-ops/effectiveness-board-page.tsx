'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainEffectivenessSummary } from '@/types'
import { AlertTriangle, ArrowLeft, Loader2, Target, TrendingUp } from 'lucide-react'

const statusTone: Record<ProductDomainEffectivenessSummary['status'], string> = {
    ON_TRACK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    MONITOR: 'bg-amber-50 text-amber-700 border-amber-200',
    AT_RISK: 'bg-rose-50 text-rose-700 border-rose-200',
    INSUFFICIENT_DATA: 'bg-slate-100 text-slate-700 border-slate-200',
}

type EffectivenessView = 'admin' | 'sme'

interface EffectivenessBoardPageProps {
    view: EffectivenessView
}

export function EffectivenessBoardPage({ view }: EffectivenessBoardPageProps) {
    const isAdmin = view === 'admin'
    const [rows, setRows] = useState<ProductDomainEffectivenessSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true)
                const response = isAdmin
                    ? await ApiClient.getTrainingOpsEffectiveness()
                    : await ApiClient.getSmeTrainingOpsEffectiveness()
                setRows(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load effectiveness board')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [isAdmin])

    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return rows
        return rows.filter((row) =>
            row.name.toLowerCase().includes(query) ||
            row.primarySme?.name?.toLowerCase().includes(query) ||
            row.category.toLowerCase().includes(query) ||
            row.track.toLowerCase().includes(query)
        )
    }, [rows, search])

    const summary = useMemo(() => {
        const onTrack = filteredRows.filter((row) => row.status === 'ON_TRACK').length
        const atRisk = filteredRows.filter((row) => row.status === 'AT_RISK').length
        const activeDomains = filteredRows.length
        const avgPassRate = filteredRows.length > 0
            ? Math.round(filteredRows.reduce((sum, row) => sum + row.currentPassRate, 0) / filteredRows.length)
            : 0

        return { onTrack, atRisk, activeDomains, avgPassRate }
    }, [filteredRows])

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
                                {isAdmin ? 'Cross-Domain Effectiveness' : 'My Effectiveness'}
                            </h1>
                            <p className="mt-1 text-muted-foreground">
                                {isAdmin
                                    ? 'Track pass-rate movement against KPI guardrails across all domains and identify where governance intervention is needed.'
                                    : 'Track pass-rate movement against baseline, target, and challenge thresholds for your owned domains.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {isAdmin ? (
                            <>
                                <Link href="/admin/training-ops/domains">
                                    <Button variant="outline">All Domains</Button>
                                </Link>
                                <Link href="/admin/training-ops/series">
                                    <Button variant="outline">All Series</Button>
                                </Link>
                                <Link href="/admin/training-ops/events">
                                    <Button variant="outline">All Events</Button>
                                </Link>
                                <Link href="/admin/training-ops/leaderboard">
                                    <Button variant="outline">Leaderboard</Button>
                                </Link>
                            </>
                        ) : (
                            <>
                                <Link href="/sme">
                                    <Button variant="outline">Workspace</Button>
                                </Link>
                                <Link href="/sme/training-ops/events">
                                    <Button variant="outline">My Events</Button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Tracked Domains</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.activeDomains}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains with live effectiveness data.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Average Current Pass Rate</CardDescription><CardTitle className="text-3xl">{loading ? '...' : `${summary.avgPassRate}%`}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{isAdmin ? 'Mean pass rate across the filtered domains.' : 'Mean pass rate across your filtered domains.'}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>On Track</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.onTrack}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains currently meeting target pass rate.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>At Risk</CardDescription><CardTitle className="text-3xl">{loading ? '...' : summary.atRisk}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Domains already below challenge threshold.</p></CardContent></Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Search Domains</CardTitle>
                        <CardDescription>{isAdmin ? 'Filter by domain name, SME owner, category, or track.' : 'Filter by domain name, category, or track.'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={isAdmin ? 'Search domains or SME owners...' : 'Search domains...'}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{isAdmin ? 'Cross-Domain Board' : 'Domain Effectiveness Board'}</CardTitle>
                        <CardDescription>
                            {isAdmin
                                ? 'Current pass rate is calculated from graded attempts on exams mapped to each product domain across the whole workspace.'
                                : 'Current pass rate is calculated from graded attempts on exams mapped to each product domain inside your SME scope.'}
                        </CardDescription>
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
                                Loading effectiveness metrics...
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No product domains match the current search.
                            </div>
                        ) : (
                            filteredRows.map((row) => (
                                <div key={row.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-lg font-semibold">{row.name}</p>
                                                <Badge variant="outline">{row.category}</Badge>
                                                <Badge variant="outline">{row.track}</Badge>
                                                <Badge variant="outline">{row.kpiMode}</Badge>
                                                <Badge className={statusTone[row.status]}>{row.status.replace('_', ' ')}</Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {isAdmin
                                                    ? `SME owner: ${row.primarySme?.name ?? 'Unassigned'} · Cadence: ${row.cadence ?? 'Not set'}`
                                                    : `Cadence: ${row.cadence ?? 'Not set'} · ${row.gradedAttempts} graded attempts`}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline">{row.linkedExamCount} exams</Badge>
                                            <Badge variant="outline">{row.scheduledEventCount} scheduled events</Badge>
                                            {isAdmin ? <Badge variant="outline">{row.gradedAttempts} graded attempts</Badge> : null}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-4 lg:grid-cols-4">
                                        <div className="rounded-lg border bg-slate-50 p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                <TrendingUp className="h-4 w-4 text-[#006688]" />
                                                Current pass rate
                                            </div>
                                            <p className="mt-3 text-3xl font-semibold">{row.currentPassRate}%</p>
                                        </div>
                                        <div className="rounded-lg border bg-slate-50 p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                <Target className="h-4 w-4 text-[#006688]" />
                                                Baseline / target
                                            </div>
                                            <p className="mt-3 text-xl font-semibold">
                                                {row.baselinePassRate ?? '—'}% / {row.targetPassRate ?? '—'}%
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                Delta {row.deltaFromBaseline === null ? '—' : `${row.deltaFromBaseline > 0 ? '+' : ''}${row.deltaFromBaseline}%`}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border bg-slate-50 p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                <AlertTriangle className="h-4 w-4 text-[#006688]" />
                                                Target gap
                                            </div>
                                            <p className="mt-3 text-xl font-semibold">
                                                {row.targetGap === null ? '—' : `${row.targetGap > 0 ? '-' : '+'}${Math.abs(row.targetGap)}%`}
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                Challenge threshold {row.challengeThreshold ?? '—'}%
                                            </p>
                                        </div>
                                        <div className="rounded-lg border bg-slate-50 p-4">
                                            <div className="text-sm font-medium text-slate-700">Attempts</div>
                                            <p className="mt-3 text-xl font-semibold">
                                                {row.passedAttempts} passed / {row.failedAttempts} failed
                                            </p>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                Performance exams: {row.performanceExamCount}
                                            </p>
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
