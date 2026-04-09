'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { AdminUser, ProductDomainSummary } from '@/types'

const EMPTY_OPTION = '__none__'

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

export type ProductDomainFormValue = {
    name: string
    slug: string
    category: ProductDomainSummary['category']
    track: ProductDomainSummary['track']
    kpiMode: ProductDomainSummary['kpiMode']
    description: string
    cadence: string
    active: boolean
    baselinePassRate: string
    targetPassRate: string
    challengeThreshold: string
    primarySmeId: string
    backupSmeId: string
}

export function createEmptyProductDomainForm(): ProductDomainFormValue {
    return {
        name: '',
        slug: '',
        category: 'AI',
        track: 'AGILE',
        kpiMode: 'DELTA',
        description: '',
        cadence: '',
        active: true,
        baselinePassRate: '',
        targetPassRate: '',
        challengeThreshold: '',
        primarySmeId: '',
        backupSmeId: '',
    }
}

export function productDomainToFormValue(domain: ProductDomainSummary): ProductDomainFormValue {
    return {
        name: domain.name,
        slug: domain.slug,
        category: domain.category,
        track: domain.track,
        kpiMode: domain.kpiMode,
        description: domain.description ?? '',
        cadence: domain.cadence ?? '',
        active: domain.active,
        baselinePassRate: domain.baselinePassRate?.toString() ?? '',
        targetPassRate: domain.targetPassRate?.toString() ?? '',
        challengeThreshold: domain.challengeThreshold?.toString() ?? '',
        primarySmeId: domain.primarySme?.id ?? '',
        backupSmeId: domain.backupSme?.id ?? '',
    }
}

export function normalizeProductDomainPayload(form: ProductDomainFormValue) {
    return {
        name: form.name.trim(),
        slug: form.slug.trim(),
        category: form.category,
        track: form.track,
        kpiMode: form.kpiMode,
        description: form.description.trim() || null,
        cadence: form.cadence.trim() || null,
        active: form.active,
        baselinePassRate: form.baselinePassRate ? Number(form.baselinePassRate) : null,
        targetPassRate: form.targetPassRate ? Number(form.targetPassRate) : null,
        challengeThreshold: form.challengeThreshold ? Number(form.challengeThreshold) : null,
        primarySmeId: form.primarySmeId || null,
        backupSmeId: form.backupSmeId || null,
    }
}

export function ProductDomainForm({
    title,
    description,
    backHref,
    users,
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
    value: ProductDomainFormValue
    loading: boolean
    error: string | null
    submitLabel: string
    onChange: <K extends keyof ProductDomainFormValue>(key: K, nextValue: ProductDomainFormValue[K]) => void
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
                    <CardTitle>Domain Configuration</CardTitle>
                    <CardDescription>Define ownership, cadence, KPI mode, and pass-rate targets for this product domain.</CardDescription>
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
                                placeholder="e.g. Conversational AI"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="slug">Slug *</Label>
                            <Input
                                id="slug"
                                value={value.slug}
                                onChange={(event) => onChange('slug', slugify(event.target.value))}
                                placeholder="conversational-ai"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="category">Category *</Label>
                            <select
                                id="category"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.category}
                                onChange={(event) => onChange('category', event.target.value as ProductDomainSummary['category'])}
                            >
                                <option value="AI">AI</option>
                                <option value="RTE">RTE</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="track">Track *</Label>
                            <select
                                id="track"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.track}
                                onChange={(event) => onChange('track', event.target.value as ProductDomainSummary['track'])}
                            >
                                <option value="AGILE">Agile</option>
                                <option value="MASTERY">Mastery</option>
                                <option value="RELEASE">Release</option>
                                <option value="FINAL">Final</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="kpiMode">KPI Mode *</Label>
                            <select
                                id="kpiMode"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.kpiMode}
                                onChange={(event) => onChange('kpiMode', event.target.value as ProductDomainSummary['kpiMode'])}
                            >
                                <option value="DELTA">Delta</option>
                                <option value="RETENTION">Retention</option>
                                <option value="READINESS">Readiness</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="baselinePassRate">Baseline Pass Rate</Label>
                            <Input
                                id="baselinePassRate"
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={value.baselinePassRate}
                                onChange={(event) => onChange('baselinePassRate', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="targetPassRate">Target Pass Rate</Label>
                            <Input
                                id="targetPassRate"
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={value.targetPassRate}
                                onChange={(event) => onChange('targetPassRate', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="challengeThreshold">Challenge Threshold</Label>
                            <Input
                                id="challengeThreshold"
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={value.challengeThreshold}
                                onChange={(event) => onChange('challengeThreshold', event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
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
                            <Label htmlFor="primarySmeId">Primary SME</Label>
                            <select
                                id="primarySmeId"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.primarySmeId || EMPTY_OPTION}
                                onChange={(event) => onChange('primarySmeId', event.target.value === EMPTY_OPTION ? '' : event.target.value)}
                            >
                                <option value={EMPTY_OPTION}>No primary SME</option>
                                {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} · {user.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="backupSmeId">Backup SME</Label>
                            <select
                                id="backupSmeId"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={value.backupSmeId || EMPTY_OPTION}
                                onChange={(event) => onChange('backupSmeId', event.target.value === EMPTY_OPTION ? '' : event.target.value)}
                            >
                                <option value={EMPTY_OPTION}>No backup SME</option>
                                {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} · {user.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={value.description}
                            onChange={(event) => onChange('description', event.target.value)}
                            placeholder="Describe why this domain matters and how the SME will drive improvement."
                            rows={5}
                        />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                            <p className="font-medium">Active</p>
                            <p className="text-sm text-muted-foreground">Inactive domains stay in the model but are excluded from current scheduling.</p>
                        </div>
                        <Switch checked={value.active} onCheckedChange={(checked) => onChange('active', checked)} />
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
