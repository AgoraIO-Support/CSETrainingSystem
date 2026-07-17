'use client'

import { FormEvent, Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, CircleDashed, Eye, Loader2, Search, XCircle } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainEffectivenessAttempt } from '@/types'

type PageProps = {
    params: Promise<{ domainId: string }>
}

type ResultFilter = 'all' | 'passed' | 'failed'

const resultTabs: Array<{ value: ResultFilter; label: string }> = [
    { value: 'all', label: 'All graded' },
    { value: 'passed', label: 'Passed' },
    { value: 'failed', label: 'Failed' },
]

function DomainAttemptsContent({ params }: PageProps) {
    const { domainId } = use(params)
    const router = useRouter()
    const searchParams = useSearchParams()
    const requestedResult = searchParams.get('result')
    const result: ResultFilter = requestedResult === 'passed' || requestedResult === 'failed' ? requestedResult : 'all'
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const search = searchParams.get('search') ?? ''

    const [domainName, setDomainName] = useState('')
    const [attempts, setAttempts] = useState<ProductDomainEffectivenessAttempt[]>([])
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
    const [searchInput, setSearchInput] = useState(search)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setSearchInput(search)
    }, [search])

    useEffect(() => {
        let active = true

        const loadAttempts = async () => {
            setLoading(true)
            try {
                const response = await ApiClient.getTrainingOpsEffectivenessAttempts(domainId, {
                    result,
                    page,
                    limit: 20,
                    search: search || undefined,
                })
                if (!active) return
                setDomainName(response.data.domain.name)
                setAttempts(response.data.attempts)
                setPagination(response.pagination)
                setError(null)
            } catch (err) {
                if (!active) return
                setError(err instanceof Error ? err.message : 'Failed to load domain attempts')
            } finally {
                if (active) setLoading(false)
            }
        }

        void loadAttempts()
        return () => {
            active = false
        }
    }, [domainId, page, result, search])

    const buildUrl = (next: { result?: ResultFilter; page?: number; search?: string }) => {
        const query = new URLSearchParams()
        const nextResult = next.result ?? result
        const nextPage = next.page ?? page
        const nextSearch = next.search ?? search
        if (nextResult !== 'all') query.set('result', nextResult)
        if (nextPage > 1) query.set('page', String(nextPage))
        if (nextSearch) query.set('search', nextSearch)
        const suffix = query.toString() ? `?${query.toString()}` : ''
        return `/admin/training-ops/effectiveness/${domainId}/attempts${suffix}`
    }

    const submitSearch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        router.push(buildUrl({ page: 1, search: searchInput.trim() }))
    }

    const formatDate = (value: string | Date | null | undefined) => {
        if (!value) return '-'
        return new Date(value).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    const title = result === 'all' ? 'All Graded Attempts' : `${result === 'passed' ? 'Passed' : 'Failed'} Attempts`
    const firstItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
    const lastItem = Math.min(pagination.page * pagination.limit, pagination.total)

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-start gap-4">
                    <BackButton fallbackHref="/admin/training-ops/effectiveness" ariaLabel="Back to Cross-Domain Board" />
                    <div>
                        <h1 className="text-3xl font-bold">{title}</h1>
                        <p className="mt-1 text-muted-foreground">
                            {domainName || 'Domain'} · Graded submissions used by the Cross-Domain Board
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="gap-4">
                        <div>
                            <CardTitle>Attempt Records</CardTitle>
                            <CardDescription>
                                Each row is one graded submission. Multiple attempts by the same learner are shown separately.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2" role="navigation" aria-label="Filter by result">
                            {resultTabs.map((tab) => (
                                <Link key={tab.value} href={buildUrl({ result: tab.value, page: 1 })}>
                                    <Button variant={result === tab.value ? 'default' : 'outline'} size="sm">
                                        {tab.label}
                                    </Button>
                                </Link>
                            ))}
                        </div>
                        <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                    placeholder="Search learner, email, or exam..."
                                    className="pl-9"
                                />
                            </div>
                            <Button type="submit" variant="outline">Search</Button>
                        </form>
                    </CardHeader>
                    <CardContent>
                        {error ? (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {error}
                            </div>
                        ) : loading ? (
                            <div className="flex h-40 items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Loading attempt records...
                            </div>
                        ) : attempts.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                No {result === 'all' ? 'graded' : result} attempts match this filter.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="py-3 pr-4 font-medium">Learner</th>
                                            <th className="py-3 pr-4 font-medium">Exam</th>
                                            <th className="py-3 pr-4 font-medium">Attempt</th>
                                            <th className="py-3 pr-4 font-medium">Submitted</th>
                                            <th className="py-3 pr-4 font-medium">Score</th>
                                            <th className="py-3 pr-4 font-medium">Result</th>
                                            <th className="py-3 font-medium">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attempts.map((attempt) => (
                                            <tr key={attempt.id} className="border-b last:border-0">
                                                <td className="py-3 pr-4">
                                                    <p className="font-medium">{attempt.user.name || 'Unknown'}</p>
                                                    <p className="text-xs text-muted-foreground">{attempt.user.email}</p>
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <Link
                                                        href={`/admin/exams/${attempt.exam.id}/attempts`}
                                                        className="font-medium text-[#006688] hover:underline"
                                                    >
                                                        {attempt.exam.title}
                                                    </Link>
                                                </td>
                                                <td className="py-3 pr-4">#{attempt.attemptNumber}</td>
                                                <td className="py-3 pr-4 text-muted-foreground">{formatDate(attempt.submittedAt)}</td>
                                                <td className="py-3 pr-4 font-medium">
                                                    {attempt.percentageScore === null || attempt.percentageScore === undefined
                                                        ? '-'
                                                        : `${attempt.percentageScore}%`}
                                                </td>
                                                <td className="py-3 pr-4">
                                                    {attempt.passed === true ? (
                                                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Passed
                                                        </Badge>
                                                    ) : attempt.passed === false ? (
                                                        <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
                                                            <XCircle className="mr-1 h-3.5 w-3.5" /> Failed
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-slate-600">
                                                            <CircleDashed className="mr-1 h-3.5 w-3.5" /> No result
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    <Link href={`/admin/exams/${attempt.exam.id}/attempts/${attempt.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            <Eye className="mr-1 h-4 w-4" /> View
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {!loading && !error && pagination.total > 0 ? (
                            <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-muted-foreground">
                                    Showing {firstItem}-{lastItem} of {pagination.total} attempts
                                </p>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Page {pagination.page} of {pagination.totalPages}
                                    </span>
                                    <Link
                                        href={buildUrl({ page: Math.max(1, pagination.page - 1) })}
                                        aria-disabled={pagination.page === 1}
                                        tabIndex={pagination.page === 1 ? -1 : undefined}
                                        className={pagination.page === 1 ? 'pointer-events-none' : ''}
                                    >
                                        <Button variant="outline" size="sm" disabled={pagination.page === 1}>Previous</Button>
                                    </Link>
                                    <Link
                                        href={buildUrl({ page: Math.min(pagination.totalPages, pagination.page + 1) })}
                                        aria-disabled={pagination.page === pagination.totalPages}
                                        tabIndex={pagination.page === pagination.totalPages ? -1 : undefined}
                                        className={pagination.page === pagination.totalPages ? 'pointer-events-none' : ''}
                                    >
                                        <Button variant="outline" size="sm" disabled={pagination.page === pagination.totalPages}>Next</Button>
                                    </Link>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}

export default function DomainAttemptsPage(props: PageProps) {
    return (
        <Suspense fallback={null}>
            <DomainAttemptsContent {...props} />
        </Suspense>
    )
}
