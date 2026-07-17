'use client'

import { useEffect, useState } from 'react'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, LearningSeriesSummary, ProductDomainSummary } from '@/types'
import {
    createEmptyLearningSeriesForm,
    LearningSeriesForm,
    learningSeriesToFormValue,
    normalizeLearningSeriesPayload,
    type LearningSeriesFormValue,
} from '@/app/admin/training-ops/_components/series-form'

export function ProgramSettingsCard({
    view,
    program,
    onSaved,
}: {
    view: 'admin' | 'sme'
    program: LearningSeriesSummary
    onSaved: (program: LearningSeriesSummary) => void
}) {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [form, setForm] = useState<LearningSeriesFormValue>(createEmptyLearningSeriesForm())
    const [loading, setLoading] = useState(false)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setForm(learningSeriesToFormValue(program))
    }, [program])

    useEffect(() => {
        let active = true
        const loadOptions = async () => {
            try {
                if (view === 'admin') {
                    const [usersResponse, domainsResponse] = await Promise.all([
                        ApiClient.getUsers({ limit: 200, status: 'ACTIVE' }),
                        ApiClient.getTrainingOpsDomains({ limit: 100, active: true }),
                    ])
                    if (!active) return
                    setUsers(usersResponse.data.users)
                    setDomains(domainsResponse.data)
                } else {
                    const [profileResponse, domainsResponse] = await Promise.all([
                        ApiClient.getProfile(),
                        ApiClient.getSmeTrainingOpsDomains(),
                    ])
                    if (!active) return
                    setDomains(domainsResponse.data)
                    const currentUser: AdminUser = {
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
                    }
                    const programOwner: AdminUser | null = program.owner && program.owner.id !== currentUser.id
                        ? {
                            id: program.owner.id,
                            name: program.owner.name,
                            email: program.owner.email,
                            role: 'SME',
                            status: 'ACTIVE',
                            createdAt: program.createdAt,
                            enrollmentCount: 0,
                            completedCourses: 0,
                            domainAssignments: [],
                        }
                        : null
                    setUsers(programOwner ? [programOwner, currentUser] : [currentUser])
                }
                setError(null)
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : 'Failed to load Program settings')
            } finally {
                if (active) setLoadingOptions(false)
            }
        }
        void loadOptions()
        return () => { active = false }
    }, [program.createdAt, program.owner, view])

    const updateForm = <K extends keyof LearningSeriesFormValue>(key: K, nextValue: LearningSeriesFormValue[K]) => {
        setForm((current) => ({ ...current, [key]: nextValue }))
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const payload = normalizeLearningSeriesPayload({
                ...form,
                ownerId: view === 'sme' ? program.owner?.id ?? users[0]?.id ?? '' : form.ownerId,
            })
            const response = view === 'admin'
                ? await ApiClient.updateTrainingOpsSeries(program.id, payload)
                : await ApiClient.updateSmeTrainingOpsSeries(program.id, payload)
            onSaved(response.data)
            setForm(learningSeriesToFormValue(response.data))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save Program settings')
        } finally {
            setLoading(false)
        }
    }

    return (
        <LearningSeriesForm
            title="Program Settings"
            description="Edit ownership, cadence, classification, and availability here without leaving the Program workspace."
            backHref={view === 'admin' ? '/admin/training-ops/series' : '/sme/training-ops/series'}
            users={users}
            domains={domains}
            value={form}
            loading={loading || loadingOptions}
            error={error}
            submitLabel="Save Program"
            allowEmptyDomain={view === 'admin'}
            disableOwnerSelection={view === 'sme'}
            embedded
            onChange={updateForm}
            onSubmit={handleSubmit}
        />
    )
}
