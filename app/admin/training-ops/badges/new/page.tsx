'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainSummary } from '@/types'
import {
    BadgeMilestoneForm,
    createEmptyBadgeMilestoneForm,
    normalizeBadgeMilestonePayload,
    type BadgeMilestoneFormValue,
} from '@/app/admin/training-ops/_components/badge-form'

export default function NewTrainingOpsBadgePage() {
    const router = useRouter()
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [form, setForm] = useState<BadgeMilestoneFormValue>(createEmptyBadgeMilestoneForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadOptions = async () => {
            try {
                const domainsResponse = await ApiClient.getTrainingOpsDomains({ limit: 100 })
                setDomains(domainsResponse.data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load badge configuration options')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadOptions()
    }, [])

    const updateForm = <K extends keyof BadgeMilestoneFormValue>(key: K, nextValue: BadgeMilestoneFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.createTrainingOpsBadgeMilestone(normalizeBadgeMilestonePayload(form))
            router.push(`/admin/training-ops/badges/${response.data.id}/edit`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create badge milestone')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <BadgeMilestoneForm
                title="Create Badge Milestone"
                description="Create a domain-based recognition rule that converts earned stars into visible learner milestones."
                backHref="/admin/training-ops/badges"
                domains={domains}
                value={form}
                loading={loading || loadingOptions}
                error={error}
                submitLabel="Create Badge"
                onChange={updateForm}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    )
}
