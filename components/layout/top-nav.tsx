'use client'

import { Bell, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { AuthUser } from '@/lib/auth-middleware'

interface TopNavProps {
    user?: AuthUser | null
    onLogout: () => void
}

export function TopNav({ user, onLogout }: TopNavProps) {
    const displayName = (user as any)?.name || user?.email || 'User'
    const initials = displayName.charAt(0)?.toUpperCase() || 'U'

    return (
        <div className="flex h-16 items-center justify-end border-b bg-card px-6">
            <div className="flex items-center space-x-4">
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
                </Button>

                <div className="flex items-center space-x-3">
                    <Avatar>
                        {(user as any)?.avatar ? (
                            <AvatarImage src={(user as any).avatar} alt={displayName} />
                        ) : null}
                        <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">{displayName}</span>
                        <span className="text-xs text-muted-foreground">{user?.email || ''}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={onLogout}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                    </Button>
                </div>
            </div>
        </div>
    )
}
