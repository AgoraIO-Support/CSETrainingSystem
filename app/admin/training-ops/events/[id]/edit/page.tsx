'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClient } from '@/lib/api-client'
import {
    EVENT_FORMAT_LABELS,
    getAllowedEventFormatsForSeriesType,
    getDefaultEventFormatForSeriesType,
    getSeriesEventFormatGuidance,
} from '@/lib/training-ops-series-event-rules'
import type { AdminUser, LearningEventSummary, LearningSeriesSummary, ProductDomainSummary } from '@/types'

const EMPTY_OPTION = '__none__'
const toLocalInput = (value?: string | Date | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const offset = date.getTimezoneOffset()
    const local = new Date(date.getTime() - offset * 60_000)
    return local.toISOString().slice(0, 16)
}
const toIsoStringOrNull = (value: string) => (value ? new Date(value).toISOString() : null)

export default function EditLearningEventPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [users, setUsers] = useState<AdminUser[]>([])
    const [event, setEvent] = useState<LearningEventSummary | null>(null)

    const [form, setForm] = useState({
        title: '',
        format: 'CASE_STUDY' as LearningEventSummary['format'],
        status: 'DRAFT' as LearningEventSummary['status'],
        domainId: '',
        seriesId: '',
        hostId: '',
        description: '',
        releaseVersion: '',
        scheduledAt: '',
        startsAt: '',
        endsAt: '',
        starValue: '1',
        isRequired: false,
        countsTowardPerformance: false,
    })

    useEffect(() => {
        const loadOptions = async () => {
            try {
                const [domainRes, seriesRes, userRes, eventRes] = await Promise.all([
                    ApiClient.getTrainingOpsDomains({ limit: 100 }),
                    ApiClient.getTrainingOpsSeries({ limit: 100 }),
                    ApiClient.getUsers({ limit: 200, status: 'ACTIVE' }),
                    ApiClient.getTrainingOpsEvent(params.id),
                ])

                setDomains(domainRes.data)
                setSeries(seriesRes.data)
                setUsers(userRes.data.users)
                setEvent(eventRes.data)
                setForm({
                    title: eventRes.data.title,
                    format: eventRes.data.format,
                    status: eventRes.data.status,
                    domainId: eventRes.data.domain?.id ?? '',
                    seriesId: eventRes.data.series?.id ?? '',
                    hostId: eventRes.data.host?.id ?? '',
                    description: eventRes.data.description ?? '',
                    releaseVersion: eventRes.data.releaseVersion ?? '',
                    scheduledAt: toLocalInput(eventRes.data.scheduledAt),
                    startsAt: toLocalInput(eventRes.data.startsAt),
                    endsAt: toLocalInput(eventRes.data.endsAt),
                    starValue: eventRes.data.starValue?.toString() ?? '',
                    isRequired: eventRes.data.isRequired,
                    countsTowardPerformance: eventRes.data.countsTowardPerformance,
                })
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learning event')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadOptions()
    }, [params.id])

    const filteredSeries = useMemo(() => {
        if (!form.domainId) return series
        return series.filter((item) => item.domain?.id === form.domainId)
    }, [form.domainId, series])
    const selectedSeries = useMemo(
        () => series.find((item) => item.id === form.seriesId) ?? null,
        [form.seriesId, series]
    )
    const allowedFormats = useMemo(
        () => getAllowedEventFormatsForSeriesType(selectedSeries?.type),
        [selectedSeries]
    )
    const formatGuidance = useMemo(
        () => getSeriesEventFormatGuidance(selectedSeries?.type),
        [selectedSeries]
    )

    useEffect(() => {
        if (allowedFormats.includes(form.format)) {
            return
        }

        setForm((prev) => ({
            ...prev,
            format: getDefaultEventFormatForSeriesType(selectedSeries?.type),
        }))
    }, [allowedFormats, form.format, selectedSeries])

    const updateForm = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }

    const handleDomainChange = (value: string) => {
        setForm((prev) => {
            const next = { ...prev, domainId: value === EMPTY_OPTION ? '' : value }
            if (next.seriesId) {
                const selectedSeries = series.find((item) => item.id === next.seriesId)
                if (selectedSeries?.domain?.id && selectedSeries.domain.id !== next.domainId) {
                    next.seriesId = ''
                }
            }
            return next
        })
    }

    const handleSeriesChange = (value: string) => {
        if (value === EMPTY_OPTION) {
            updateForm('seriesId', '')
            return
        }

        const selectedSeries = series.find((item) => item.id === value)
        setForm((prev) => ({
            ...prev,
            seriesId: value,
            domainId: prev.domainId || selectedSeries?.domain?.id || '',
            format: selectedSeries
                ? getAllowedEventFormatsForSeriesType(selectedSeries.type).includes(prev.format)
                    ? prev.format
                    : getDefaultEventFormatForSeriesType(selectedSeries.type)
                : prev.format,
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.updateTrainingOpsEvent(params.id, {
                title: form.title.trim(),
                format: form.format,
                status: form.status,
                domainId: form.domainId || null,
                seriesId: form.seriesId || null,
                hostId: form.hostId || null,
                description: form.description.trim() || null,
                releaseVersion: form.releaseVersion.trim() || null,
                scheduledAt: toIsoStringOrNull(form.scheduledAt),
                startsAt: toIsoStringOrNull(form.startsAt),
                endsAt: toIsoStringOrNull(form.endsAt),
                starValue: form.starValue ? Number(form.starValue) : null,
                isRequired: form.isRequired,
                countsTowardPerformance: form.countsTowardPerformance,
            })
            setEvent(response.data)
            router.push(`/admin/training-ops/events/${response.data.id}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update learning event')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href={`/admin/training-ops/events/${params.id}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">{event ? `Edit Learning Event · ${event.title}` : 'Edit Learning Event'}</h1>
                        <p className="mt-1 text-muted-foreground">
                            Update scheduling, ownership, and reward settings without touching linked exam content.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Event Basics</CardTitle>
                            <CardDescription>Keep the event aligned with the right domain, series, and scheduling window.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

                            <div className="space-y-2">
                                <Label htmlFor="title">Title *</Label>
                                <Input id="title" value={form.title} onChange={(e) => updateForm('title', e.target.value)} required />
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="format">Format *</Label>
                                    <select id="format" className="h-10 w-full rounded-md border bg-background px-3" value={form.format} onChange={(e) => updateForm('format', e.target.value as LearningEventSummary['format'])}>
                                        {allowedFormats.map((format) => (
                                            <option key={format} value={format}>
                                                {EVENT_FORMAT_LABELS[format]}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedSeries ? (
                                        <p className="text-xs text-muted-foreground">
                                            {formatGuidance} Allowed formats: {allowedFormats.map((format) => EVENT_FORMAT_LABELS[format]).join(', ')}.
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Select a learning series to narrow this list to the allowed session formats for that program type.
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="status">Status *</Label>
                                    <select id="status" className="h-10 w-full rounded-md border bg-background px-3" value={form.status} onChange={(e) => updateForm('status', e.target.value as LearningEventSummary['status'])}>
                                        <option value="DRAFT">Draft</option>
                                        <option value="SCHEDULED">Scheduled</option>
                                        <option value="IN_PROGRESS">In Progress</option>
                                        <option value="COMPLETED">Completed</option>
                                        <option value="CANCELED">Canceled</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hostId">Host / Presenter</Label>
                                    <select id="hostId" className="h-10 w-full rounded-md border bg-background px-3" value={form.hostId || EMPTY_OPTION} onChange={(e) => updateForm('hostId', e.target.value === EMPTY_OPTION ? '' : e.target.value)} disabled={loadingOptions}>
                                        <option value={EMPTY_OPTION}>No host assigned</option>
                                        {users.map((user) => (
                                            <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="domainId">Product Domain</Label>
                                    <select id="domainId" className="h-10 w-full rounded-md border bg-background px-3" value={form.domainId || EMPTY_OPTION} onChange={(e) => handleDomainChange(e.target.value)} disabled={loadingOptions}>
                                        <option value={EMPTY_OPTION}>No domain assigned</option>
                                        {domains.map((domain) => (
                                            <option key={domain.id} value={domain.id}>{domain.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="seriesId">Learning Series</Label>
                                    <select id="seriesId" className="h-10 w-full rounded-md border bg-background px-3" value={form.seriesId || EMPTY_OPTION} onChange={(e) => handleSeriesChange(e.target.value)} disabled={loadingOptions}>
                                        <option value={EMPTY_OPTION}>No learning series assigned</option>
                                        {filteredSeries.map((item) => (
                                            <option key={item.id} value={item.id}>{item.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" value={form.description} onChange={(e) => updateForm('description', e.target.value)} rows={5} />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Link href={`/admin/training-ops/events/${params.id}`}>
                            <Button type="button" variant="outline">Cancel</Button>
                        </Link>
                        <Button type="submit" disabled={loading || loadingOptions}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Event
                        </Button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    )
}
