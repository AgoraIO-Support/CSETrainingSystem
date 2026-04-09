'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { BadgeMilestoneSummary, LearningSeriesSummary, ProductDomainSummary } from '@/types'

const EMPTY_OPTION = '__none__'
const SCOPE_GLOBAL = 'GLOBAL'
const SCOPE_SERIES = 'SERIES'
const SCOPE_DOMAIN = 'DOMAIN'

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

export type BadgeMilestoneFormValue = {
    name: string
    slug: string
    description: string
    icon: string
    thresholdStars: string
    active: boolean
    scope: typeof SCOPE_GLOBAL | typeof SCOPE_SERIES | typeof SCOPE_DOMAIN
    domainId: string
    learningSeriesId: string
}

export function createEmptyBadgeMilestoneForm(): BadgeMilestoneFormValue {
    return {
        name: '',
        slug: '',
        description: '',
        icon: '',
        thresholdStars: '4',
        active: true,
        scope: SCOPE_GLOBAL,
        domainId: '',
        learningSeriesId: '',
    }
}

export function badgeMilestoneToFormValue(badge: BadgeMilestoneSummary): BadgeMilestoneFormValue {
    return {
        name: badge.name,
        slug: badge.slug,
        description: badge.description ?? '',
        icon: badge.icon ?? '',
        thresholdStars: badge.thresholdStars.toString(),
        active: badge.active,
        scope: badge.learningSeries?.id ? SCOPE_SERIES : badge.domain?.id ? SCOPE_DOMAIN : SCOPE_GLOBAL,
        domainId: badge.domain?.id ?? '',
        learningSeriesId: badge.learningSeries?.id ?? '',
    }
}

export function normalizeBadgeMilestonePayload(form: BadgeMilestoneFormValue) {
    return {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        thresholdStars: Number(form.thresholdStars),
        active: form.active,
        domainId: form.domainId || null,
        learningSeriesId: form.learningSeriesId || null,
    }
}

export function BadgeMilestoneForm({
    title,
    description,
    backHref,
    domains,
    series,
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
    domains: ProductDomainSummary[]
    series: LearningSeriesSummary[]
    value: BadgeMilestoneFormValue
    loading: boolean
    error: string | null
    submitLabel: string
    onChange: <K extends keyof BadgeMilestoneFormValue>(key: K, nextValue: BadgeMilestoneFormValue[K]) => void
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
                    <CardTitle>Badge Milestone</CardTitle>
                    <CardDescription>Define the star threshold and choose whether this badge is global, series-scoped, or domain-scoped.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
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
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="slug">Slug *</Label>
                            <Input
                                id="slug"
                                value={value.slug}
                                onChange={(event) => onChange('slug', slugify(event.target.value))}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="scope">Scope</Label>
                            <Select
                                value={value.scope}
                                onValueChange={(nextScope) => {
                                    onChange('scope', nextScope as BadgeMilestoneFormValue['scope'])
                                    if (nextScope === SCOPE_GLOBAL) {
                                        onChange('learningSeriesId', '')
                                        onChange('domainId', '')
                                    } else if (nextScope === SCOPE_SERIES) {
                                        onChange('domainId', '')
                                    } else if (nextScope === SCOPE_DOMAIN) {
                                        onChange('learningSeriesId', '')
                                    }
                                }}
                            >
                                <SelectTrigger id="scope">
                                    <SelectValue placeholder="Select a scope" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={SCOPE_GLOBAL}>Global</SelectItem>
                                    <SelectItem value={SCOPE_SERIES}>Learning Series</SelectItem>
                                    <SelectItem value={SCOPE_DOMAIN}>Domain</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="learningSeriesId">Learning Series Scope</Label>
                            <Select
                                value={value.learningSeriesId || EMPTY_OPTION}
                                onValueChange={(nextValue) => {
                                    const normalizedValue = nextValue === EMPTY_OPTION ? '' : nextValue
                                    onChange('learningSeriesId', normalizedValue)
                                    onChange('scope', normalizedValue ? SCOPE_SERIES : SCOPE_GLOBAL)
                                    if (normalizedValue) {
                                        onChange('domainId', '')
                                    }
                                }}
                                disabled={value.scope !== SCOPE_SERIES}
                            >
                                <SelectTrigger id="learningSeriesId">
                                    <SelectValue placeholder="Select a learning series" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={EMPTY_OPTION}>Select a learning series</SelectItem>
                                    {series.map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="domainId">Domain Scope</Label>
                            <Select
                                value={value.domainId || EMPTY_OPTION}
                                onValueChange={(nextValue) => {
                                    const normalizedValue = nextValue === EMPTY_OPTION ? '' : nextValue
                                    onChange('domainId', normalizedValue)
                                    onChange('scope', normalizedValue ? SCOPE_DOMAIN : SCOPE_GLOBAL)
                                    if (normalizedValue) {
                                        onChange('learningSeriesId', '')
                                    }
                                }}
                                disabled={value.scope !== SCOPE_DOMAIN}
                            >
                                <SelectTrigger id="domainId">
                                    <SelectValue placeholder="Global badge" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={EMPTY_OPTION}>Global badge</SelectItem>
                                    {domains.map((domain) => (
                                        <SelectItem key={domain.id} value={domain.id}>
                                            {domain.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="thresholdStars">Threshold Stars *</Label>
                            <Input
                                id="thresholdStars"
                                type="number"
                                min="1"
                                max="1000"
                                step="1"
                                value={value.thresholdStars}
                                onChange={(event) => onChange('thresholdStars', event.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="icon">Icon</Label>
                            <Input
                                id="icon"
                                value={value.icon}
                                onChange={(event) => onChange('icon', event.target.value)}
                                placeholder="e.g. ⭐"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={value.description}
                            onChange={(event) => onChange('description', event.target.value)}
                            rows={4}
                            placeholder="Describe what this badge represents."
                        />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <p className="font-medium">Active</p>
                            <p className="text-sm text-muted-foreground">Only active badge milestones can be automatically awarded.</p>
                        </div>
                        <Switch checked={value.active} onCheckedChange={(checked) => onChange('active', checked)} />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Link href={backHref}>
                    <Button type="button" variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}
