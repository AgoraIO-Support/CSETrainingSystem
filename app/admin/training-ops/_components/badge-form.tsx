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
import type { BadgeMilestoneSummary, ProductDomainSummary } from '@/types'

const EMPTY_OPTION = '__none__'
const BADGE_ICON_OPTIONS = [
    { value: 'READY', label: 'Ready' },
    { value: 'PRACTITIONER', label: 'Practitioner' },
    { value: 'TROUBLESHOOTER', label: 'Troubleshooter' },
    { value: 'DOMAIN_SPECIALIST', label: 'Domain Specialist' },
] as const

const normalizeBadgeIcon = (value?: string | null): string =>
    BADGE_ICON_OPTIONS.some((option) => option.value === value)
        ? (value ?? BADGE_ICON_OPTIONS[0].value)
        : BADGE_ICON_OPTIONS[0].value

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
    domainId: string
}

export function createEmptyBadgeMilestoneForm(): BadgeMilestoneFormValue {
    return {
        name: '',
        slug: '',
        description: '',
        icon: BADGE_ICON_OPTIONS[0].value,
        thresholdStars: '4',
        active: true,
        domainId: '',
    }
}

export function badgeMilestoneToFormValue(badge: BadgeMilestoneSummary): BadgeMilestoneFormValue {
    return {
        name: badge.name,
        slug: badge.slug,
        description: badge.description ?? '',
        icon: normalizeBadgeIcon(badge.icon),
        thresholdStars: badge.thresholdStars.toString(),
        active: badge.active,
        domainId: badge.domain?.id ?? '',
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
        domainId: form.domainId,
    }
}

export function BadgeMilestoneForm({
    title,
    description,
    backHref,
    domains,
    value,
    loading,
    error,
    submitLabel,
    disableDomainSelection = false,
    disableThresholdInput = false,
    domainHelpText,
    thresholdHelpText,
    onChange,
    onSubmit,
}: {
    title: string
    description: string
    backHref: string
    domains: ProductDomainSummary[]
    value: BadgeMilestoneFormValue
    loading: boolean
    error: string | null
    submitLabel: string
    disableDomainSelection?: boolean
    disableThresholdInput?: boolean
    domainHelpText?: string
    thresholdHelpText?: string
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
                    <CardDescription>Define the star threshold for a specific product domain.</CardDescription>
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

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="domainId">Domain *</Label>
                            <Select
                                value={value.domainId || EMPTY_OPTION}
                                onValueChange={(nextValue) => {
                                    const normalizedValue = nextValue === EMPTY_OPTION ? '' : nextValue
                                    onChange('domainId', normalizedValue)
                                }}
                                disabled={disableDomainSelection}
                            >
                                <SelectTrigger id="domainId">
                                    <SelectValue placeholder="Select a product domain" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={EMPTY_OPTION}>Select a product domain</SelectItem>
                                    {domains.map((domain) => (
                                        <SelectItem key={domain.id} value={domain.id}>
                                            {domain.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground">
                                {domainHelpText ?? 'Learners unlock this badge after reaching the threshold inside the selected domain.'}
                            </p>
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
                                disabled={disableThresholdInput}
                                required
                            />
                            {thresholdHelpText ? (
                                <p className="text-sm text-muted-foreground">{thresholdHelpText}</p>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="icon">Icon</Label>
                            <Select value={normalizeBadgeIcon(value.icon)} onValueChange={(nextValue) => onChange('icon', nextValue)}>
                                <SelectTrigger id="icon">
                                    <SelectValue placeholder="Select a badge icon" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BADGE_ICON_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground">
                                Standardized badge ladder icon. Only the 4 canonical milestone types are supported.
                            </p>
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
