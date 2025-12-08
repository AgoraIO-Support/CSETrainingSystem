'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CurriculumStatusBadge } from '@/components/curriculum/curriculum-status-badge'
import type { CurriculumSummary } from '@/types'
import { Loader2, Plus, RefreshCw, Search } from 'lucide-react'

const fallbackCurricula: CurriculumSummary[] = [
    {
        id: 'cur_rtc',
        code: 'rtc-core',
        title: 'RTC Core Support',
        status: 'PUBLISHED',
        versionNumber: 2,
        audienceLevel: 'L1',
        modulesCount: 3,
        lessonsCount: 12,
    },
    {
        id: 'cur_media',
        code: 'media-quality',
        title: 'Media Quality Troubleshooting',
        status: 'DRAFT',
        versionNumber: 1,
        audienceLevel: 'L2',
        modulesCount: 2,
        lessonsCount: 7,
    },
]

export default function CurriculumListPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [items, setItems] = useState<CurriculumSummary[]>([])
    const [search, setSearch] = useState('')

    useEffect(() => {
        let mounted = true
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
                const res = await fetch('/api/admin/curricula', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
                if (!res.ok) throw new Error('Failed to fetch curricula')
                const data = await res.json()
                if (mounted) setItems(data.items || [])
            } catch (err) {
                console.warn('Falling back to local curricula list', err)
                if (mounted) setItems(fallbackCurricula)
            } finally {
                if (mounted) setLoading(false)
            }
        }
        load()
        return () => {
            mounted = false
        }
    }, [])

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return items
        return items.filter(c => c.title.toLowerCase().includes(term) || c.code.toLowerCase().includes(term))
    }, [items, search])

    return (
        <DashboardLayout>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Curricula</h1>
                    <p className="text-sm text-muted-foreground">Manage drafts, published paths, and versions.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => location.reload()}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                    </Button>
                    <Link href="/admin/curricula/new">
                        <Button size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            New Curriculum
                        </Button>
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-lg">All Curricula</CardTitle>
                    <div className="relative w-64">
                        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                            placeholder="Search by title or code"
                            className="pl-9"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading curricula...
                        </div>
                    ) : error ? (
                        <div className="text-sm text-destructive">{error}</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                            No curricula found. Create one to get started.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map(cur => (
                                <div
                                    key={cur.id}
                                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent transition-colors"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                            <Link
                                                href={`/admin/curricula/${cur.id}/versions/${cur.status === 'DRAFT' ? 'latest' : 'current'}`}
                                                className="text-base font-semibold hover:underline"
                                            >
                                                {cur.title}
                                            </Link>
                                            <CurriculumStatusBadge status={cur.status} />
                                            <span className="text-xs text-muted-foreground">
                                                v{cur.versionNumber} • {cur.audienceLevel}
                                            </span>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {cur.modulesCount} modules • {cur.lessonsCount} lessons
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/admin/curricula/${cur.id}/versions/${cur.status === 'DRAFT' ? 'latest' : 'current'}`}>
                                            <Button variant="outline" size="sm">Edit</Button>
                                        </Link>
                                        {cur.status === 'PUBLISHED' && (
                                            <Link href={`/curricula/${cur.code}`}>
                                                <Button variant="ghost" size="sm">View</Button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </DashboardLayout>
    )
}
