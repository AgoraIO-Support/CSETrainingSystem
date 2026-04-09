'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiClient } from '@/lib/api-client'
import type { TrainingOpsBridge } from '@/types'
import { ArrowLeft, Loader2, Star, Trophy } from 'lucide-react'

export default function TrainingOpsLeaderboardPage() {
    const [bridge, setBridge] = useState<TrainingOpsBridge | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const loadBridge = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getTrainingOpsBridge()
                setBridge(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learner leaderboard')
            } finally {
                setLoading(false)
            }
        }

        void loadBridge()
    }, [])

    const filteredLearners = useMemo(() => {
        const learners = bridge?.rewards.topLearners ?? []
        const query = search.trim().toLowerCase()
        if (!query) return learners

        return learners.filter((learner) =>
            learner.name.toLowerCase().includes(query) ||
            learner.email.toLowerCase().includes(query) ||
            learner.recentSources.some((source) => source.toLowerCase().includes(query))
        )
    }, [bridge, search])

    const topPerformer = filteredLearners[0]

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
                            <h1 className="text-3xl font-bold">Learner Leaderboard</h1>
                            <p className="mt-1 text-muted-foreground">
                                A live view of cumulative stars, badge progress, and recent reward sources.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/admin/training-ops/events">
                            <Button variant="outline">Learning Events</Button>
                        </Link>
                        <Link href="/admin/training-ops-prototype/scheduling">
                            <Button variant="outline">Scheduling View</Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Recognized Learners</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.learnersWithRecognition ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Learners with at least one reward signal.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Stars Issued</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.starAwards ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Total training stars awarded across events and exams.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Badges Unlocked</CardDescription>
                            <CardTitle className="text-3xl">{loading ? '...' : bridge?.rewards.badgeAwards ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Milestone badges unlocked from star accumulation.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Top Performer</CardDescription>
                            <CardTitle className="text-xl">{loading ? '...' : topPerformer?.name ?? 'No rewards yet'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                {topPerformer ? `${topPerformer.stars} stars · ${topPerformer.badges} badges` : 'Waiting for reward issuance'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Search Learners</CardTitle>
                        <CardDescription>Filter by name, email, or recent reward source.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search learners or reward sources..."
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Leaderboard</CardTitle>
                        <CardDescription>
                            Sorted by stars first, then badges, then the most recent reward activity.
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
                                Loading learner rewards...
                            </div>
                        ) : filteredLearners.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No learner reward data matches the current search.
                            </div>
                        ) : (
                            filteredLearners.map((learner, index) => (
                                <div key={learner.userId} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-slate-50 font-semibold text-slate-700">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <p className="font-semibold">{learner.name}</p>
                                                    <p className="text-sm text-muted-foreground">{learner.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge>
                                                    <Star className="mr-1 h-3 w-3" />
                                                    {learner.stars} stars
                                                </Badge>
                                                <Badge variant="outline">
                                                    <Trophy className="mr-1 h-3 w-3" />
                                                    {learner.badges} badges
                                                </Badge>
                                                {learner.lastRewardedAt ? (
                                                    <Badge variant="outline">
                                                        Last reward {new Date(learner.lastRewardedAt).toLocaleDateString()}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="max-w-xl text-sm text-muted-foreground">
                                            Recent sources: {learner.recentSources.length > 0 ? learner.recentSources.join(' · ') : 'No recent sources'}
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
