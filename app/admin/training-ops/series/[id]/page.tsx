'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Award, Loader2 } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import { ProgramAssociationManager } from '@/components/training-ops/program-association-manager'
import { ProgramSettingsCard } from '@/components/training-ops/program-settings-card'
import type { BadgeMilestoneSummary, LearningEventSummary, LearningSeriesSummary } from '@/types'

export default function TrainingOpsSeriesDetailPage() {
    const params = useParams<{ id: string }>()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [series, setSeries] = useState<LearningSeriesSummary | null>(null)
    const [events, setEvents] = useState<LearningEventSummary[]>([])
    const [badges, setBadges] = useState<BadgeMilestoneSummary[]>([])
    const [badgeTotal, setBadgeTotal] = useState(0)

    const loadData = useCallback(async () => {
        try {
            setLoading(true)
            const [seriesRes, eventsRes] = await Promise.all([
                ApiClient.getTrainingOpsSeriesById(params.id),
                ApiClient.getTrainingOpsEvents({ limit: 100, seriesId: params.id }),
            ])
            const badgesRes = seriesRes.data.domain?.id
                ? await ApiClient.getTrainingOpsBadgeMilestones({ limit: 100, domainId: seriesRes.data.domain.id })
                : { data: [] }

            setSeries(seriesRes.data)
            setEvents(eventsRes.data)
            setBadges(badgesRes.data)
            setBadgeTotal('pagination' in badgesRes ? badgesRes.pagination.total : 0)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load learning Program workspace')
        } finally {
            setLoading(false)
        }
    }, [params.id])

    useEffect(() => {
        void loadData()
    }, [loadData])

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading learning Program...
                </div>
            </DashboardLayout>
        )
    }

    if (!series) {
        return (
            <DashboardLayout>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error || 'Learning Program not found'}
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <BackButton fallbackHref="/admin/training-ops/series" />
                        <div>
                            <h1 className="text-3xl font-bold">{series.name}</h1>
                            <p className="mt-1 text-muted-foreground">One workspace for Program settings, content association, execution, and outcomes.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href={`/admin/training-ops/events/new?seriesId=${series.id}`}>
                            <Button>Create Event</Button>
                        </Link>
                        <Link href="#associations">
                            <Button variant="outline">Associate Existing</Button>
                        </Link>
                        <Link href="#settings">
                            <Button variant="outline">Program Settings</Button>
                        </Link>
                    </div>
                </div>

                {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card id="reward-output" className="scroll-mt-6">
                        <CardHeader>
                            <CardTitle>Program Overview</CardTitle>
                            <CardDescription>Default rules inherited by Events and Exams in this Program.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Badge>{series.type}</Badge>
                                {series.domain ? <Badge variant="outline">{series.domain.name}</Badge> : null}
                                {!series.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Owner</p>
                                    <p className="mt-2 font-medium">{series.owner?.name ?? 'Unassigned'}</p>
                                    <p className="text-sm text-muted-foreground">{series.owner?.email ?? 'No owner configured'}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cadence</p>
                                    <p className="mt-2 font-medium">{series.cadence ?? 'Not set'}</p>
                                </div>
                            </div>
                            <div className="rounded-lg border p-4">
                                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</p>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{series.description || 'No description provided yet.'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Reward Output</CardTitle>
                            <CardDescription>Recognition activity associated with this Program inside its owning Domain.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                                Reward output
                                <p className="mt-2 text-lg font-semibold text-foreground">
                                    {series.rewards?.starAwards ?? 0} stars · {series.rewards?.badgeAwards ?? 0} badges
                                </p>
                                <p className="mt-2">{series.rewards?.recognizedLearners ?? 0} recognized learners</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader><CardDescription>Events</CardDescription><CardTitle className="text-3xl"><Link className="hover:text-primary hover:underline" href="#associations">{series.counts.events}</Link></CardTitle></CardHeader></Card>
                    <Card><CardHeader><CardDescription>Linked Exams</CardDescription><CardTitle className="text-3xl"><Link className="hover:text-primary hover:underline" href="#associations">{series.counts.exams}</Link></CardTitle></CardHeader></Card>
                    <Card><CardHeader><CardDescription>Domain Badges</CardDescription><CardTitle className="text-3xl"><Link className="hover:text-primary hover:underline" href="#domain-badges">{badgeTotal}</Link></CardTitle></CardHeader></Card>
                    <Card><CardHeader><CardDescription>Last Reward Output</CardDescription><CardTitle className="text-3xl"><Link className="hover:text-primary hover:underline" href="#reward-output">{series.rewards?.recognizedLearners ?? 0}</Link></CardTitle></CardHeader></Card>
                </div>

                <ProgramAssociationManager
                    view="admin"
                    program={series}
                    programEvents={events}
                    onAssociated={loadData}
                />

                <ProgramSettingsCard
                    view="admin"
                    program={series}
                    onSaved={(updated) => {
                        setSeries(updated)
                        void loadData()
                    }}
                />

                <Card id="domain-badges" className="scroll-mt-6">
                    <CardHeader>
                        <CardTitle>Relevant Domain Badges</CardTitle>
                        <CardDescription>Recognition rules inherited from this Program&apos;s Domain.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {badges.slice(0, 3).map((badge) => (
                            <div key={badge.id} className="rounded-lg border p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-medium">{badge.name}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">Unlocks at {badge.thresholdStars} stars · {badge.domain?.name ?? 'Unassigned domain'}</p>
                                    </div>
                                    <Award className="h-5 w-5 text-[#006688]" />
                                </div>
                            </div>
                        ))}
                        {badges.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No Domain badges configured yet.</div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
