'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Home,
    BookOpen,
    Trophy,
    User,
    Settings,
    LayoutDashboard,
    Users,
    BarChart3,
    Bot,
    GraduationCap,
    CalendarClock,
    FileText,
} from 'lucide-react'
import type { AuthUser } from '@/lib/auth-middleware'

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
    label: string
    items: NavItem[]
}

const navItems: NavItem[] = [
    { title: 'Dashboard', href: '/', icon: Home },
    { title: 'Courses', href: '/courses', icon: BookOpen },
    { title: 'My Learning', href: '/training', icon: CalendarClock },
    { title: 'My Exams', href: '/exams', icon: GraduationCap },
    { title: 'My Rewards', href: '/rewards', icon: Trophy },
    { title: 'Profile', href: '/profile', icon: User },
]

const adminNavGroups: NavGroup[] = [
    {
        label: 'Overview',
        items: [
            { title: 'Admin Home', href: '/admin', icon: LayoutDashboard },
            { title: 'Team Learning Health', href: '/admin/training-ops', icon: CalendarClock },
            { title: 'Action Center', href: '/admin/training-ops#action-center', icon: FileText },
        ],
    },
    {
        label: 'Operations',
        items: [
            { title: 'Learning Programs', href: '/admin/training-ops/series', icon: GraduationCap },
            { title: 'Events', href: '/admin/training-ops/events', icon: CalendarClock },
        ],
    },
    {
        label: 'Content',
        items: [
            { title: 'Courses', href: '/admin/courses', icon: BookOpen },
            { title: 'Exams', href: '/admin/exams', icon: FileText },
        ],
    },
    {
        label: 'Insights',
        items: [
            { title: 'Domain Effectiveness', href: '/admin/training-ops/effectiveness', icon: BarChart3 },
            { title: 'Leaderboard', href: '/admin/training-ops/leaderboard', icon: Trophy },
            { title: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
        ],
    },
    {
        label: 'Governance',
        items: [
            { title: 'Domains & Ownership', href: '/admin/training-ops/domains', icon: Users },
            { title: 'Recognition Rules', href: '/admin/training-ops/badges', icon: Trophy },
            { title: 'User Management', href: '/admin/users', icon: Users },
            { title: 'AI Configuration', href: '/admin/ai-config', icon: Bot },
        ],
    },
]

const smeNavGroups: NavGroup[] = [
    {
        label: 'Workspace',
        items: [
            { title: 'SME Overview', href: '/sme', icon: LayoutDashboard },
            { title: 'Learning Programs', href: '/sme/training-ops/series', icon: GraduationCap },
            { title: 'Events', href: '/sme/training-ops/events', icon: CalendarClock },
        ],
    },
    {
        label: 'Content',
        items: [
            { title: 'Courses', href: '/sme/training-ops/courses', icon: BookOpen },
            { title: 'Exams', href: '/sme/training-ops/exams', icon: FileText },
        ],
    },
    {
        label: 'Insights',
        items: [
            { title: 'Effectiveness', href: '/sme/training-ops/effectiveness', icon: BarChart3 },
        ],
    },
    {
        label: 'Governance',
        items: [
            { title: 'My Domain Scope', href: '/sme/training-ops/domains', icon: Users },
            { title: 'Domain Badges', href: '/sme/training-ops/badges', icon: Trophy },
        ],
    },
    {
        label: 'Tools',
        items: [
            { title: 'MCP Lab', href: '/sme/mcp', icon: Bot },
        ],
    },
]

interface SidebarProps {
    user?: AuthUser | null
    className?: string
    mobile?: boolean
}

export function Sidebar({ user, className, mobile = false }: SidebarProps) {
    const pathname = usePathname()
    const isAdmin = user?.role === 'ADMIN'
    const isSme = user?.role === 'SME'

    const isNavItemActive = (href: string) => {
        const pathOnlyHref = href.split('#')[0]
        if (href.includes('#')) return false
        if (pathname === pathOnlyHref) return true
        if (href === '/' || href === '/sme' || href === '/admin' || href === '/admin/training-ops') return false
        return pathname.startsWith(pathOnlyHref + '/')
    }

    const renderNavLink = (
        item: NavItem,
        options?: {
            depth?: number
        }
    ) => {
        const Icon = item.icon
        const isActive = isNavItemActive(item.href)
        const depth = options?.depth ?? 0

        return (
            <Link
                key={item.href}
                href={item.href}
                className={cn(
                    'group flex items-start rounded-xl py-3 pr-4 text-sm font-medium transition-all duration-200',
                    isActive
                        ? 'border-r-2 border-[#006688] bg-white/70 font-semibold text-[#006688]'
                        : 'text-muted-foreground hover:bg-white/50 hover:text-[#006688]'
                )}
                style={{ paddingLeft: `${16 + depth * 16}px` }}
            >
                <div className="flex min-w-0 items-start gap-3">
                    {depth > 0 ? <span className="h-px w-3 rounded-full bg-slate-300" aria-hidden="true" /> : null}
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <span className="min-w-0 break-words leading-5">{item.title}</span>
                </div>
            </Link>
        )
    }

    return (
        <div className={cn(
            'h-full min-w-0 flex-col border-r border-slate-200/30 bg-slate-50',
            mobile ? 'flex pt-5' : 'hidden pt-20 lg:flex',
            className
        )}>
            <div className="mb-8 px-4">
                <h2 className="mb-4 px-2 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/70">
                    Learning Workspace
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
                                            'group flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                                            isActive
                                                ? 'border-r-2 border-[#006688] bg-white/70 font-semibold text-[#006688]'
                                                : 'text-muted-foreground hover:bg-white/50 hover:text-[#006688]'
                                        )}
                                    >
                                        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                                        <span className="min-w-0 break-words leading-5">{item.title}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {isSme && (
                        <div className="mt-8 space-y-6">
                            {smeNavGroups.map((group) => (
                                <div key={group.label}>
                                    <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        {group.label}
                                    </p>
                                    <div className="mt-3 space-y-1.5">
                                        {group.items.map((item) => renderNavLink(item))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {isAdmin && (
                        <div className="mt-8 space-y-6">
                            {adminNavGroups.map((group) => (
                                <div key={group.label}>
                                    <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        {group.label}
                                    </p>
                                    <div className="mt-3 space-y-1.5">
                                        {group.items.map((item) => renderNavLink(item))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </nav>
            </div>

            <div className="mt-auto border-t border-slate-200/60 p-4">
                <Link
                    href="/settings"
                    className="group flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-white/50 hover:text-[#006688]"
                >
                    <Settings className="mt-0.5 h-5 w-5 shrink-0" />
                    <span className="min-w-0 break-words leading-5">Settings</span>
                </Link>
            </div>
        </div>
    )
}
