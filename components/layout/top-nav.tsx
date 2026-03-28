'use client'

import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { AuthUser } from '@/lib/auth-middleware'

type DashboardUser = AuthUser & {
    name?: string | null
    avatar?: string | null
}

interface TopNavProps {
    user?: DashboardUser | null
    onLogout: () => void
}

export function TopNav({ user, onLogout }: TopNavProps) {
    const displayName = user?.name || user?.email || 'User'
    const initials = displayName.charAt(0)?.toUpperCase() || 'U'

    return (
        <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 shadow-sm shadow-[#006688]/5 backdrop-blur-xl md:px-6 xl:px-8">
            <div className="hidden md:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Agora Technical Support
                </p>
                <h1 className="mt-1 text-lg font-bold tracking-[-0.03em] text-[#006688]">
                    Training & assessment workspace
                </h1>
            </div>
            <div className="flex items-center gap-3 md:gap-4">
                <div className="flex items-center gap-3 rounded-full bg-transparent px-1 py-1">
                    <Avatar>
                        {user?.avatar ? (
                            <AvatarImage src={user.avatar} alt={displayName} />
                        ) : null}
                        <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">{displayName}</span>
                        <span className="text-xs text-muted-foreground">{user?.email || ''}</span>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={onLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                </Button>
            </div>
        </div>
    )
}
