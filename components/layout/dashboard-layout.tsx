'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './sidebar'
import { TopNav } from './top-nav'
import { ApiClient } from '@/lib/api-client'
import type { AuthUser } from '@/lib/auth-middleware'

interface DashboardLayoutProps {
    children: React.ReactNode
    initialUser?: AuthUser | null
}

export function DashboardLayout({ children, initialUser }: DashboardLayoutProps) {
    const [user, setUser] = useState<AuthUser | null>(initialUser ?? null)

    useEffect(() => {
        if (initialUser) return

        let mounted = true
        ApiClient.getMe()
            .then(res => {
                if (mounted) {
                    setUser(res.data)
                }
            })
            .catch(() => {
                ApiClient.logout()
            })

        return () => {
            mounted = false
        }
    }, [initialUser])

    const handleLogout = () => {
        ApiClient.logout()
    }

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar user={user} />
            <div className="flex flex-1 flex-col overflow-hidden">
                <TopNav user={user} onLogout={handleLogout} />
                <main className="flex-1 overflow-y-auto bg-background p-6">
                    {children}
                </main>
            </div>
        </div>
    )
}
