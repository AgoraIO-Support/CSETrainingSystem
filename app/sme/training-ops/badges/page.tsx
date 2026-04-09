'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClient } from '@/lib/api-client'
import type { SmeBadgeLadderOverview } from '@/types'
import { Loader2 } from 'lucide-react'

const EMPTY_OPTION = '__none__'

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

export default function SmeTrainingOpsBadgesPage() {
    const [loading, setLoading] = useState(true)
    const [submittingTemplates, setSubmittingTemplates] = useState(false)
    const [submittingCustom, setSubmittingCustom] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [overview, setOverview] = useState<SmeBadgeLadderOverview | null>(null)
    const [selectedSeriesId, setSelectedSeriesId] = useState(EMPTY_OPTION)
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
    const [customForm, setCustomForm] = useState({
        learningSeriesId: EMPTY_OPTION,
        name: '',
        slug: '',
        description: '',
        icon: '',
        thresholdStars: '4',
    })

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const response = await ApiClient.getSmeTrainingOpsBadges()
                setOverview(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME badge ladders')
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    const stats = useMemo(() => {
        const ladders = overview?.seriesLadders ?? []
        return {
            series: ladders.length,
            milestones: ladders.reduce((sum, ladder) => sum + ladder.milestones.length, 0),
            unlocks: ladders.reduce((sum, ladder) => sum + ladder.totalUnlocks, 0),
            learners: ladders.reduce((sum, ladder) => sum + ladder.recognizedLearners, 0),
        }
    }, [overview])

    const templates = overview?.templates ?? []
    const scopedSeries = overview?.series ?? []
    const ladders = overview?.seriesLadders ?? []
    const recentUnlocks = overview?.recentUnlocks ?? []

    const handleTemplateToggle = (templateId: string, checked: boolean) => {
        setSelectedTemplateIds((prev) => {
            if (checked) return Array.from(new Set([...prev, templateId]))
            return prev.filter((id) => id !== templateId)
        })
    }

    const handleApplyTemplates = async () => {
        if (selectedSeriesId === EMPTY_OPTION || selectedTemplateIds.length === 0) return

        try {
            setSubmittingTemplates(true)
            setError(null)
            setSuccess(null)
            const response = await ApiClient.applySmeTrainingOpsBadgeTemplates({
                learningSeriesId: selectedSeriesId,
                templateIds: selectedTemplateIds,
            })
            setOverview(response.data)
            setSelectedTemplateIds([])
            setSuccess('Badge templates applied to the selected learning series.')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply badge templates')
        } finally {
            setSubmittingTemplates(false)
        }
    }

    const handleCreateCustomBadge = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (customForm.learningSeriesId === EMPTY_OPTION) return

        try {
            setSubmittingCustom(true)
            setError(null)
            setSuccess(null)
            const response = await ApiClient.createSmeTrainingOpsCustomBadge({
                learningSeriesId: customForm.learningSeriesId,
                name: customForm.name.trim(),
                slug: customForm.slug.trim(),
                description: customForm.description.trim() || null,
                icon: customForm.icon.trim() || null,
                thresholdStars: Number(customForm.thresholdStars),
                active: true,
            })
            setOverview(response.data)
            setCustomForm({
                learningSeriesId: EMPTY_OPTION,
                name: '',
                slug: '',
                description: '',
                icon: '',
                thresholdStars: '4',
            })
            setSuccess('Custom badge created for the selected learning series.')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create custom badge')
        } finally {
            setSubmittingCustom(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">My Badge Ladders</h1>
                        <p className="mt-1 text-muted-foreground">
                            Start from the Admin-defined badge catalog, apply it to your series, and create a custom badge if the catalog is not enough.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/sme/training-ops/series">
                            <Button variant="outline">My Series</Button>
                        </Link>
                        <Link href="/sme/training-ops/events">
                            <Button variant="outline">My Events</Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card><CardHeader className="pb-2"><CardDescription>Series Ladders</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.series}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Badge-enabled series in your SME scope.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Milestones</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.milestones}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Configured badge thresholds across your series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Total Unlocks</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.unlocks}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Total badge awards issued from your series.</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardDescription>Recognized Learners</CardDescription><CardTitle className="text-3xl">{loading ? '...' : stats.learners}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Distinct learners who unlocked at least one series badge.</p></CardContent></Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Series Badge Ladders</CardTitle>
                            <CardDescription>
                                Each series follows the same four-level model. Use this view to see whether the thresholds are being reached.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                            {loading ? (
                                <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading badge ladders...</div>
                            ) : ladders.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                    No badge-enabled learning series are currently in your SME scope.
                                </div>
                            ) : (
                                ladders.map((ladder) => (
                                    <div key={ladder.learningSeries.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div>
                                                <p className="text-lg font-semibold">{ladder.learningSeries.name}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {ladder.totalUnlocks} unlocks · {ladder.recognizedLearners} recognized learners
                                                    {ladder.latestUnlockedAt ? ` · latest ${new Date(ladder.latestUnlockedAt).toLocaleDateString()}` : ''}
                                                </p>
                                            </div>
                                            <Badge variant="outline">{ladder.milestones.length} milestones</Badge>
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
                                <CardTitle>Admin Badge Catalog</CardTitle>
                                <CardDescription>
                                    Select one of your series, then apply the admin-defined badge templates into that ladder.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                                {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
                                <div className="space-y-2">
                                    <Label htmlFor="templateSeries">Target Series</Label>
                                    <select
                                        id="templateSeries"
                                        className="h-10 w-full rounded-md border bg-background px-3"
                                        value={selectedSeriesId}
                                        onChange={(event) => setSelectedSeriesId(event.target.value)}
                                    >
                                        <option value={EMPTY_OPTION}>Select a learning series</option>
                                        {scopedSeries.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {templates.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                        No admin-defined global badge templates are available yet.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {templates.map((template) => (
                                            <label key={template.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4"
                                                    checked={selectedTemplateIds.includes(template.id)}
                                                    onChange={(event) => handleTemplateToggle(template.id, event.target.checked)}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-medium text-slate-950">{template.name}</p>
                                                        <Badge variant="outline">{template.thresholdStars} stars</Badge>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">{template.slug}</p>
                                                    {template.description ? (
                                                        <p className="mt-2 text-sm leading-6 text-slate-600">{template.description}</p>
                                                    ) : null}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <Button
                                    onClick={handleApplyTemplates}
                                    disabled={submittingTemplates || selectedSeriesId === EMPTY_OPTION || selectedTemplateIds.length === 0}
                                >
                                    {submittingTemplates ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Apply Selected Templates
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Create Custom Badge</CardTitle>
                                <CardDescription>
                                    If the admin catalog does not fit your scenario, define a series-specific badge for your own ladder.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleCreateCustomBadge} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="customSeries">Learning Series</Label>
                                        <select
                                            id="customSeries"
                                            className="h-10 w-full rounded-md border bg-background px-3"
                                            value={customForm.learningSeriesId}
                                            onChange={(event) => setCustomForm((prev) => ({ ...prev, learningSeriesId: event.target.value }))}
                                        >
                                            <option value={EMPTY_OPTION}>Select a learning series</option>
                                            {scopedSeries.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="customName">Name</Label>
                                            <Input
                                                id="customName"
                                                value={customForm.name}
                                                onChange={(event) => {
                                                    const nextName = event.target.value
                                                    setCustomForm((prev) => ({
                                                        ...prev,
                                                        name: nextName,
                                                        slug: !prev.slug || prev.slug === slugify(prev.name) ? slugify(nextName) : prev.slug,
                                                    }))
                                                }}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="customSlug">Slug</Label>
                                            <Input
                                                id="customSlug"
                                                value={customForm.slug}
                                                onChange={(event) => setCustomForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                                        <div className="space-y-2">
                                            <Label htmlFor="customDescription">Description</Label>
                                            <Textarea
                                                id="customDescription"
                                                value={customForm.description}
                                                onChange={(event) => setCustomForm((prev) => ({ ...prev, description: event.target.value }))}
                                                rows={3}
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="customThreshold">Threshold Stars</Label>
                                                <Input
                                                    id="customThreshold"
                                                    type="number"
                                                    min="1"
                                                    max="1000"
                                                    value={customForm.thresholdStars}
                                                    onChange={(event) => setCustomForm((prev) => ({ ...prev, thresholdStars: event.target.value }))}
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="customIcon">Icon</Label>
                                                <Input
                                                    id="customIcon"
                                                    value={customForm.icon}
                                                    onChange={(event) => setCustomForm((prev) => ({ ...prev, icon: event.target.value }))}
                                                    placeholder="e.g. ⭐"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={submittingCustom || customForm.learningSeriesId === EMPTY_OPTION || !customForm.name.trim() || !customForm.slug.trim()}
                                    >
                                        {submittingCustom ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Create Custom Badge
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Recent Unlocks</CardTitle>
                                <CardDescription>
                                    Latest badge awards across the series you currently manage.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {loading ? (
                                    <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading unlock activity...</div>
                                ) : recentUnlocks.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                        No badge unlocks yet for your current SME scope.
                                    </div>
                                ) : (
                                    recentUnlocks.map((unlock) => (
                                        <div key={unlock.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="font-medium text-slate-950">{unlock.badge.name}</p>
                                                    <p className="mt-1 text-sm text-slate-500">{unlock.learningSeries.name}</p>
                                                </div>
                                                <Badge variant="outline">{unlock.badge.thresholdStars} stars</Badge>
                                            </div>
                                            <div className="mt-3 text-sm text-slate-600">
                                                <p>{unlock.user.name} · {unlock.user.email}</p>
                                                <p className="mt-1">
                                                    {unlock.event?.title ?? unlock.exam?.title ?? 'Direct award'} · {new Date(unlock.awardedAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
