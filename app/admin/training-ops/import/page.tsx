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
import type { TrainingOpsBootstrapImportSummary } from '@/types'

export default function ImportTrainingOpsBootstrapPage() {
    const [rawJson, setRawJson] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [summary, setSummary] = useState<TrainingOpsBootstrapImportSummary | null>(null)

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
            const response = await ApiClient.importTrainingOpsBootstrap({
                payload,
                apply,
            })
            setSummary(response.data)
        } catch (err) {
            setSummary(null)
            setError(err instanceof Error ? err.message : 'Failed to import training ops bootstrap data')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin/training-ops">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">Bootstrap Import</h1>
                        <p className="mt-1 text-muted-foreground">
                            Import product domains, learning series, and badge milestones in one ordered operation.
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Import Source</CardTitle>
                        <CardDescription>
                            Use the bundle file from seed-data to run a single dry run or apply for the whole training-ops baseline.
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
                            <Label htmlFor="rawJson">Training Ops Bootstrap JSON</Label>
                            <Textarea
                                id="rawJson"
                                value={rawJson}
                                onChange={(event) => setRawJson(event.target.value)}
                                placeholder='Paste the contents of prisma/seed-data/training-ops-bootstrap.v1.json here...'
                                className="min-h-[420px] font-mono text-xs"
                            />
                        </div>
                    </CardContent>
                </Card>

                {summary ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>{summary.dryRun ? 'Dry Run Summary' : 'Import Summary'}</CardTitle>
                            <CardDescription>
                                {summary.scopeModel} · {summary.totals.processed} of {summary.totals.items} items processed across {summary.totals.sections} sections
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-4">
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Mode</p>
                                    <p className="mt-2 text-2xl font-semibold">{summary.dryRun ? 'Dry Run' : 'Applied'}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Domains</p>
                                    <p className="mt-2 text-2xl font-semibold">{summary.domains.totals.processed}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Series</p>
                                    <p className="mt-2 text-2xl font-semibold">{summary.series.totals.processed}</p>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <p className="text-sm text-muted-foreground">Badges</p>
                                    <p className="mt-2 text-2xl font-semibold">{summary.badges.totals.processed}</p>
                                </div>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-3">
                                <div className="rounded-xl border p-4">
                                    <p className="font-semibold">Product Domains</p>
                                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                        {summary.domains.items.map((item) => (
                                            <div key={item.slug}>
                                                {item.name} · {item.track} · {item.action}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="font-semibold">Learning Series</p>
                                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                        {summary.series.items.map((item) => (
                                            <div key={item.slug}>
                                                {item.name} · {item.type} · {item.action}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="font-semibold">Badge Milestones</p>
                                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                        {summary.badges.items.map((item) => (
                                            <div key={item.slug}>
                                                {item.name} · {item.thresholdStars} stars · {item.action}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </DashboardLayout>
    )
}
