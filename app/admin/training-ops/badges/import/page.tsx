'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileJson, Loader2, Upload } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClient } from '@/lib/api-client'
import type { TrainingOpsBadgeImportSummary } from '@/types'

export default function ImportTrainingOpsBadgesPage() {
    const [rawJson, setRawJson] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [summary, setSummary] = useState<TrainingOpsBadgeImportSummary | null>(null)

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        const text = await file.text()
        setRawJson(text)
    }

    const submitImport = async (apply: boolean) => {
        setLoading(true)
        setError(null)

        try {
            const payload = JSON.parse(rawJson)
            const response = await ApiClient.importTrainingOpsBadgeMilestones({
                payload,
                apply,
            })
            setSummary(response.data)
        } catch (err) {
            setSummary(null)
            setError(err instanceof Error ? err.message : 'Failed to import badge milestones')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin/training-ops/badges">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">Import Badge Milestones</h1>
                        <p className="mt-1 text-muted-foreground">
                            Paste a badge seed JSON file, preview the upserts, then apply it in one step.
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Import Source</CardTitle>
                        <CardDescription>
                            Use the seed-data JSON structure generated for training-ops badge milestones.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error ? (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {error}
                            </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
                                <Upload className="h-4 w-4" />
                                Upload JSON File
                                <input type="file" accept="application/json,.json" className="hidden" onChange={handleFileSelect} />
                            </label>
                            <Button
                                variant="outline"
                                onClick={() => void submitImport(false)}
                                disabled={loading || !rawJson.trim()}
                            >
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
                                Dry Run
                            </Button>
                            <Button onClick={() => void submitImport(true)} disabled={loading || !rawJson.trim()}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Apply Import
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="rawJson">Badge Seed JSON</Label>
                            <Textarea
                                id="rawJson"
                                value={rawJson}
                                onChange={(event) => setRawJson(event.target.value)}
                                placeholder='Paste the contents of prisma/seed-data/training-ops-badge-milestones.v1.json here...'
                                className="min-h-[360px] font-mono text-xs"
                            />
                        </div>
                    </CardContent>
                </Card>

                {summary ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>{summary.dryRun ? 'Dry Run Summary' : 'Import Summary'}</CardTitle>
                            <CardDescription>
                                {summary.scopeModel} · {summary.totals.processed} of {summary.totals.items} items processed
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Mode</p>
                                    <p className="mt-2 text-2xl font-semibold">{summary.dryRun ? 'Dry Run' : 'Applied'}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Items</p>
                                    <p className="mt-2 text-2xl font-semibold">{summary.totals.items}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Active Series</p>
                                    <p className="mt-2 text-lg font-semibold">{summary.activeSeries.join(', ') || 'None'}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {summary.items.map((item) => (
                                    <div key={item.slug} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {item.slug} · {item.scope} · {item.thresholdStars} stars
                                                </p>
                                            </div>
                                            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                {item.action}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Series: {item.learningSeriesSlug || 'n/a'} · Domain: {item.domainSlug || 'n/a'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </DashboardLayout>
    )
}
