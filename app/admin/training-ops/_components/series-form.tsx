'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { AdminUser, LearningSeriesSummary, ProductDomainSummary } from '@/types'

const EMPTY_OPTION = '__none__'

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

export type LearningSeriesFormValue = {
    name: string
    slug: string
    type: LearningSeriesSummary['type']
    domainId: string
    ownerId: string
    description: string
    cadence: string
    isActive: boolean
    badgeEligible: boolean
    countsTowardPerformance: boolean
    defaultStarValue: string
}

export function createEmptyLearningSeriesForm(): LearningSeriesFormValue {
    return {
        name: '',
        slug: '',
        type: 'WEEKLY_DRILL',
        domainId: '',
        ownerId: '',
        description: '',
        cadence: '',
        isActive: true,
        badgeEligible: true,
        countsTowardPerformance: false,
        defaultStarValue: '1',
    }
}

export function learningSeriesToFormValue(series: LearningSeriesSummary): LearningSeriesFormValue {
    return {
        name: series.name,
        slug: series.slug,
        type: series.type,
        domainId: series.domain?.id ?? '',
        ownerId: series.owner?.id ?? '',
        description: series.description ?? '',
        cadence: series.cadence ?? '',
        isActive: series.isActive,
        badgeEligible: series.badgeEligible,
        countsTowardPerformance: series.countsTowardPerformance,
        defaultStarValue: series.defaultStarValue?.toString() ?? '',
    }
}

export function normalizeLearningSeriesPayload(form: LearningSeriesFormValue) {
    return {
        name: form.name.trim(),
        slug: form.slug.trim(),
        type: form.type,
        domainId: form.domainId || null,
        ownerId: form.ownerId || null,
        description: form.description.trim() || null,
        cadence: form.cadence.trim() || null,
        isActive: form.isActive,
        badgeEligible: form.badgeEligible,
        countsTowardPerformance: form.countsTowardPerformance,
        defaultStarValue: form.defaultStarValue ? Number(form.defaultStarValue) : null,
    }
}

export function LearningSeriesForm({
    title,
    description,
    backHref,
    users,
    domains,
    value,
    loading,
    error,
    submitLabel,
    onChange,
    onSubmit,
}: {
    title: string
    description: string
    backHref: string
    users: AdminUser[]
    domains: ProductDomainSummary[]
    value: LearningSeriesFormValue
    loading: boolean
    error: string | null
    submitLabel: string
    onChange: <K extends keyof LearningSeriesFormValue>(key: K, nextValue: LearningSeriesFormValue[K]) => void
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href={backHref}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold">{title}</h1>
                    <p className="mt-1 text-muted-foreground">{description}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Series Configuration</CardTitle>
                    <CardDescription>Define the long-running training program that events and exams can inherit from.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {error}
                        </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={value.name}
                                onChange={(event) => {
                                    const name = event.target.value
                                    onChange('name', name)
                                    if (!value.slug || value.slug === slugify(value.name)) {
                                        onChange('slug', slugify(name))
                                    }
                                }}
                                placeholder="e.g. Conversational AI Weekly Drill"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="slug">Slug *</Label>
                            <Input
                                id="slug"
                                value={value.slug}
                                onChange={(event) => onChange('slug', slugify(event.target.value))}
                                placeholder="conversational-ai-weekly-drill"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="type">Series Type *</Label>
                            <select
                                id="type"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.type}
                                onChange={(event) => onChange('type', event.target.value as LearningSeriesSummary['type'])}
                            >
                                <option value="WEEKLY_DRILL">Weekly Drill</option>
                                <option value="CASE_STUDY">Case Study</option>
                                <option value="KNOWLEDGE_SHARING">Knowledge Sharing</option>
                                <option value="FAQ_SHARE">FAQ Share</option>
                                <option value="RELEASE_READINESS">Release Readiness</option>
                                <option value="QUARTERLY_FINAL">Quarterly Final</option>
                                <option value="YEAR_END_FINAL">Year-end Final</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="domainId">Product Domain</Label>
                            <select
                                id="domainId"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.domainId || EMPTY_OPTION}
                                onChange={(event) => onChange('domainId', event.target.value === EMPTY_OPTION ? '' : event.target.value)}
                            >
                                <option value={EMPTY_OPTION}>No domain mapped</option>
                                {domains.map((domain) => (
                                    <option key={domain.id} value={domain.id}>
                                        {domain.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ownerId">Series Owner</Label>
                            <select
                                id="ownerId"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.ownerId || EMPTY_OPTION}
                                onChange={(event) => onChange('ownerId', event.target.value === EMPTY_OPTION ? '' : event.target.value)}
                            >
                                <option value={EMPTY_OPTION}>No owner assigned</option>
                                {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} · {user.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="cadence">Cadence</Label>
                            <Input
                                id="cadence"
                                value={value.cadence}
                                onChange={(event) => onChange('cadence', event.target.value)}
                                placeholder="Weekly"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="defaultStarValue">Default Star Value</Label>
                            <Input
                                id="defaultStarValue"
                                type="number"
                                min="0"
                                max="20"
                                step="1"
                                value={value.defaultStarValue}
                                onChange={(event) => onChange('defaultStarValue', event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={value.description}
                            onChange={(event) => onChange('description', event.target.value)}
                            placeholder="Describe the purpose of this learning series and how it should be used."
                            rows={5}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                                <p className="font-medium">Active</p>
                                <p className="text-sm text-muted-foreground">Use in current scheduling.</p>
                            </div>
                            <Switch checked={value.isActive} onCheckedChange={(checked) => onChange('isActive', checked)} />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                                <p className="font-medium">Badge Eligible</p>
                                <p className="text-sm text-muted-foreground">Events in this series can unlock badges.</p>
                            </div>
                            <Switch checked={value.badgeEligible} onCheckedChange={(checked) => onChange('badgeEligible', checked)} />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div>
                                <p className="font-medium">Counts Toward Performance</p>
                                <p className="text-sm text-muted-foreground">Use for formal assessment tracking.</p>
                            </div>
                            <Switch checked={value.countsTowardPerformance} onCheckedChange={(checked) => onChange('countsTowardPerformance', checked)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Link href={backHref}>
                    <Button type="button" variant="outline">
                        Cancel
                    </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}
