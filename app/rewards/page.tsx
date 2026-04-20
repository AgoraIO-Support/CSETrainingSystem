'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CertificatesSection } from '@/components/rewards/certificates-section'
import { ApiClient } from '@/lib/api-client'
import type { LearnerRewardsOverview } from '@/types'
import { Loader2, Star, Trophy, Award, ArrowRight } from 'lucide-react'

export default function RewardsPage() {
    const [overview, setOverview] = useState<LearnerRewardsOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getLearnerRewardsOverview()
                setOverview(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load rewards')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Rewards</h1>
                        <p className="mt-1 text-muted-foreground">
                            Track stars, unlocked badges, and where your learning wins came from.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/training">
                            <Button variant="outline">My Learning</Button>
                        </Link>
                        <Link href="/rewards#certificates">
                            <Button variant="outline">Certificates</Button>
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Loading rewards...
                    </div>
                ) : error ? (
                    <Card>
                        <CardContent className="py-10 text-center">
                            <p className="font-medium">{error}</p>
                        </CardContent>
                    </Card>
                ) : overview ? (
                    <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <SummaryCard
                                title="Total Stars"
                                value={overview.summary.totalStars}
                                helper="Recognition points earned"
                                icon={Star}
                            />
                            <SummaryCard
                                title="Badges Unlocked"
                                value={overview.summary.totalBadges}
                                helper="Milestones achieved"
                                icon={Trophy}
                            />
                            <SummaryCard
                                title="Rewarded Events"
                                value={overview.summary.recognizedEvents}
                                helper="Sessions that produced rewards"
                                icon={Award}
                            />
                            <SummaryCard
                                title="Active Domains"
                                value={overview.summary.activeDomains}
                                helper="Domains where you earned credit"
                                icon={ArrowRight}
                            />
                            <SummaryCard
                                title="Certificates"
                                value={overview.summary.certificatesEarned}
                                helper="Formal certificates earned"
                                icon={Award}
                            />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Recent Star Awards</CardTitle>
                                    <CardDescription>Your latest training reward activity.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {overview.recentStarAwards.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No star awards yet.</p>
                                    ) : overview.recentStarAwards.map((award) => (
                                        <div key={award.id} className="rounded-lg border p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge>
                                                            <Star className="mr-1 h-3 w-3" />
                                                            +{award.stars}
                                                        </Badge>
                                                        <Badge variant="outline">{award.sourceType.replaceAll('_', ' ')}</Badge>
                                                    </div>
                                                    <p className="mt-3 font-semibold">
                                                        {award.event?.title || award.exam?.title || award.reason || 'Reward issued'}
                                                    </p>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {award.domain?.name ?? 'General Training'} · {new Date(award.awardedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                {award.exam ? (
                                                    <Link href={`/exams/${award.exam.id}`}>
                                                        <Button variant="ghost" size="sm">Open Exam</Button>
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            <div className="space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>How Rewards Work</CardTitle>
                                        <CardDescription>Daily practice and formal recognition use different reward tracks.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                                        <div className="rounded-lg border p-3">
                                            <p className="font-medium text-foreground">Stars</p>
                                            <p className="mt-1">Earned from practice, case study, and readiness assessments that award stars on pass.</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="font-medium text-foreground">Badges</p>
                                            <p className="mt-1">Unlocked when your stars in a specific product domain reach the configured milestone threshold.</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="font-medium text-foreground">Certificates</p>
                                            <p className="mt-1">Reserved for formal assessments with certificate-on-pass enabled. Practice drills do not automatically issue certificates.</p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Next Milestone</CardTitle>
                                        <CardDescription>Your nearest domain badge target.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {overview.nextBadge ? (
                                            <div className="space-y-2">
                                                <p className="text-2xl font-semibold">{overview.nextBadge.name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {overview.nextBadge.domain.name} · {overview.nextBadge.thresholdStars} stars required · {overview.nextBadge.remainingStars} to go
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">You have completed the currently configured domain badge ladders.</p>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Top Reward Domains</CardTitle>
                                        <CardDescription>Where your reward output is strongest.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {overview.topDomains.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No domain rewards yet.</p>
                                        ) : overview.topDomains.map((domain) => (
                                            <div key={domain.domainId ?? domain.domainName} className="rounded-lg border p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-semibold">{domain.domainName}</p>
                                                        <p className="text-sm text-muted-foreground">{domain.stars} stars · {domain.badges} badges</p>
                                                    </div>
                                                    <Badge variant="outline">{domain.badges} badges</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Domain Progression</CardTitle>
                                <CardDescription>Your current level and next badge target in each active domain.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {overview.domainProgressions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No domain badge progress yet.</p>
                                ) : overview.domainProgressions.map((domain) => (
                                    <div key={domain.domain.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold">{domain.domain.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {domain.stars} stars · {domain.unlockedBadges} badges unlocked
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {domain.currentBadge ? (
                                                    <Badge variant="secondary">{domain.currentBadge.name}</Badge>
                                                ) : (
                                                    <Badge variant="outline">No badge yet</Badge>
                                                )}
                                                {domain.nextBadge ? (
                                                    <Badge variant="outline">
                                                        Next: {domain.nextBadge.name} ({domain.nextBadge.remainingStars} to go)
                                                    </Badge>
                                                ) : (
                                                    <Badge>All domain badges unlocked</Badge>
                                                )}
                                            </div>
                                        </div>
                                        <Progress value={domain.progressPercent} className="mt-4" />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Unlocked Badges</CardTitle>
                                <CardDescription>Milestones you have already reached.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {overview.badges.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No badges unlocked yet.</p>
                                ) : overview.badges.map((award) => (
                                    <div key={award.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">Badge</Badge>
                                                    <Badge>{award.badge.thresholdStars} stars</Badge>
                                                </div>
                                                <p className="mt-3 font-semibold">{award.badge.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {award.domain?.name ?? 'General Training'} · unlocked {new Date(award.awardedAt).toLocaleDateString()}
                                                </p>
                                                {award.badge.description ? (
                                                    <p className="mt-2 text-sm text-muted-foreground">{award.badge.description}</p>
                                                ) : null}
                                            </div>
                                            {award.event ? <Badge variant="secondary">{award.event.title}</Badge> : null}
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <CertificatesSection />
                    </>
                ) : null}
            </div>
        </DashboardLayout>
    )
}

function SummaryCard({
    title,
    value,
    helper,
    icon: Icon,
}: {
    title: string
    value: number
    helper: string
    icon: React.ComponentType<{ className?: string }>
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{title}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{helper}</p>
                <Icon className="h-5 w-5 text-[#006688]" />
            </CardContent>
        </Card>
    )
}
