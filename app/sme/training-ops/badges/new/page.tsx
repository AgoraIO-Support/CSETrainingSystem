'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { ProductDomainSummary } from '@/types'
import {
    BadgeMilestoneForm,
    createEmptyBadgeMilestoneForm,
    normalizeBadgeMilestonePayload,
    type BadgeMilestoneFormValue,
} from '@/app/admin/training-ops/_components/badge-form'

function NewSmeTrainingOpsBadgePageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [form, setForm] = useState<BadgeMilestoneFormValue>(createEmptyBadgeMilestoneForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadOptions = async () => {
            try {
                const domainsResponse = await ApiClient.getSmeTrainingOpsDomains()

                if (cancelled) return

                const scopedDomains = domainsResponse.data
                const queryDomainId = searchParams.get('domainId') || ''
                const resolvedDomainId = scopedDomains.some((domain) => domain.id === queryDomainId)
                    ? queryDomainId
                    : scopedDomains[0]?.id ?? ''

                setDomains(scopedDomains)
                setForm((prev) => ({ ...prev, domainId: resolvedDomainId }))
                setError(
                    scopedDomains.length === 0
                        ? 'No domains are available in your SME scope. Create or own a series under a domain first, or ask an admin to assign your SME scope.'
                        : null
                )
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load badge configuration options')
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

    const updateForm = <K extends keyof BadgeMilestoneFormValue>(key: K, nextValue: BadgeMilestoneFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const selectedDomain = useMemo(
        () => domains.find((domain) => domain.id === form.domainId) ?? null,
        [domains, form.domainId]
    )

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!form.domainId) {
            setError('Select a domain in your SME scope before creating a badge.')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.createSmeTrainingOpsBadgeMilestone(normalizeBadgeMilestonePayload(form))
            router.push(`/sme/training-ops/badges/${response.data.id}/edit`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create badge milestone')
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
                    <span className="font-medium text-foreground">Create Badge</span>
                </nav>

                <BadgeMilestoneForm
                    title="Create Badge Milestone"
                    description="Create a domain-based recognition rule for a domain in your SME scope."
                    backHref="/sme/training-ops/badges"
                    domains={domains}
                    value={form}
                    loading={loading || loadingOptions}
                    error={error}
                    submitLabel="Create Badge"
                    domainHelpText={
                        selectedDomain
                            ? `Learners unlock this badge after reaching the threshold inside ${selectedDomain.name}.`
                            : 'Select a domain from your SME scope.'
                    }
                    onChange={updateForm}
                    onSubmit={handleSubmit}
                />
            </div>
        </DashboardLayout>
    )
}

export default function NewSmeTrainingOpsBadgePage() {
    return (
        <Suspense fallback={null}>
            <NewSmeTrainingOpsBadgePageContent />
        </Suspense>
    )
}
