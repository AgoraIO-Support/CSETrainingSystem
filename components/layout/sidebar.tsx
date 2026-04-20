'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
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
    ChevronRight,
    ChevronDown,
} from 'lucide-react'
import type { AuthUser } from '@/lib/auth-middleware'

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
}

interface SmeDirectoryItem extends NavItem {
    children?: SmeDirectoryItem[]
}

const navItems: NavItem[] = [
    { title: 'Dashboard', href: '/', icon: Home },
    { title: 'Courses', href: '/courses', icon: BookOpen },
    { title: 'My Learning', href: '/training', icon: CalendarClock },
    { title: 'My Exams', href: '/exams', icon: GraduationCap },
    { title: 'My Rewards', href: '/rewards', icon: Trophy },
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

const smeHomeNavItems: NavItem[] = [
    { title: 'SME Dashboard', href: '/sme', icon: LayoutDashboard },
]

const smeDirectoryNavItems: SmeDirectoryItem[] = [
    {
        title: 'My Domains',
        href: '/sme/training-ops/domains',
        icon: BookOpen,
        children: [
            {
                title: 'My Series',
                href: '/sme/training-ops/series',
                icon: GraduationCap,
                children: [
                    {
                        title: 'My Events',
                        href: '/sme/training-ops/events',
                        icon: CalendarClock,
                        children: [
                            {
                                title: 'Managed Courses',
                                href: '/sme/training-ops/courses',
                                icon: BookOpen,
                            },
                            {
                                title: 'Managed Exams',
                                href: '/sme/training-ops/exams',
                                icon: FileText,
                            },
                        ],
                    },
                ],
            },
        ],
    },
]

const smeToolNavItems: NavItem[] = [
    { title: 'Effectiveness', href: '/sme/training-ops/effectiveness', icon: BarChart3 },
    { title: 'MCP Lab', href: '/sme/mcp', icon: Bot },
]

interface SidebarProps {
    user?: AuthUser | null
    className?: string
}

export function Sidebar({ user, className }: SidebarProps) {
    const pathname = usePathname()
    const isAdmin = user?.role === 'ADMIN'
    const isSme = user?.role === 'SME'
    const [expandedSmeDirectoryItems, setExpandedSmeDirectoryItems] = useState<Record<string, boolean>>({
        '/sme/training-ops/domains': true,
        '/sme/training-ops/series': true,
        '/sme/training-ops/events': true,
    })

    const isNavItemActive = (href: string) => {
        if (pathname === href) return true
        if (href === '/' || href === '/sme' || href === '/admin') return false
        return pathname.startsWith(href + '/')
    }

    const hasActiveDescendant = (item: SmeDirectoryItem): boolean => {
        if (!item.children?.length) return false

        return item.children.some((child) => isNavItemActive(child.href) || hasActiveDescendant(child))
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

    const toggleSmeDirectoryItem = (href: string) => {
        setExpandedSmeDirectoryItems((current) => ({
            ...current,
            [href]: !current[href],
        }))
    }

    const renderSmeDirectoryItem = (item: SmeDirectoryItem, depth = 0) => {
        const Icon = item.icon
        const isActive = isNavItemActive(item.href)
        const isBranchActive = isActive || hasActiveDescendant(item)
        const hasChildren = Boolean(item.children?.length)
        const isExpanded = hasChildren ? expandedSmeDirectoryItems[item.href] ?? isBranchActive : false
        const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

        return (
            <div key={item.href} className="space-y-1.5">
                <div
                    className={cn(
                        'group flex items-center gap-2 rounded-xl transition-all duration-200',
                        isBranchActive && !isActive ? 'bg-white/60' : ''
                    )}
                    style={{ paddingLeft: `${depth * 16}px` }}
                >
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={() => toggleSmeDirectoryItem(item.href)}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.title}`}
                            aria-expanded={isExpanded}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#006688]"
                        >
                            <ChevronIcon className="h-4 w-4" />
                        </button>
                    ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
                            <span className="h-px w-3 rounded-full bg-slate-300" />
                        </span>
                    )}

                    <Link
                        href={item.href}
                        className={cn(
                            'flex min-w-0 flex-1 items-start gap-3 rounded-xl py-3 pr-4 text-sm font-medium transition-all duration-200',
                            isActive
                                ? 'border-r-2 border-[#006688] bg-white/80 font-semibold text-[#006688]'
                                : isBranchActive
                                  ? 'text-slate-700 hover:bg-white/70 hover:text-[#006688]'
                                  : 'text-muted-foreground hover:bg-white/50 hover:text-[#006688]'
                        )}
                    >
                        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                        <span className="min-w-0 break-words leading-5">{item.title}</span>
                    </Link>
                </div>

                {hasChildren && isExpanded ? (
                    <div className="space-y-1.5">
                        {item.children?.map((child) => renderSmeDirectoryItem(child, depth + 1))}
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <div className={cn('hidden h-full min-w-0 flex-col border-r border-slate-200/30 bg-slate-50 pt-20 lg:flex', className)}>
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
                        <div className="mt-8">
                            <div>
                                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    SME Home
                                </p>
                                <div className="mt-3 space-y-1.5">
                                    {smeHomeNavItems.map((item) => renderNavLink(item))}
                                </div>

                                <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/40 p-2">
                                    <div className="space-y-1.5">
                                        {smeDirectoryNavItems.map((item) => renderSmeDirectoryItem(item))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Tools
                                </p>
                                <div className="mt-3 space-y-1.5">
                                    {smeToolNavItems.map((item) => renderNavLink(item))}
                                </div>
                            </div>
                        </div>
                    )}

                    {isAdmin && (
                        <div className="mt-8">
                            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Admin
                            </p>
                            <div className="mt-3 space-y-1.5">
                                {adminNavItems.map((item) => renderNavLink(item))}
                            </div>
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
