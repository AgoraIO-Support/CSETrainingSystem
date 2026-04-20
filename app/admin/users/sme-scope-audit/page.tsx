'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ApiClient } from '@/lib/api-client'
import type { AdminSmeScopeAudit } from '@/types'
import { formatDate } from '@/lib/utils'
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react'

const EMPTY_AUDIT: AdminSmeScopeAudit = {
    summary: {
        totalSmes: 0,
        boundSmes: 0,
        orphanSmes: 0,
        multiDomainSmes: 0,
    },
    orphans: [],
}

export default function AdminSmeScopeAuditPage() {
    const [audit, setAudit] = useState<AdminSmeScopeAudit>(EMPTY_AUDIT)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshIndex, setRefreshIndex] = useState(0)

    useEffect(() => {
        let cancelled = false

        const loadAudit = async () => {
            try {
                setLoading(true)
                setError(null)
                const response = await ApiClient.getSmeScopeAudit()

                if (cancelled) return

                setAudit(response.data)
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load SME scope audit')
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void loadAudit()

        return () => {
            cancelled = true
        }
    }, [refreshIndex])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">SME Scope Audit</h1>
                        <p className="mt-1 text-muted-foreground">
                            Find SME accounts that are missing domain scope or need follow-up in User Management.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline">
                            <Link href="/admin/users">Back to User Management</Link>
                        </Button>
                        <Button variant="outline" onClick={() => setRefreshIndex((prev) => prev + 1)} disabled={loading}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                    </div>
                </div>

                {audit.summary.orphanSmes > 0 ? (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            {audit.summary.orphanSmes} SME{audit.summary.orphanSmes > 1 ? 's are' : ' is'} missing domain assignment and should be fixed from User Management.
                        </AlertDescription>
                    </Alert>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Total SMEs', value: audit.summary.totalSmes, description: 'Accounts with SME role' },
                        { label: 'Bound SMEs', value: audit.summary.boundSmes, description: 'Have at least one domain' },
                        { label: 'Orphan SMEs', value: audit.summary.orphanSmes, description: 'Need domain assignment now' },
                        { label: 'Multi-Domain SMEs', value: audit.summary.multiDomainSmes, description: 'Bound to more than one domain' },
                    ].map((item) => (
                        <Card key={item.label}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{item.value}</div>
                                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Unassigned SMEs</CardTitle>
                        <CardDescription>These SME users currently have no bound product domain.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : error ? (
                            <div className="space-y-4 py-12 text-center">
                                <p className="font-medium">Unable to load SME scope audit</p>
                                <p className="text-sm text-muted-foreground">{error}</p>
                                <Button variant="outline" onClick={() => setRefreshIndex((prev) => prev + 1)}>
                                    Try again
                                </Button>
                            </div>
                        ) : audit.orphans.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                No orphan SMEs found. Every SME currently has at least one domain assignment.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {audit.orphans.map((user) => (
                                    <div key={user.id} className="rounded-lg border p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium">{user.name}</p>
                                                    <Badge variant="outline">SME</Badge>
                                                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                                        No domain
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    WeCom ID: {user.wecomUserId || 'Not set'} · Joined {formatDate(user.createdAt)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Last active: {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'No activity'}
                                                </p>
                                            </div>
                                            <Button asChild size="sm" variant="outline">
                                                <Link href="/admin/users">Open in User Management</Link>
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
