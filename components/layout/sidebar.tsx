'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Home,
    BookOpen,
    TrendingUp,
    User,
    Settings,
    LayoutDashboard,
    Users,
    BarChart3,
    Bot,
    GraduationCap,
    Award,
} from 'lucide-react'

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    adminOnly?: boolean
}

const navItems: NavItem[] = [
    { title: 'Dashboard', href: '/', icon: Home },
    { title: 'Courses', href: '/courses', icon: BookOpen },
    { title: 'My Progress', href: '/progress', icon: TrendingUp },
    { title: 'My Exams', href: '/exams', icon: GraduationCap },
    { title: 'My Certificates', href: '/certificates', icon: Award },
    { title: 'Profile', href: '/profile', icon: User },
]

const adminNavItems: NavItem[] = [
    { title: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard, adminOnly: true },
    { title: 'Course Management', href: '/admin/courses', icon: BookOpen, adminOnly: true },
    { title: 'User Management', href: '/admin/users', icon: Users, adminOnly: true },
    { title: 'Analytics', href: '/admin/analytics', icon: BarChart3, adminOnly: true },
    { title: 'AI Configuration', href: '/admin/ai-config', icon: Bot, adminOnly: true },
    { title: 'Exams', href: '/admin/exams', icon: GraduationCap, adminOnly: true },
]

import type { AuthUser } from '@/lib/auth-middleware'

interface SidebarProps {
    user?: AuthUser | null
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname()
    const isAdmin = user?.role === 'ADMIN'

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-card">
            <div className="flex h-16 items-center border-b px-6">
                <Link href="/" className="flex items-center space-x-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <GraduationCap className="h-5 w-5" />
                    </div>
                    <span className="font-bold text-lg">CSE Training</span>
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-3">
                    <div className="mb-4">
                        <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Main
                        </p>
                        <div className="mt-2 space-y-1">
                            {navItems.map((item) => {
                                const Icon = item.icon
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                            isActive
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        <span>{item.title}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {isAdmin && (
                        <div className="mt-6">
                            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Admin
                            </p>
                            <div className="mt-2 space-y-1">
                                {adminNavItems.map((item) => {
                                    const Icon = item.icon
                                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                                isActive
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                            )}
                                        >
                                            <Icon className="h-5 w-5" />
                                            <span>{item.title}</span>
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </nav>
            </div>

            <div className="border-t p-4">
                <Link
                    href="/settings"
                    className="flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    <Settings className="h-5 w-5" />
                    <span>Settings</span>
                </Link>
            </div>
        </div>
    )
}
