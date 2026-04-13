'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, ProductDomainSummary } from '@/types'
import {
    createEmptyLearningSeriesForm,
    LearningSeriesForm,
    learningSeriesToFormValue,
    normalizeLearningSeriesPayload,
    type LearningSeriesFormValue,
} from '@/app/admin/training-ops/_components/series-form'

function NewTrainingOpsSeriesPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [form, setForm] = useState<LearningSeriesFormValue>(createEmptyLearningSeriesForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadOptions = async () => {
            try {
                const [usersResponse, domainsResponse] = await Promise.all([
                    ApiClient.getUsers({ limit: 200, status: 'ACTIVE' }),
                    ApiClient.getTrainingOpsDomains({ limit: 100, active: true }),
                ])
                setUsers(usersResponse.data.users)
                setDomains(domainsResponse.data)
                const queryDomainId = searchParams.get('domainId')
                if (queryDomainId) {
                    setForm((prev) => ({ ...prev, domainId: queryDomainId }))
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learning series options')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadOptions()
    }, [searchParams])

    const updateForm = <K extends keyof LearningSeriesFormValue>(key: K, nextValue: LearningSeriesFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.createTrainingOpsSeries(normalizeLearningSeriesPayload(form))
            setForm(learningSeriesToFormValue(response.data))
            router.push(`/admin/training-ops/series/${response.data.id}/edit`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create learning series')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <LearningSeriesForm
                title="Create Learning Series"
                description="Create the reusable training program that events and exams can inherit from."
                backHref="/admin/training-ops/series"
                users={users}
                domains={domains}
                value={form}
                loading={loading || loadingOptions}
                error={error}
                submitLabel="Create Series"
                onChange={updateForm}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    )
}

export default function NewTrainingOpsSeriesPage() {
    return (
        <Suspense fallback={null}>
            <NewTrainingOpsSeriesPageContent />
        </Suspense>
    )
}
