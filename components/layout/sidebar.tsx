'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Home,
    BookOpen,
    TrendingUp,
    Trophy,
    User,
    Settings,
    LayoutDashboard,
    Users,
    BarChart3,
    Bot,
    GraduationCap,
    Award,
    CalendarClock,
    FileText,
} from 'lucide-react'
import type { AuthUser } from '@/lib/auth-middleware'

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
    { title: 'Dashboard', href: '/', icon: Home },
    { title: 'Courses', href: '/courses', icon: BookOpen },
    { title: 'My Progress', href: '/progress', icon: TrendingUp },
    { title: 'My Training', href: '/training', icon: CalendarClock },
    { title: 'My Exams', href: '/exams', icon: GraduationCap },
    { title: 'My Rewards', href: '/rewards', icon: Trophy },
    { title: 'My Certificates', href: '/certificates', icon: Award },
    { title: 'Profile', href: '/profile', icon: User },
]

const adminNavItems: NavItem[] = [
    { title: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard },
    { title: 'Training Ops', href: '/admin/training-ops', icon: CalendarClock },
    { title: 'Course Management', href: '/admin/courses', icon: BookOpen },
    { title: 'User Management', href: '/admin/users', icon: Users },
    { title: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    { title: 'AI Configuration', href: '/admin/ai-config', icon: Bot },
    { title: 'Exams', href: '/admin/exams', icon: GraduationCap },
]

const smeNavItems: NavItem[] = [
    { title: 'SME Dashboard', href: '/sme', icon: LayoutDashboard },
    { title: 'My Domains', href: '/sme/training-ops/domains', icon: BookOpen },
    { title: 'My Series', href: '/sme/training-ops/series', icon: GraduationCap },
    { title: 'Managed Courses', href: '/sme/training-ops/courses', icon: BookOpen },
    { title: 'My Badges', href: '/sme/training-ops/badges', icon: Trophy },
    { title: 'My Events', href: '/sme/training-ops/events', icon: CalendarClock },
    { title: 'Managed Exams', href: '/sme/training-ops/exams', icon: FileText },
    { title: 'Effectiveness', href: '/sme/training-ops/effectiveness', icon: BarChart3 },
]

interface SidebarProps {
    user?: AuthUser | null
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname()
    const isAdmin = user?.role === 'ADMIN'
    const isSme = user?.role === 'SME'

    return (
        <div className="hidden h-screen w-64 flex-col border-r border-slate-200/30 bg-slate-50 pt-20 lg:flex">
            <div className="mb-8 px-4">
                <h2 className="mb-4 px-2 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/70">
                    {isAdmin ? 'Admin Workspace' : 'Learning Workspace'}
                </h2>
                <Link href="/" className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#006688_0%,#00c2ff_100%)] text-primary-foreground shadow-lg shadow-[#006688]/15">
                        <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="block text-sm font-bold tracking-[-0.02em] text-[#006688]">CSE Training</span>
                        <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {isAdmin ? 'Master Admin' : 'Team Member'}
                        </span>
                    </div>
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
                <nav className="space-y-5">
                    <div className="mb-4">
                        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Main
                        </p>
                        <div className="mt-3 space-y-1.5">
                            {navItems.map((item) => {
                                const Icon = item.icon
                                const isActive =
                                    pathname === item.href ||
                                    (pathname.startsWith(item.href + '/') && item.href !== '/')
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                                            isActive
                                                ? 'border-r-2 border-[#006688] bg-white/70 font-semibold text-[#006688]'
                                                : 'text-muted-foreground hover:bg-white/50 hover:text-[#006688]'
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        <span>{item.title}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {isSme && (
                        <div className="mt-8">
                            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                SME
                            </p>
                            <div className="mt-3 space-y-1.5">
                                {smeNavItems.map((item) => {
                                    const Icon = item.icon
                                    const isActive =
                                        pathname === item.href ||
                                        (pathname.startsWith(item.href + '/') && item.href !== '/sme')
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                                                isActive
                                                    ? 'border-r-2 border-[#006688] bg-white/70 font-semibold text-[#006688]'
                                                    : 'text-muted-foreground hover:bg-white/50 hover:text-[#006688]'
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

                    {isAdmin && (
                        <div className="mt-8">
                            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Admin
                            </p>
                            <div className="mt-3 space-y-1.5">
                                {adminNavItems.map((item) => {
                                    const Icon = item.icon
                                    const isActive =
                                        pathname === item.href ||
                                        (pathname.startsWith(item.href + '/') && item.href !== '/admin')
                                    return (
                                        <Link
                                            key={item.href}
                                        href={item.href}
                                        className={cn(
                                                'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                                                isActive
                                                    ? 'border-r-2 border-[#006688] bg-white/70 font-semibold text-[#006688]'
                                                    : 'text-muted-foreground hover:bg-white/50 hover:text-[#006688]'
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

            <div className="mt-auto border-t border-slate-200/60 p-4">
                <Link
                    href="/settings"
                    className="group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-white/50 hover:text-[#006688]"
                >
                    <Settings className="h-5 w-5" />
                    <span>Settings</span>
                </Link>
            </div>
        </div>
    )
}
