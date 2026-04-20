'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, ProductDomainSummary } from '@/types'
import {
    createEmptyLearningSeriesForm,
    LearningSeriesForm,
    normalizeLearningSeriesPayload,
    type LearningSeriesFormValue,
} from '@/app/admin/training-ops/_components/series-form'

function NewSmeTrainingOpsSeriesPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)
    const [form, setForm] = useState<LearningSeriesFormValue>(createEmptyLearningSeriesForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadOptions = async () => {
            try {
                const [profileResponse, domainsResponse] = await Promise.all([
                    ApiClient.getProfile(),
                    ApiClient.getSmeTrainingOpsDomains(),
                ])

                if (cancelled) return

                const scopedDomains = domainsResponse.data
                const queryDomainId = searchParams.get('domainId') || ''
                const resolvedDomainId = scopedDomains.some((domain) => domain.id === queryDomainId) ? queryDomainId : ''

                setDomains(scopedDomains)
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
                setForm((prev) => ({
                    ...prev,
                    ownerId: profileResponse.data.id,
                    domainId: resolvedDomainId || prev.domainId || scopedDomains[0]?.id || '',
                }))
                setError(
                    scopedDomains.length === 0
                        ? 'No scoped domains are available. Ask an admin to assign you to a domain before creating a series.'
                        : null
                )
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load SME series options')
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
    }, [searchParams])

    const updateForm = <K extends keyof LearningSeriesFormValue>(key: K, nextValue: LearningSeriesFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!form.domainId) {
            setError('Select a domain in your SME scope before creating a series.')
            return
        }
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.createSmeTrainingOpsSeries(normalizeLearningSeriesPayload({
                ...form,
                ownerId: currentUser?.id ?? form.ownerId,
            }))
            router.push(`/sme/training-ops/series/${response.data.id}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create learning series')
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
                    <span className="font-medium text-foreground">Create Series</span>
                </nav>

                <LearningSeriesForm
                    title="Create Learning Series"
                    description="Create a reusable series inside your SME domain scope, then attach events, courses, and exams under it."
                    backHref="/sme/training-ops/series"
                    users={currentUser ? [currentUser] : []}
                    domains={domains}
                    value={form}
                    loading={loading || loadingOptions}
                    error={error}
                    submitLabel="Create Series"
                    allowEmptyDomain={false}
                    disableOwnerSelection
                    onChange={updateForm}
                    onSubmit={handleSubmit}
                />
            </div>
        </DashboardLayout>
    )
}

export default function NewSmeTrainingOpsSeriesPage() {
    return (
        <Suspense fallback={null}>
            <NewSmeTrainingOpsSeriesPageContent />
        </Suspense>
    )
}
