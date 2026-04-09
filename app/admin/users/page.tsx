'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiClient } from '@/lib/api-client'
import type { AdminUser, AdminUserStats } from '@/types'
import { formatDate } from '@/lib/utils'
import {
    Activity,
    KeyRound,
    Loader2,
    Pencil,
    RefreshCcw,
    Search as SearchIcon,
    ShieldCheck,
    UserMinus,
    UserPlus,
    Users,
} from 'lucide-react'

const PAGE_SIZE = 10

type RoleFilter = 'all' | 'ADMIN' | 'SME' | 'USER'
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
    smeUsers: 0,
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
    const confirmActionRef = useRef<null | (() => void)>(null)
    const [confirmDialog, setConfirmDialog] = useState({
        open: false,
        title: '',
        description: '',
        confirmLabel: 'Confirm',
        confirmVariant: 'default' as 'default' | 'destructive',
    })
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [errorDialogMessage, setErrorDialogMessage] = useState('')

    const [createOpen, setCreateOpen] = useState(false)
    const [creatingUser, setCreatingUser] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [createForm, setCreateForm] = useState({
        name: '',
        email: '',
        wecomUserId: '',
        department: '',
        title: '',
        password: '',
        confirmPassword: '',
    })
    const [editOpen, setEditOpen] = useState(false)
    const [editingUserId, setEditingUserId] = useState<string | null>(null)
    const [editError, setEditError] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({
        id: '',
        name: '',
        email: '',
        wecomUserId: '',
        department: '',
        title: '',
        role: 'USER' as AdminUser['role'],
    })
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordUser, setResetPasswordUser] = useState<Pick<AdminUser, 'id' | 'name' | 'email'> | null>(null)
    const [resetPasswordSaving, setResetPasswordSaving] = useState(false)
    const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)
    const [resetPasswordForm, setResetPasswordForm] = useState({
        newPassword: '',
        confirmPassword: '',
    })

    const getNextRole = (role: AdminUser['role']): AdminUser['role'] => {
        if (role === 'USER') return 'SME'
        if (role === 'SME') return 'ADMIN'
        return 'USER'
    }

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
            wecomUserId: '',
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
        const wecomUserId = createForm.wecomUserId.trim()
        const department = createForm.department.trim()
        const title = createForm.title.trim()

        if (!name || !email || !wecomUserId) {
            setCreateError('Name, email, and WeCom User ID are required')
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
                wecomUserId,
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

    const handleOpenEditUser = (user: AdminUser) => {
        setEditForm({
            id: user.id,
            name: user.name,
            email: user.email,
            wecomUserId: user.wecomUserId || '',
            department: user.department || '',
            title: user.title || '',
            role: user.role,
        })
        setEditError(null)
        setEditOpen(true)
    }

    const handleOpenResetPassword = (user: AdminUser) => {
        setResetPasswordUser({
            id: user.id,
            name: user.name,
            email: user.email,
        })
        setResetPasswordForm({
            newPassword: '',
            confirmPassword: '',
        })
        setResetPasswordError(null)
        setResetPasswordOpen(true)
    }

    const resetEditForm = () => {
        setEditForm({
            id: '',
            name: '',
            email: '',
            wecomUserId: '',
            department: '',
            title: '',
            role: 'USER',
        })
        setEditError(null)
    }

    const resetResetPasswordForm = () => {
        setResetPasswordForm({
            newPassword: '',
            confirmPassword: '',
        })
        setResetPasswordError(null)
        setResetPasswordUser(null)
    }

    const handleEditSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        setEditError(null)

        if (!editForm.id) {
            setEditError('Invalid user')
            return
        }

        const name = editForm.name.trim()
        const email = editForm.email.trim()
        const wecomUserId = editForm.wecomUserId.trim()
        const department = editForm.department.trim()
        const title = editForm.title.trim()

        if (!name || !email || !wecomUserId) {
            setEditError('Name, email, and WeCom User ID are required')
            return
        }

        setEditingUserId(editForm.id)
        try {
            await ApiClient.updateUser(editForm.id, {
                name,
                email,
                wecomUserId,
                department: department ? department : null,
                title: title ? title : null,
                role: editForm.role,
            })
            setEditOpen(false)
            resetEditForm()
            refreshData()
        } catch (err) {
            setEditError(err instanceof Error ? err.message : 'Failed to update user')
        } finally {
            setEditingUserId(null)
        }
    }

    const handleResetPasswordSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        setResetPasswordError(null)

        if (!resetPasswordUser?.id) {
            setResetPasswordError('Invalid user')
            return
        }

        if (resetPasswordForm.newPassword.length < 8) {
            setResetPasswordError('Password must be at least 8 characters')
            return
        }

        if (resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
            setResetPasswordError('Passwords do not match')
            return
        }

        setResetPasswordSaving(true)
        try {
            await ApiClient.resetUserPassword(resetPasswordUser.id, {
                newPassword: resetPasswordForm.newPassword,
            })
            setResetPasswordOpen(false)
            resetResetPasswordForm()
        } catch (err) {
            setResetPasswordError(err instanceof Error ? err.message : 'Failed to reset password')
        } finally {
            setResetPasswordSaving(false)
        }
    }

    const handleRoleToggle = async (user: AdminUser) => {
        const targetRole = getNextRole(user.role)
        const confirmMessage =
            targetRole === 'ADMIN'
                ? `Grant admin access to ${user.name}?`
                : targetRole === 'SME'
                    ? `Grant SME access to ${user.name}?`
                    : `Set ${user.name} back to learner access?`
        confirmActionRef.current = async () => {
            setActionUserId(user.id)
            try {
                await ApiClient.updateUser(user.id, { role: targetRole })
                refreshData()
            } catch (err) {
                setErrorDialogMessage(err instanceof Error ? err.message : 'Unable to update user role')
                setErrorDialogOpen(true)
            } finally {
                setActionUserId(null)
            }
        }
        setConfirmDialog({
            open: true,
            title: 'Confirm role change',
            description: confirmMessage,
            confirmLabel: 'Confirm',
            confirmVariant: 'default',
        })
    }

    const handleStatusToggle = async (user: AdminUser) => {
        if (user.status === 'DELETED') return

        const nextStatus: 'ACTIVE' | 'SUSPENDED' = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
        const confirmMessage =
            nextStatus === 'ACTIVE'
                ? `Restore access for ${user.name}?`
                : `Suspend ${user.name}'s access?`
        confirmActionRef.current = async () => {
            setActionUserId(user.id)
            try {
                await ApiClient.updateUser(user.id, { status: nextStatus })
                refreshData()
            } catch (err) {
                setErrorDialogMessage(err instanceof Error ? err.message : 'Unable to update user status')
                setErrorDialogOpen(true)
            } finally {
                setActionUserId(null)
            }
        }
        setConfirmDialog({
            open: true,
            title: 'Confirm status change',
            description: confirmMessage,
            confirmLabel: 'Confirm',
            confirmVariant: 'destructive',
        })
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
                                    <Label htmlFor="create-user-wecom-user-id">WeCom User ID</Label>
                                    <Input
                                        id="create-user-wecom-user-id"
                                        value={createForm.wecomUserId}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, wecomUserId: e.target.value }))}
                                        placeholder="zhangsan"
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
                                <div className="space-y-2 md:col-span-2">
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

                <Dialog
                    open={editOpen}
                    onOpenChange={(open) => {
                        setEditOpen(open)
                        if (!open) resetEditForm()
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit user</DialogTitle>
                            <DialogDescription>
                                Update user profile details, role, and WeCom mapping.
                            </DialogDescription>
                        </DialogHeader>

                        <form className="space-y-4" onSubmit={handleEditSubmit}>
                            {editError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{editError}</AlertDescription>
                                </Alert>
                            )}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-name">Name</Label>
                                    <Input
                                        id="edit-user-name"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-email">Email</Label>
                                    <Input
                                        id="edit-user-email"
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-wecom-user-id">WeCom User ID</Label>
                                    <Input
                                        id="edit-user-wecom-user-id"
                                        value={editForm.wecomUserId}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, wecomUserId: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-department">Department (optional)</Label>
                                    <Input
                                        id="edit-user-department"
                                        value={editForm.department}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-title">Title (optional)</Label>
                                    <Input
                                        id="edit-user-title"
                                        value={editForm.title}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-user-role">Role</Label>
                                    <select
                                        id="edit-user-role"
                                        className="h-10 w-full rounded-md border bg-background px-3"
                                        value={editForm.role}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value as AdminUser['role'] }))}
                                    >
                                        <option value="USER">Learner</option>
                                        <option value="SME">SME</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} disabled={Boolean(editingUserId)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={Boolean(editingUserId)}>
                                    {editingUserId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Save changes
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={resetPasswordOpen}
                    onOpenChange={(open) => {
                        setResetPasswordOpen(open)
                        if (!open) resetResetPasswordForm()
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset password</DialogTitle>
                            <DialogDescription>
                                Set a new password for {resetPasswordUser?.name || 'this user'} ({resetPasswordUser?.email || 'unknown user'}).
                            </DialogDescription>
                        </DialogHeader>

                        <form className="space-y-4" onSubmit={handleResetPasswordSubmit}>
                            {resetPasswordError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{resetPasswordError}</AlertDescription>
                                </Alert>
                            )}

                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="reset-user-password">New password</Label>
                                    <Input
                                        id="reset-user-password"
                                        type="password"
                                        value={resetPasswordForm.newPassword}
                                        onChange={(e) => setResetPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reset-user-confirm-password">Confirm new password</Label>
                                    <Input
                                        id="reset-user-confirm-password"
                                        type="password"
                                        value={resetPasswordForm.confirmPassword}
                                        onChange={(e) => setResetPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setResetPasswordOpen(false)} disabled={resetPasswordSaving}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={resetPasswordSaving}>
                                    {resetPasswordSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Reset password
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
                            label: 'SMEs',
                            value: stats.smeUsers,
                            description: 'Own domains and training workflows',
                            icon: Users,
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
                                            <SelectItem value="SME">SMEs</SelectItem>
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
                                                                    WeCom ID: {user.wecomUserId || 'Not set'}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {user.department || 'Department N/A'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <Badge variant={user.role === 'ADMIN' ? 'default' : user.role === 'SME' ? 'outline' : 'secondary'}>
                                                            {user.role === 'ADMIN' ? 'Admin' : user.role === 'SME' ? 'SME' : 'Learner'}
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
                                                        {(() => {
                                                            const nextRole = getNextRole(user.role)
                                                            return (
                                                        <div className="flex items-center justify-end space-x-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleOpenResetPassword(user)}
                                                                disabled={actionUserId === user.id || resetPasswordSaving}
                                                            >
                                                                <KeyRound className="h-4 w-4 mr-2" />
                                                                Reset password
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleOpenEditUser(user)}
                                                                disabled={actionUserId === user.id || Boolean(editingUserId)}
                                                            >
                                                                <Pencil className="h-4 w-4 mr-2" />
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleRoleToggle(user)}
                                                                disabled={actionUserId === user.id}
                                                            >
                                                                {actionUserId === user.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : nextRole === 'ADMIN' ? (
                                                                    <>
                                                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                                                        Promote Admin
                                                                    </>
                                                                ) : nextRole === 'SME' ? (
                                                                    <>
                                                                        <UserPlus className="h-4 w-4 mr-2" />
                                                                        Promote SME
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <UserMinus className="h-4 w-4 mr-2" />
                                                                        Set Learner
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
                                                            )
                                                        })()}
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
            <ConfirmDialog
                open={confirmDialog.open}
                onOpenChange={(open) => {
                    setConfirmDialog(prev => ({ ...prev, open }))
                    if (!open) confirmActionRef.current = null
                }}
                title={confirmDialog.title}
                description={confirmDialog.description}
                confirmLabel={confirmDialog.confirmLabel}
                confirmVariant={confirmDialog.confirmVariant}
                onConfirm={() => {
                    const action = confirmActionRef.current
                    setConfirmDialog(prev => ({ ...prev, open: false }))
                    confirmActionRef.current = null
                    if (action) action()
                }}
            />
            <ConfirmDialog
                open={errorDialogOpen}
                onOpenChange={setErrorDialogOpen}
                title="Action failed"
                description={errorDialogMessage}
                confirmLabel="OK"
                showCancel={false}
                onConfirm={() => setErrorDialogOpen(false)}
            />
        </DashboardLayout>
    )
}
