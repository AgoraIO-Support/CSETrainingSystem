'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PanelLeftOpen } from 'lucide-react'
import { Sidebar } from './sidebar'
import { TopNav } from './top-nav'
import { ApiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/lib/auth-middleware'

interface DashboardLayoutProps {
    children: React.ReactNode
    initialUser?: AuthUser | null
}

export function DashboardLayout({ children, initialUser }: DashboardLayoutProps) {
    const [user, setUser] = useState<AuthUser | null>(initialUser ?? null)
    const DEFAULT_SIDEBAR_WIDTH = 320
    const SIDEBAR_WIDTH_STORAGE_KEY = 'cse.dashboardSidebarWidth'
    const SIDEBAR_VISIBILITY_STORAGE_KEY = 'cse.dashboardSidebarVisible'
    const [showSidebar, setShowSidebar] = useState(true)
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
    const [isResizingSidebar, setIsResizingSidebar] = useState(false)
    const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

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

    useEffect(() => {
        try {
            const storedWidth = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
            const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : NaN
            if (Number.isFinite(parsedWidth) && parsedWidth >= 280 && parsedWidth <= 520) {
                setSidebarWidth(parsedWidth)
            }

            const storedVisibility = localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY)
            if (storedVisibility === 'hidden') {
                setShowSidebar(false)
            }
        } catch {
            // ignore persisted sidebar preferences
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
        } catch {
            // ignore persisted sidebar preferences
        }
    }, [sidebarWidth])

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_VISIBILITY_STORAGE_KEY, showSidebar ? 'visible' : 'hidden')
        } catch {
            // ignore persisted sidebar preferences
        }
    }, [showSidebar])

    useEffect(() => {
        if (!isResizingSidebar) return

        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
        const onMove = (event: PointerEvent) => {
            const resizeState = sidebarResizeStateRef.current
            if (!resizeState) return

            const minWidth = 280
            const maxWidth = clamp(window.innerWidth * 0.42, 320, 520)
            const nextWidth = clamp(resizeState.startWidth + (event.clientX - resizeState.startX), minWidth, maxWidth)
            setSidebarWidth(nextWidth)
        }

        const onUp = () => {
            sidebarResizeStateRef.current = null
            setIsResizingSidebar(false)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
        }
    }, [isResizingSidebar])

    const handleLogout = () => {
        ApiClient.logout()
    }

    return (
        <div className="flex h-screen overflow-hidden bg-[#f8f9fa]">
            <div
                className={cn(
                    'relative hidden shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 transition-[width] duration-300 lg:block',
                    isResizingSidebar ? 'transition-none' : null
                )}
                style={{ width: showSidebar ? sidebarWidth : 0 }}
            >
                <Sidebar user={user} className="w-full border-r-0" />
                {showSidebar ? (
                    <div
                        role="separator"
                        aria-label="Resize sidebar"
                        aria-orientation="vertical"
                        tabIndex={0}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 focus:outline-none focus:ring-2 focus:ring-[#00c2ff]/30"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return
                            sidebarResizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth }
                            setIsResizingSidebar(true)
                        }}
                        onKeyDown={(event) => {
                            const delta = event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0
                            if (!delta) return
                            event.preventDefault()
                            const minWidth = 280
                            const maxWidth = Math.max(320, Math.min(520, Math.round(window.innerWidth * 0.42)))
                            setSidebarWidth((current) => Math.max(minWidth, Math.min(maxWidth, current + delta)))
                        }}
                    />
                ) : null}
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
                <TopNav
                    user={user}
                    onLogout={handleLogout}
                    showSidebar={showSidebar}
                    onToggleSidebar={() => setShowSidebar((current) => !current)}
                />
                <main className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-6 xl:p-10">
                    {!showSidebar ? (
                        <div className="mb-4 hidden lg:block">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSidebar(true)}
                                className="border-slate-200 bg-white text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]"
                            >
                                <PanelLeftOpen className="mr-2 h-4 w-4" />
                                Show Sidebar
                            </Button>
                        </div>
                    ) : null}
                    {children}
                </main>
            </div>
        </div>
    )
}
