'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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

export default function EditTrainingOpsSeriesPage() {
    const params = useParams<{ id: string }>()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [series, setSeries] = useState<LearningSeriesSummary | null>(null)
    const [form, setForm] = useState<LearningSeriesFormValue>(createEmptyLearningSeriesForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadOptions = async () => {
            try {
                const [usersResponse, domainsResponse, seriesResponse] = await Promise.all([
                    ApiClient.getUsers({ limit: 200, status: 'ACTIVE' }),
                    ApiClient.getTrainingOpsDomains({ limit: 100, active: true }),
                    ApiClient.getTrainingOpsSeriesById(params.id),
                ])
                setUsers(usersResponse.data.users)
                setDomains(domainsResponse.data)
                setSeries(seriesResponse.data)
                setForm(learningSeriesToFormValue(seriesResponse.data))
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load learning series')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadOptions()
    }, [params.id])

    const updateForm = <K extends keyof LearningSeriesFormValue>(key: K, nextValue: LearningSeriesFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.updateTrainingOpsSeries(params.id, normalizeLearningSeriesPayload(form))
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
            <LearningSeriesForm
                title={series ? `Edit Learning Series · ${series.name}` : 'Edit Learning Series'}
                description="Adjust series defaults like cadence, owner, and reward behavior without touching event records."
                backHref="/admin/training-ops/series"
                users={users}
                domains={domains}
                value={form}
                loading={loading || loadingOptions}
                error={error}
                submitLabel="Save Series"
                onChange={updateForm}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    )
}
