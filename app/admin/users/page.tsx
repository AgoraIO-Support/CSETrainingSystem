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
import type { AdminUser, AdminUserStats, ProductDomainSummary } from '@/types'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
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
type PromoteAssignmentMode = 'PRIMARY' | 'BACKUP' | 'ALREADY_ASSIGNED' | 'UNAVAILABLE'
type DomainAssignmentOption = {
    domain: ProductDomainSummary
    mode: PromoteAssignmentMode
    helperText: string
    disabled: boolean
}

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

const buildDomainAssignmentOptions = (
    domains: ProductDomainSummary[],
    targetUserId: string | null
): DomainAssignmentOption[] => {
    if (!targetUserId) {
        return []
    }

    return domains.map((domain) => {
        let mode: PromoteAssignmentMode
        let helperText: string

        if (domain.primarySme?.id === targetUserId) {
            mode = 'ALREADY_ASSIGNED'
            helperText = 'Already assigned as primary SME.'
        } else if (domain.backupSme?.id === targetUserId) {
            mode = 'ALREADY_ASSIGNED'
            helperText = 'Already assigned as backup SME.'
        } else if (!domain.primarySme) {
            mode = 'PRIMARY'
            helperText = 'Will assign as primary SME.'
        } else if (!domain.backupSme) {
            mode = 'BACKUP'
            helperText = `Primary SME: ${domain.primarySme.name}. Will assign as backup SME.`
        } else {
            mode = 'UNAVAILABLE'
            helperText = `Primary SME: ${domain.primarySme.name}. Backup SME: ${domain.backupSme.name}.`
        }

        return {
            domain,
            mode,
            helperText,
            disabled: mode === 'UNAVAILABLE',
        }
    })
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
        initialRole: 'USER' as AdminUser['role'],
    })
    const [editDomains, setEditDomains] = useState<ProductDomainSummary[]>([])
    const [editSelectedDomainIds, setEditSelectedDomainIds] = useState<string[]>([])
    const [editLoadingDomains, setEditLoadingDomains] = useState(false)
    const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
    const [resetPasswordUser, setResetPasswordUser] = useState<Pick<AdminUser, 'id' | 'name' | 'email'> | null>(null)
    const [resetPasswordSaving, setResetPasswordSaving] = useState(false)
    const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)
    const [resetPasswordForm, setResetPasswordForm] = useState({
        newPassword: '',
        confirmPassword: '',
    })
    const [promoteSmeOpen, setPromoteSmeOpen] = useState(false)
    const [promoteSmeTarget, setPromoteSmeTarget] = useState<Pick<AdminUser, 'id' | 'name' | 'email'> | null>(null)
    const [promoteSmeDomains, setPromoteSmeDomains] = useState<ProductDomainSummary[]>([])
    const [promoteSmeSelectedDomainIds, setPromoteSmeSelectedDomainIds] = useState<string[]>([])
    const [promoteSmeLoadingDomains, setPromoteSmeLoadingDomains] = useState(false)
    const [promoteSmeSaving, setPromoteSmeSaving] = useState(false)
    const [promoteSmeError, setPromoteSmeError] = useState<string | null>(null)

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

    useEffect(() => {
        if (!promoteSmeOpen || !promoteSmeTarget) {
            return
        }

        let cancelled = false

        const loadDomains = async () => {
            try {
                setPromoteSmeLoadingDomains(true)
                setPromoteSmeError(null)
                const response = await ApiClient.getTrainingOpsDomains({ limit: 200 })

                if (cancelled) return

                setPromoteSmeDomains(response.data)
            } catch (err) {
                if (cancelled) return
                setPromoteSmeError(err instanceof Error ? err.message : 'Failed to load product domains')
            } finally {
                if (!cancelled) {
                    setPromoteSmeLoadingDomains(false)
                }
            }
        }

        void loadDomains()

        return () => {
            cancelled = true
        }
    }, [promoteSmeOpen, promoteSmeTarget])

    useEffect(() => {
        if (!editOpen) {
            return
        }

        let cancelled = false

        const loadDomains = async () => {
            try {
                setEditLoadingDomains(true)
                const response = await ApiClient.getTrainingOpsDomains({ limit: 200 })

                if (cancelled) return

                setEditDomains(response.data)
            } catch (err) {
                if (cancelled) return
                setEditError(err instanceof Error ? err.message : 'Failed to load product domains')
            } finally {
                if (!cancelled) {
                    setEditLoadingDomains(false)
                }
            }
        }

        void loadDomains()

        return () => {
            cancelled = true
        }
    }, [editOpen])

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
            initialRole: user.role,
        })
        setEditSelectedDomainIds(user.domainAssignments.map((assignment) => assignment.domainId))
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
            initialRole: 'USER',
        })
        setEditDomains([])
        setEditSelectedDomainIds([])
        setEditLoadingDomains(false)
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

    const resetPromoteSmeDialog = () => {
        setPromoteSmeTarget(null)
        setPromoteSmeDomains([])
        setPromoteSmeSelectedDomainIds([])
        setPromoteSmeError(null)
        setPromoteSmeSaving(false)
        setPromoteSmeLoadingDomains(false)
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

        if (editForm.role === 'SME' && editSelectedDomainIds.length === 0) {
            setEditError('Select at least one domain for an SME user')
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
                domainIds: editForm.role === 'SME' ? editSelectedDomainIds : [],
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

    const handleOpenPromoteSmeDialog = (user: AdminUser) => {
        setPromoteSmeTarget({
            id: user.id,
            name: user.name,
            email: user.email,
        })
        setPromoteSmeSelectedDomainIds([])
        setPromoteSmeDomains([])
        setPromoteSmeError(null)
        setPromoteSmeOpen(true)
    }

    const handlePromoteSmeSubmit = async (event: React.FormEvent) => {
        event.preventDefault()

        if (!promoteSmeTarget) {
            setPromoteSmeError('Invalid user')
            return
        }

        if (promoteSmeSelectedDomainIds.length === 0) {
            setPromoteSmeError('Select at least one domain before promoting this user to SME')
            return
        }

        setPromoteSmeSaving(true)
        setPromoteSmeError(null)

        try {
            await ApiClient.promoteUserToSme(promoteSmeTarget.id, {
                domainIds: promoteSmeSelectedDomainIds,
            })
            setPromoteSmeOpen(false)
            resetPromoteSmeDialog()
            refreshData()
        } catch (err) {
            setPromoteSmeError(err instanceof Error ? err.message : 'Unable to promote user to SME')
        } finally {
            setPromoteSmeSaving(false)
        }
    }

    const handleRoleToggle = async (user: AdminUser) => {
        const targetRole = getNextRole(user.role)

        if (targetRole === 'SME') {
            handleOpenPromoteSmeDialog(user)
            return
        }

        const confirmMessage =
            targetRole === 'ADMIN'
                ? `Grant admin access to ${user.name}?`
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

    const promoteSmeDomainOptions = useMemo(() => {
        return buildDomainAssignmentOptions(promoteSmeDomains, promoteSmeTarget?.id ?? null)
    }, [promoteSmeDomains, promoteSmeTarget])

    const editDomainOptions = useMemo(() => {
        return buildDomainAssignmentOptions(editDomains, editForm.id || null)
    }, [editDomains, editForm.id])

    const orphanSmesOnPage = useMemo(() => (
        users.filter(user => user.role === 'SME' && user.domainAssignments.length === 0)
    ), [users])

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
                        <Button asChild variant="outline">
                            <Link href="/admin/users/sme-scope-audit">
                                SME Scope Audit
                            </Link>
                        </Button>
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
                                {editForm.role === 'SME' ? (
                                    <div className="space-y-3 md:col-span-2">
                                        <div className="flex items-center justify-between">
                                            <Label>SME Domains</Label>
                                            <span className="text-xs text-muted-foreground">
                                                {editSelectedDomainIds.length} selected
                                            </span>
                                        </div>
                                        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                            SMEs must be bound to at least one domain. A user can hold multiple domains, and each selected domain will use the first available SME slot.
                                        </div>
                                        <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
                                            {editLoadingDomains ? (
                                                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Loading domains...
                                                </div>
                                            ) : editDomainOptions.length === 0 ? (
                                                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                                    No product domains are available yet.
                                                </div>
                                            ) : (
                                                editDomainOptions.map(({ domain, mode, helperText, disabled }) => {
                                                    const checked = editSelectedDomainIds.includes(domain.id)

                                                    return (
                                                        <label
                                                            key={domain.id}
                                                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                                                disabled
                                                                    ? 'cursor-not-allowed bg-muted/40 opacity-70'
                                                                    : checked
                                                                        ? 'border-primary bg-primary/5'
                                                                        : 'hover:bg-muted/40'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="mt-1 h-4 w-4 rounded border"
                                                                disabled={disabled || Boolean(editingUserId)}
                                                                checked={checked}
                                                                onChange={() => {
                                                                    setEditSelectedDomainIds((prev) =>
                                                                        checked
                                                                            ? prev.filter((id) => id !== domain.id)
                                                                            : [...prev, domain.id]
                                                                    )
                                                                }}
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-medium text-foreground">{domain.name}</span>
                                                                    <Badge variant="outline">{domain.category}</Badge>
                                                                    <Badge variant="outline">{domain.track}</Badge>
                                                                    <Badge
                                                                        className={
                                                                            mode === 'PRIMARY'
                                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                                : mode === 'BACKUP'
                                                                                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                                                                                    : mode === 'ALREADY_ASSIGNED'
                                                                                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                                                                                        : 'border-slate-200 bg-slate-100 text-slate-600'
                                                                        }
                                                                        variant="outline"
                                                                    >
                                                                        {mode === 'PRIMARY'
                                                                            ? 'Primary slot'
                                                                            : mode === 'BACKUP'
                                                                                ? 'Backup slot'
                                                                                : mode === 'ALREADY_ASSIGNED'
                                                                                    ? 'Already assigned'
                                                                                    : 'Unavailable'}
                                                                    </Badge>
                                                                </div>
                                                                <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>
                                                            </div>
                                                        </label>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                ) : null}
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

                <Dialog
                    open={promoteSmeOpen}
                    onOpenChange={(open) => {
                        setPromoteSmeOpen(open)
                        if (!open) {
                            resetPromoteSmeDialog()
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Promote SME</DialogTitle>
                            <DialogDescription>
                                Promote {promoteSmeTarget?.name || 'this user'} to SME and assign one or more product domains now.
                            </DialogDescription>
                        </DialogHeader>

                        <form className="space-y-4" onSubmit={handlePromoteSmeSubmit}>
                            {promoteSmeError ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{promoteSmeError}</AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                                Selected domains will use the first available SME slot. If `Primary SME` is empty, this user becomes primary. Otherwise, they are assigned as backup when that slot is open.
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Assign Domains</Label>
                                    <span className="text-xs text-muted-foreground">
                                        {promoteSmeSelectedDomainIds.length} selected
                                    </span>
                                </div>

                                <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-3">
                                    {promoteSmeLoadingDomains ? (
                                        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Loading domains...
                                        </div>
                                    ) : promoteSmeDomainOptions.length === 0 ? (
                                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                                            No product domains are available yet.
                                        </div>
                                    ) : (
                                        promoteSmeDomainOptions.map(({ domain, mode, helperText, disabled }) => {
                                            const checked = promoteSmeSelectedDomainIds.includes(domain.id)

                                            return (
                                                <label
                                                    key={domain.id}
                                                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                                        disabled
                                                            ? 'cursor-not-allowed bg-muted/40 opacity-70'
                                                            : checked
                                                                ? 'border-primary bg-primary/5'
                                                                : 'hover:bg-muted/40'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1 h-4 w-4 rounded border"
                                                        disabled={disabled || promoteSmeSaving}
                                                        checked={checked}
                                                        onChange={() => {
                                                            setPromoteSmeSelectedDomainIds((prev) =>
                                                                checked
                                                                    ? prev.filter((id) => id !== domain.id)
                                                                    : [...prev, domain.id]
                                                            )
                                                        }}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-medium text-foreground">{domain.name}</span>
                                                            <Badge variant="outline">{domain.category}</Badge>
                                                            <Badge variant="outline">{domain.track}</Badge>
                                                            <Badge
                                                                className={
                                                                    mode === 'PRIMARY'
                                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                        : mode === 'BACKUP'
                                                                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                                                                            : mode === 'ALREADY_ASSIGNED'
                                                                                ? 'border-violet-200 bg-violet-50 text-violet-700'
                                                                                : 'border-slate-200 bg-slate-100 text-slate-600'
                                                                }
                                                                variant="outline"
                                                            >
                                                                {mode === 'PRIMARY'
                                                                    ? 'Primary slot'
                                                                    : mode === 'BACKUP'
                                                                        ? 'Backup slot'
                                                                        : mode === 'ALREADY_ASSIGNED'
                                                                            ? 'Already assigned'
                                                                            : 'Unavailable'}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>
                                                    </div>
                                                </label>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setPromoteSmeOpen(false)} disabled={promoteSmeSaving}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={promoteSmeSaving || promoteSmeLoadingDomains || promoteSmeSelectedDomainIds.length === 0}>
                                    {promoteSmeSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Promote SME
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

                {orphanSmesOnPage.length > 0 ? (
                    <Alert>
                        <AlertDescription className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <span>
                                {orphanSmesOnPage.length} SME{orphanSmesOnPage.length > 1 ? 's' : ''} on this page {orphanSmesOnPage.length > 1 ? 'have' : 'has'} no domain assignment.
                            </span>
                            <Button asChild size="sm" variant="outline">
                                <Link href="/admin/users/sme-scope-audit">Open SME scope audit</Link>
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : null}

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
                                                        <div className="space-y-2">
                                                            <Badge variant={user.role === 'ADMIN' ? 'default' : user.role === 'SME' ? 'outline' : 'secondary'}>
                                                                {user.role === 'ADMIN' ? 'Admin' : user.role === 'SME' ? 'SME' : 'Learner'}
                                                            </Badge>
                                                            {user.role === 'SME' ? (
                                                                user.domainAssignments.length > 0 ? (
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {user.domainAssignments.map((assignment) => (
                                                                            <Badge key={`${assignment.domainId}-${assignment.slot}`} variant="outline" className="text-xs">
                                                                                {assignment.domainName} · {assignment.slot === 'PRIMARY' ? 'Primary' : 'Backup'}
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-xs font-medium text-red-600">No domains assigned</p>
                                                                )
                                                            ) : null}
                                                        </div>
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
