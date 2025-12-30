'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, AdminUserStats } from '@/types'
import { formatDate } from '@/lib/utils'
import {
    Activity,
    Loader2,
    RefreshCcw,
    Search as SearchIcon,
    ShieldCheck,
    UserMinus,
    UserPlus,
    Users,
} from 'lucide-react'

const PAGE_SIZE = 10

type RoleFilter = 'all' | 'ADMIN' | 'USER'
type StatusFilter = 'all' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'

interface FilterState {
    search: string
    role: RoleFilter
    status: StatusFilter
}

const DEFAULT_STATS: AdminUserStats = {
    totalUsers: 0,
    activeUsers: 0,
    adminUsers: 0,
    newThisMonth: 0,
}

const statusStyles: Record<Exclude<AdminUser['status'], undefined>, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    SUSPENDED: 'bg-amber-100 text-amber-800 border-amber-200',
    DELETED: 'bg-red-100 text-red-800 border-red-200',
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [stats, setStats] = useState<AdminUserStats>(DEFAULT_STATS)
    const [filters, setFilters] = useState<FilterState>({ search: '', role: 'all', status: 'all' })
    const [searchInput, setSearchInput] = useState('')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalResults, setTotalResults] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshIndex, setRefreshIndex] = useState(0)
    const [actionUserId, setActionUserId] = useState<string | null>(null)

    const [createOpen, setCreateOpen] = useState(false)
    const [creatingUser, setCreatingUser] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [createForm, setCreateForm] = useState({
        name: '',
        email: '',
        department: '',
        title: '',
        password: '',
        confirmPassword: '',
    })

    useEffect(() => {
        let cancelled = false

        const loadUsers = async () => {
            setLoading(true)
            setError(null)

            try {
                const params: Record<string, string | number> = {
                    page,
                    limit: PAGE_SIZE,
                }

                if (filters.search) {
                    params.search = filters.search
                }

                if (filters.role !== 'all') {
                    params.role = filters.role
                }

                if (filters.status !== 'all') {
                    params.status = filters.status
                }

                const response = await ApiClient.getUsers(params)

                if (cancelled) return

                setUsers(response.data.users)
                setStats(response.data.stats)
                setTotalPages(response.data.pagination.totalPages)
                setTotalResults(response.data.pagination.total)
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load users')
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadUsers()

        return () => {
            cancelled = true
        }
    }, [filters, page, refreshIndex])

    const handleRoleFilterChange = (value: RoleFilter) => {
        setFilters(prev => ({ ...prev, role: value }))
        setPage(1)
    }

    const handleStatusFilterChange = (value: StatusFilter) => {
        setFilters(prev => ({ ...prev, status: value }))
        setPage(1)
    }

    const handleSearchSubmit = (event: React.FormEvent) => {
        event.preventDefault()
        setFilters(prev => ({ ...prev, search: searchInput.trim() }))
        setPage(1)
    }

    const resetFilters = () => {
        setFilters({ search: '', role: 'all', status: 'all' })
        setSearchInput('')
        setPage(1)
    }

    const refreshData = () => {
        setRefreshIndex(prev => prev + 1)
    }

    const resetCreateForm = () => {
        setCreateForm({
            name: '',
            email: '',
            department: '',
            title: '',
            password: '',
            confirmPassword: '',
        })
        setCreateError(null)
    }

    const handleCreateSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        setCreateError(null)

        const name = createForm.name.trim()
        const email = createForm.email.trim()
        const department = createForm.department.trim()
        const title = createForm.title.trim()

        if (!name || !email) {
            setCreateError('Name and email are required')
            return
        }

        if (createForm.password.length < 8) {
            setCreateError('Password must be at least 8 characters')
            return
        }

        if (createForm.password !== createForm.confirmPassword) {
            setCreateError('Passwords do not match')
            return
        }

        setCreatingUser(true)
        try {
            await ApiClient.createAdminUser({
                name,
                email,
                password: createForm.password,
                department: department ? department : undefined,
                title: title ? title : undefined,
            })
            setCreateOpen(false)
            resetCreateForm()
            refreshData()
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : 'Failed to create user')
        } finally {
            setCreatingUser(false)
        }
    }

    const handleRoleToggle = async (user: AdminUser) => {
        const targetRole: 'ADMIN' | 'USER' = user.role === 'ADMIN' ? 'USER' : 'ADMIN'
        const confirmMessage =
            targetRole === 'ADMIN'
                ? `Grant admin access to ${user.name}?`
                : `Remove admin access from ${user.name}?`
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return

        setActionUserId(user.id)
        try {
            await ApiClient.updateUser(user.id, { role: targetRole })
            refreshData()
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Unable to update user role')
        } finally {
            setActionUserId(null)
        }
    }

    const handleStatusToggle = async (user: AdminUser) => {
        if (user.status === 'DELETED') return

        const nextStatus: 'ACTIVE' | 'SUSPENDED' = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
        const confirmMessage =
            nextStatus === 'ACTIVE'
                ? `Restore access for ${user.name}?`
                : `Suspend ${user.name}'s access?`
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return

        setActionUserId(user.id)
        try {
            await ApiClient.updateUser(user.id, { status: nextStatus })
            refreshData()
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Unable to update user status')
        } finally {
            setActionUserId(null)
        }
    }

    const statusSummary = useMemo(() => {
        return {
            active: users.filter(user => user.status === 'ACTIVE').length,
            suspended: users.filter(user => user.status === 'SUSPENDED').length,
        }
    }, [users])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">User Management</h1>
                        <p className="text-muted-foreground mt-1">
                            Monitor user activity, roles, and access levels
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => setCreateOpen(true)} disabled={loading}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Create user
                        </Button>
                        <Button variant="outline" onClick={refreshData} disabled={loading}>
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </div>
                </div>

                <Dialog
                    open={createOpen}
                    onOpenChange={(open) => {
                        setCreateOpen(open)
                        if (!open) resetCreateForm()
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create user</DialogTitle>
                            <DialogDescription>
                                Create a login for a learner. They can change their password after signing in.
                            </DialogDescription>
                        </DialogHeader>

                        <form className="space-y-4" onSubmit={handleCreateSubmit}>
                            {createError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{createError}</AlertDescription>
                                </Alert>
                            )}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="create-user-name">Name</Label>
                                    <Input
                                        id="create-user-name"
                                        value={createForm.name}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="create-user-email">Email</Label>
                                    <Input
                                        id="create-user-email"
                                        type="email"
                                        value={createForm.email}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="name@agora.io"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="create-user-department">Department (optional)</Label>
                                    <Input
                                        id="create-user-department"
                                        value={createForm.department}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, department: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="create-user-title">Title (optional)</Label>
                                    <Input
                                        id="create-user-title"
                                        value={createForm.title}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="create-user-password">Password</Label>
                                    <Input
                                        id="create-user-password"
                                        type="password"
                                        value={createForm.password}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="create-user-confirm-password">Confirm password</Label>
                                    <Input
                                        id="create-user-confirm-password"
                                        type="password"
                                        value={createForm.confirmPassword}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} disabled={creatingUser}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={creatingUser}>
                                    {creatingUser ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Create
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[
                        {
                            label: 'Total Users',
                            value: stats.totalUsers,
                            description: 'All registered learners',
                            icon: Users,
                        },
                        {
                            label: 'Active Users',
                            value: stats.activeUsers,
                            description: `${statusSummary.active} on this page`,
                            icon: Activity,
                        },
                        {
                            label: 'Admins',
                            value: stats.adminUsers,
                            description: 'Have elevated permissions',
                            icon: ShieldCheck,
                        },
                        {
                            label: 'New This Month',
                            value: stats.newThisMonth,
                            description: 'Joined since month start',
                            icon: UserPlus,
                        },
                    ].map(({ label, value, description, icon: Icon }) => (
                        <Card key={label}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                                <Icon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground mt-1">{description}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Filters</CardTitle>
                        <CardDescription>Refine the user list</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                            <form id="admin-users-search" onSubmit={handleSearchSubmit} className="flex-1">
                                <div className="relative">
                                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name, email, or department"
                                        className="pl-10"
                                        value={searchInput}
                                        onChange={e => setSearchInput(e.target.value)}
                                    />
                                </div>
                            </form>
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                                <div className="w-full lg:w-48">
                                    <p className="text-xs text-muted-foreground mb-2">Role</p>
                                    <Select value={filters.role} onValueChange={value => handleRoleFilterChange(value as RoleFilter)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="All roles" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All roles</SelectItem>
                                            <SelectItem value="ADMIN">Admins</SelectItem>
                                            <SelectItem value="USER">Learners</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-full lg:w-48">
                                    <p className="text-xs text-muted-foreground mb-2">Status</p>
                                    <Select value={filters.status} onValueChange={value => handleStatusFilterChange(value as StatusFilter)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="All statuses" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All statuses</SelectItem>
                                            <SelectItem value="ACTIVE">Active</SelectItem>
                                            <SelectItem value="SUSPENDED">Suspended</SelectItem>
                                            <SelectItem value="DELETED">Deleted</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex space-x-2">
                                    <Button type="submit" form="admin-users-search" variant="secondary">
                                        Apply Search
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={resetFilters}>
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Users ({totalResults.toLocaleString()})</CardTitle>
                                <CardDescription>
                                    Showing page {page} of {totalPages}
                                </CardDescription>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Suspended on this page: {statusSummary.suspended}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-12">
                                <p className="font-medium mb-2">Unable to load users</p>
                                <p className="text-sm text-muted-foreground mb-4">{error}</p>
                                <Button variant="outline" onClick={refreshData}>
                                    Try again
                                </Button>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="text-center py-12 text-sm text-muted-foreground">
                                No users match your filters.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-muted-foreground border-b">
                                                <th className="py-3 pr-4 font-medium">User</th>
                                                <th className="py-3 pr-4 font-medium">Role</th>
                                                <th className="py-3 pr-4 font-medium">Status</th>
                                                <th className="py-3 pr-4 font-medium">Progress</th>
                                                <th className="py-3 pr-4 font-medium">Last Active</th>
                                                <th className="py-3 font-medium text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(user => (
                                                <tr key={user.id} className="border-b last:border-0">
                                                    <td className="py-3 pr-4">
                                                        <div className="flex items-center space-x-3">
                                                            <Avatar className="h-10 w-10">
                                                                {user.avatar ? (
                                                                    <AvatarImage src={user.avatar} alt={user.name} />
                                                                ) : null}
                                                                <AvatarFallback>
                                                                    {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="font-medium">{user.name}</p>
                                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {user.department || 'Department N/A'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                                                            {user.role === 'ADMIN' ? 'Admin' : 'Learner'}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <Badge className={statusStyles[user.status]} variant="outline">
                                                            {user.status.charAt(0) + user.status.slice(1).toLowerCase()}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <p className="font-medium">{user.completedCourses} completed</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {user.enrollmentCount} total enrollments
                                                        </p>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <div className="text-sm">
                                                            <p>{user.lastLoginAt ? formatDate(user.lastLoginAt) : 'No activity'}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                Joined {formatDate(user.createdAt)}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="flex items-center justify-end space-x-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleRoleToggle(user)}
                                                                disabled={actionUserId === user.id}
                                                            >
                                                                {actionUserId === user.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : user.role === 'ADMIN' ? (
                                                                    <>
                                                                        <UserMinus className="h-4 w-4 mr-2" />
                                                                        Revoke
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                                                        Promote
                                                                    </>
                                                                )}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleStatusToggle(user)}
                                                                disabled={actionUserId === user.id || user.status === 'DELETED'}
                                                                className={user.status === 'SUSPENDED' ? 'text-emerald-600' : 'text-red-600'}
                                                            >
                                                                {actionUserId === user.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : user.status === 'SUSPENDED' ? (
                                                                    <>
                                                                        <UserPlus className="h-4 w-4 mr-2" />
                                                                        Activate
                                                                    </>
                                                                ) : user.status === 'ACTIVE' ? (
                                                                    <>
                                                                        <UserMinus className="h-4 w-4 mr-2" />
                                                                        Suspend
                                                                    </>
                                                                ) : (
                                                                    <span>Locked</span>
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                    <p className="text-muted-foreground">
                                        Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalResults)} of {totalResults} users
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page === 1 || loading}
                                            onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={page >= totalPages || loading}
                                            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
