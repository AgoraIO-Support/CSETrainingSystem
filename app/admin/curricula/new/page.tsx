'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Loader2 } from 'lucide-react'

export default function NewCurriculumRedirect() {
    const router = useRouter()

    useEffect(() => {
        const createDraft = async () => {
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
                const res = await fetch('/api/admin/curricula', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({}),
                })
                if (res.ok) {
                    const data = await res.json()
                    router.replace(`/admin/curricula/${data.curriculumId}/versions/${data.currentVersionId || 'draft'}`)
                    return
                }
            } catch (err) {
                console.warn('Falling back to local draft creation', err)
            }
            const tempId = `draft-${Date.now()}`
            router.replace(`/admin/curricula/${tempId}/versions/draft`)
        }
        createDraft()
    }, [router])

    return (
        <DashboardLayout>
            <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Creating draft curriculum...
            </div>
        </DashboardLayout>
    )
}
