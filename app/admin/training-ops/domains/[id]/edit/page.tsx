'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, ProductDomainSummary } from '@/types'
import {
    createEmptyProductDomainForm,
    normalizeProductDomainPayload,
    ProductDomainForm,
    productDomainToFormValue,
    type ProductDomainFormValue,
} from '@/app/admin/training-ops/_components/domain-form'

export default function EditTrainingOpsDomainPage() {
    const params = useParams<{ id: string }>()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [domain, setDomain] = useState<ProductDomainSummary | null>(null)
    const [form, setForm] = useState<ProductDomainFormValue>(createEmptyProductDomainForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                const [usersResponse, domainResponse] = await Promise.all([
                    ApiClient.getUsers({ limit: 200, status: 'ACTIVE' }),
                    ApiClient.getTrainingOpsDomain(params.id),
                ])
                setUsers(usersResponse.data.users)
                setDomain(domainResponse.data)
                setForm(productDomainToFormValue(domainResponse.data))
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load product domain')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadData()
    }, [params.id])

    const updateForm = <K extends keyof ProductDomainFormValue>(key: K, nextValue: ProductDomainFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.updateTrainingOpsDomain(params.id, normalizeProductDomainPayload(form))
            setDomain(response.data)
            setForm(productDomainToFormValue(response.data))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update product domain')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <ProductDomainForm
                title={domain ? `Edit Product Domain · ${domain.name}` : 'Edit Product Domain'}
                description="Adjust SME ownership, cadence, and KPI targets as the training program evolves."
                backHref="/admin/training-ops/domains"
                users={users}
                value={form}
                loading={loading || loadingOptions}
                error={error}
                submitLabel="Save Domain"
                onChange={updateForm}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    )
}
