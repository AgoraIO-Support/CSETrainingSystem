'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { BadgeMilestoneSummary, ProductDomainSummary } from '@/types'
import {
    BadgeMilestoneForm,
    badgeMilestoneToFormValue,
    createEmptyBadgeMilestoneForm,
    normalizeBadgeMilestonePayload,
    type BadgeMilestoneFormValue,
} from '@/app/admin/training-ops/_components/badge-form'

export default function EditSmeTrainingOpsBadgePage() {
    const params = useParams<{ id: string }>()
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [badge, setBadge] = useState<BadgeMilestoneSummary | null>(null)
    const [form, setForm] = useState<BadgeMilestoneFormValue>(createEmptyBadgeMilestoneForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadData = async () => {
            try {
                const [domainsResponse, badgeResponse] = await Promise.all([
                    ApiClient.getSmeTrainingOpsDomains(),
                    ApiClient.getSmeTrainingOpsBadgeMilestone(params.id),
                ])

                if (cancelled) return

                const scopedDomains = domainsResponse.data

                setDomains(scopedDomains)
                setBadge(badgeResponse.data)
                setForm(badgeMilestoneToFormValue(badgeResponse.data))
                setError(
                    scopedDomains.length === 0
                        ? 'No domains are available in your SME scope. Create or own a series under a domain first, or ask an admin to assign your SME scope.'
                        : null
                )
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load badge milestone')
            } finally {
                if (!cancelled) {
                    setLoadingOptions(false)
                }
            }
        }

        void loadData()

        return () => {
            cancelled = true
        }
    }, [params.id])

    const updateForm = <K extends keyof BadgeMilestoneFormValue>(key: K, nextValue: BadgeMilestoneFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const thresholdLocked = (badge?.awardCount ?? 0) > 0
    const selectedDomain = useMemo(
        () => domains.find((domain) => domain.id === form.domainId) ?? badge?.domain ?? null,
        [badge?.domain, domains, form.domainId]
    )

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!form.domainId) {
            setError('Select a domain in your SME scope before saving this badge.')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.updateSmeTrainingOpsBadgeMilestone(params.id, normalizeBadgeMilestonePayload(form))
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
            <div className="space-y-6">
                <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Link href="/sme/training-ops/domains" className="transition-colors hover:text-foreground">
                        My Domains
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    <Link href="/sme/training-ops/badges" className="transition-colors hover:text-foreground">
                        My Domain Badges
                    </Link>
                    <ChevronRight className="h-4 w-4" />
                    {badge ? (
                        <>
                            <span className="transition-colors hover:text-foreground">{badge.name}</span>
                            <ChevronRight className="h-4 w-4" />
                        </>
                    ) : null}
                    <span className="font-medium text-foreground">Edit Badge</span>
                </nav>

                <BadgeMilestoneForm
                    title={badge ? `Edit Badge Milestone · ${badge.name}` : 'Edit Badge Milestone'}
                    description="Adjust the badge copy and activation state for a domain in your SME scope."
                    backHref="/sme/training-ops/badges"
                    domains={domains}
                    value={form}
                    loading={loading || loadingOptions}
                    error={error}
                    submitLabel="Save Badge"
                    disableDomainSelection={thresholdLocked}
                    disableThresholdInput={thresholdLocked}
                    domainHelpText={
                        thresholdLocked
                            ? 'Domain cannot be changed after this badge has been awarded.'
                            : selectedDomain
                                ? `This badge belongs to ${selectedDomain.name}.`
                                : 'Select a domain from your SME scope.'
                    }
                    thresholdHelpText={
                        thresholdLocked
                            ? 'Threshold cannot be changed after this badge has been awarded.'
                            : 'Use a unique star threshold within this domain.'
                    }
                    onChange={updateForm}
                    onSubmit={handleSubmit}
                />
            </div>
        </DashboardLayout>
    )
}
