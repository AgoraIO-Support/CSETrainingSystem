'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser } from '@/types'
import {
    createEmptyProductDomainForm,
    normalizeProductDomainPayload,
    ProductDomainForm,
    type ProductDomainFormValue,
} from '@/app/admin/training-ops/_components/domain-form'

export default function NewTrainingOpsDomainPage() {
    const router = useRouter()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [form, setForm] = useState<ProductDomainFormValue>(createEmptyProductDomainForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const response = await ApiClient.getUsers({ limit: 200, status: 'ACTIVE' })
                setUsers(response.data.users)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load active users')
            } finally {
                setLoadingOptions(false)
            }
        }

        void loadUsers()
    }, [])

    const updateForm = <K extends keyof ProductDomainFormValue>(key: K, nextValue: ProductDomainFormValue[K]) => {
        setForm((prev) => ({ ...prev, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await ApiClient.createTrainingOpsDomain(normalizeProductDomainPayload(form))
            router.push(`/admin/training-ops/domains/${response.data.id}/edit`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create product domain')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DashboardLayout>
            <ProductDomainForm
                title="Create Product Domain"
                description="Create a product domain with explicit SME ownership and KPI expectations."
                backHref="/admin/training-ops/domains"
                users={users}
                value={form}
                loading={loading || loadingOptions}
                error={error}
                submitLabel="Create Domain"
                onChange={updateForm}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    )
}
