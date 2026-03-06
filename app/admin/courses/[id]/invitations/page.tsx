'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    Send,
    Users,
    CheckCircle,
    XCircle,
    Search,
    UserPlus,
    Clock,
} from 'lucide-react'
import Link from 'next/link'
import type { Course, CourseInvitation, AdminUser } from '@/types'

type PageProps = {
    params: Promise<{ id: string }>
}

export default function CourseInvitationsPage({ params }: PageProps) {
    const { id: courseId } = use(params)
    const [course, setCourse] = useState<Course | null>(null)
    const [invitations, setInvitations] = useState<CourseInvitation[]>([])
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
    const [sending, setSending] = useState(false)
    const [inviting, setInviting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [courseRes, invitationsRes, usersRes] = await Promise.all([
                ApiClient.getCourse(courseId),
                ApiClient.getCourseInvitations(courseId),
                ApiClient.getUsers({ limit: 200 }),
            ])
            setCourse(courseRes.data)
            setInvitations(invitationsRes.data)
            setUsers(usersRes.data.users)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }, [courseId])

    useEffect(() => {
        loadData()
    }, [loadData])

    const invitedUserIds = new Set(invitations.map((inv) => inv.userId))

    const filteredUsers = users.filter((user) => {
        if (user.status !== 'ACTIVE') return false
        if (invitedUserIds.has(user.id)) return false
        const query = searchQuery.toLowerCase()
        return (
            !query ||
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        )
    })

    const handleInviteUsers = async () => {
        if (selectedUserIds.length === 0) return

        setInviting(true)
        setError(null)

        try {
            const response = await ApiClient.createCourseInvitations(courseId, selectedUserIds, {
                sendNotification: true,
            })
            const notified = response.data.notificationsSent ?? response.data.emailsSent ?? 0
            showSuccess(`Assigned ${response.data.invited} user(s). Notifications sent: ${notified}.`)
            setSelectedUserIds([])
            loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to assign users')
        } finally {
            setInviting(false)
        }
    }

    const handleSendNotifications = async (userIds?: string[]) => {
        setSending(true)
        setError(null)

        try {
            const response = await ApiClient.sendCourseInvitationNotifications(courseId, userIds)
            showSuccess(`Sent ${response.data.sent} notification(s)`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send notifications')
        } finally {
            setSending(false)
        }
    }

    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        )
    }

    const selectAllFiltered = () => {
        setSelectedUserIds(filteredUsers.map((u) => u.id))
    }

    const clearSelection = () => {
        setSelectedUserIds([])
    }

    const showSuccess = (message: string) => {
        setSuccessMessage(message)
        setTimeout(() => setSuccessMessage(null), 3000)
    }

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return '-'
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        )
    }

    if (!course) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Course not found</p>
                    <Link href="/admin/courses">
                        <Button className="mt-4">Back to Courses</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const isPublished = course.status === 'PUBLISHED'
    const activeCount = invitations.filter((inv) => inv.status === 'ACTIVE').length
    const completedCount = invitations.filter((inv) => inv.status === 'COMPLETED').length

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/courses">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Manage Course Invitations</h1>
                            <p className="text-muted-foreground mt-1">{course.title}</p>
                        </div>
                    </div>
                    {invitations.length > 0 && (
                        <Button onClick={() => handleSendNotifications()} disabled={sending}>
                            {sending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4 mr-2" />
                            )}
                            Send Notifications to All Assigned ({invitations.length})
                        </Button>
                    )}
                </div>

                {successMessage && (
                    <div className="p-4 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {successMessage}
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Assigned</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{invitations.length}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Active Learners</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{activeCount}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{completedCount}</div>
                        </CardContent>
                    </Card>
                </div>

                {!isPublished && (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                This course is not published yet. Publish the course before assigning and sending invitations.
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5" />
                            Assign Users
                        </CardTitle>
                        <CardDescription>
                            Select users to assign this course and send WeCom notifications.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search users..."
                                    className="pl-10"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Button variant="outline" onClick={selectAllFiltered} disabled={filteredUsers.length === 0}>
                                Select All
                            </Button>
                            <Button variant="outline" onClick={clearSelection} disabled={selectedUserIds.length === 0}>
                                Clear
                            </Button>
                        </div>

                        {selectedUserIds.length > 0 && (
                            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                                <span className="text-sm font-medium">
                                    {selectedUserIds.length} user(s) selected
                                </span>
                                <Button
                                    onClick={handleInviteUsers}
                                    disabled={inviting || !isPublished}
                                >
                                    {inviting ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Users className="h-4 w-4 mr-2" />
                                    )}
                                    Assign & Send Notifications
                                </Button>
                            </div>
                        )}

                        <div className="max-h-64 overflow-y-auto border rounded-lg">
                            {filteredUsers.map((user) => (
                                <label
                                    key={user.id}
                                    className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedUserIds.includes(user.id)}
                                        onChange={() => toggleUserSelection(user.id)}
                                        className="h-4 w-4"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{user.name}</p>
                                        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                    </div>
                                    <Badge variant="outline">{user.department || 'General'}</Badge>
                                </label>
                            ))}
                            {filteredUsers.length === 0 && (
                                <div className="p-6 text-center text-sm text-muted-foreground">
                                    No available users to assign.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Assigned Users ({invitations.length})</CardTitle>
                        <CardDescription>Users currently assigned to this course</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {invitations.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No users assigned yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {invitations.map((invitation) => (
                                    <div
                                        key={invitation.id}
                                        className="flex items-center justify-between p-3 border rounded-lg"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium truncate">{invitation.user?.name}</p>
                                                <Badge
                                                    variant={
                                                        invitation.status === 'COMPLETED'
                                                            ? 'default'
                                                            : invitation.status === 'ACTIVE'
                                                                ? 'secondary'
                                                                : 'outline'
                                                    }
                                                >
                                                    {invitation.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground truncate">{invitation.user?.email}</p>
                                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                                <span>Progress: {Math.round(invitation.progress)}%</span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    Enrolled: {formatDate(invitation.enrolledAt)}
                                                </span>
                                                <span>Last active: {formatDate(invitation.lastAccessedAt)}</span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSendNotifications([invitation.userId])}
                                            disabled={sending}
                                        >
                                            <Send className="h-4 w-4 mr-1" />
                                            Notify
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
