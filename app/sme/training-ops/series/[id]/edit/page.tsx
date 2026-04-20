'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, LearningSeriesSummary, ProductDomainSummary } from '@/types'
import {
    createEmptyLearningSeriesForm,
    LearningSeriesForm,
    learningSeriesToFormValue,
    normalizeLearningSeriesPayload,
    type LearningSeriesFormValue,
} from '@/app/admin/training-ops/_components/series-form'

export default function EditSmeTrainingOpsSeriesPage() {
    const params = useParams<{ id: string }>()
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
    const [series, setSeries] = useState<LearningSeriesSummary | null>(null)
    const [form, setForm] = useState<LearningSeriesFormValue>(createEmptyLearningSeriesForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadOptions = async () => {
            try {
                const [profileResponse, domainsResponse, seriesResponse] = await Promise.all([
                    ApiClient.getProfile(),
                    ApiClient.getSmeTrainingOpsDomains(),
                    ApiClient.getSmeTrainingOpsSeriesById(params.id),
                ])

                if (cancelled) return

                setDomains(domainsResponse.data)
                setSeries(seriesResponse.data)
                setForm(learningSeriesToFormValue(seriesResponse.data))
                setCurrentUser({
                    id: profileResponse.data.id,
                    name: profileResponse.data.name,
                    email: profileResponse.data.email,
                    role: profileResponse.data.role,
                    status: 'ACTIVE',
                    createdAt: profileResponse.data.createdAt,
                    enrollmentCount: 0,
                    completedCourses: 0,
                    avatar: profileResponse.data.avatar ?? null,
                    title: profileResponse.data.title ?? null,
                    department: profileResponse.data.department ?? null,
                    lastLoginAt: profileResponse.data.lastLoginAt ?? null,
                    domainAssignments: [],
                })
                setError(
                    domainsResponse.data.length === 0
                        ? 'No scoped domains are available. Ask an admin to assign you to a domain before editing this series.'
                        : null
                )
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load learning series')
            } finally {
                if (!cancelled) {
                    setLoadingOptions(false)
                }
            }
        }

        void loadOptions()

        return () => {
            cancelled = true
        }
    }, [params.id])

    const updateForm = <K extends keyof LearningSeriesFormValue>(key: K, nextValue: LearningSeriesFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const ownerOptions = [
        series?.owner
            ? {
                id: series.owner.id,
                name: series.owner.name,
                email: series.owner.email,
                role: 'SME' as const,
                status: 'ACTIVE' as const,
                createdAt: new Date().toISOString(),
                enrollmentCount: 0,
                completedCourses: 0,
                domainAssignments: [],
            }
            : null,
        currentUser,
    ]
        .filter((item): item is AdminUser => Boolean(item))
        .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!form.domainId) {
            setError('Select a domain in your SME scope before saving this series.')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.updateSmeTrainingOpsSeries(params.id, normalizeLearningSeriesPayload({
                ...form,
                ownerId: series?.owner?.id ?? '',
            }))
            setSeries(response.data)
            setForm(learningSeriesToFormValue(response.data))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update learning series')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Link href="/sme/training-ops/domains" className="transition-colors hover:text-foreground">
                        My Domains
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    <Link href="/sme/training-ops/series" className="transition-colors hover:text-foreground">
                        My Series
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    {series ? (
                        <>
                            <Link href={`/sme/training-ops/series/${series.id}`} className="transition-colors hover:text-foreground">
                                {series.name}
                            </Link>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    ) : null}
                    <span className="font-medium text-foreground">Edit Series</span>
                </nav>

                <LearningSeriesForm
                    title={series ? `Edit Learning Series · ${series.name}` : 'Edit Learning Series'}
                    description="Adjust the series defaults inside your SME scope without breaking the downstream event, course, and exam navigation."
                    backHref={series ? `/sme/training-ops/series/${series.id}` : '/sme/training-ops/series'}
                    users={ownerOptions}
                    domains={domains}
                    value={form}
                    loading={loading || loadingOptions}
                    error={error}
                    submitLabel="Save Series"
                    allowEmptyDomain={false}
                    disableOwnerSelection
                    onChange={updateForm}
                    onSubmit={handleSubmit}
                />
            </div>
        </DashboardLayout>
    )
}
