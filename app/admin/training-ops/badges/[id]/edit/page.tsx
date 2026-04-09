'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { BadgeMilestoneSummary, LearningSeriesSummary, ProductDomainSummary } from '@/types'
import {
    BadgeMilestoneForm,
    badgeMilestoneToFormValue,
    createEmptyBadgeMilestoneForm,
    normalizeBadgeMilestonePayload,
    type BadgeMilestoneFormValue,
} from '@/app/admin/training-ops/_components/badge-form'

export default function EditTrainingOpsBadgePage() {
    const params = useParams<{ id: string }>()
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [badge, setBadge] = useState<BadgeMilestoneSummary | null>(null)
    const [form, setForm] = useState<BadgeMilestoneFormValue>(createEmptyBadgeMilestoneForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                const [domainsResponse, seriesResponse, badgeResponse] = await Promise.all([
                    ApiClient.getTrainingOpsDomains({ limit: 100 }),
                    ApiClient.getTrainingOpsSeries({ limit: 100 }),
                    ApiClient.getTrainingOpsBadgeMilestone(params.id),
                ])

                setDomains(domainsResponse.data)
                setSeries(seriesResponse.data)
                setBadge(badgeResponse.data)
                setForm(badgeMilestoneToFormValue(badgeResponse.data))
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load badge milestone')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadData()
    }, [params.id])

    const updateForm = <K extends keyof BadgeMilestoneFormValue>(key: K, nextValue: BadgeMilestoneFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.updateTrainingOpsBadgeMilestone(params.id, normalizeBadgeMilestonePayload(form))
            setBadge(response.data)
            setForm(badgeMilestoneToFormValue(response.data))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update badge milestone')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <BadgeMilestoneForm
                title={badge ? `Edit Badge Milestone · ${badge.name}` : 'Edit Badge Milestone'}
                description="Adjust the star threshold, scope, and active state for this learner recognition rule."
                backHref="/admin/training-ops/badges"
                domains={domains}
                series={series}
                value={form}
                loading={loading || loadingOptions}
                error={error}
                submitLabel="Save Badge"
                onChange={updateForm}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    )
}
