'use client'

import { Suspense, useState, useEffect, use, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
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
    Mail,
    Users,
    CheckCircle,
    XCircle,
    Search,
    UserPlus,
    Clock,
    Eye,
} from 'lucide-react'
import Link from 'next/link'
import type { Exam, ExamInvitation, AdminUser } from '@/types'

type PageProps = {
    params: Promise<{ id: string }>
}

function ExamInvitationsPageContent({ params }: PageProps) {
    const { id: examId } = use(params)
    const searchParams = useSearchParams()
    const isSmeMode = searchParams.get('sme') === '1'
    const [exam, setExam] = useState<Exam | null>(null)
    const [invitations, setInvitations] = useState<ExamInvitation[]>([])
    const [users, setUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
    const [sending, setSending] = useState(false)
    const [inviting, setInviting] = useState(false)
    const [publishSendingNotifications, setPublishSendingNotifications] = useState(true)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [examRes, invitationsRes, usersRes] = await Promise.all([
                ApiClient.getAdminExam(examId),
                ApiClient.getExamInvitations(examId),
                ApiClient.getUsers({ limit: 200 }),
            ])
            setExam(examRes.data)
            setInvitations(invitationsRes.data)
            setUsers(usersRes.data.users)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }, [examId])

    useEffect(() => {
        loadData()
    }, [loadData])

    const invitedUserIds = new Set(invitations.map(inv => inv.userId))

    const filteredUsers = users.filter(user => {
        if (invitedUserIds.has(user.id)) return false
        const query = searchQuery.toLowerCase()
        return !query ||
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
    })

    const handleInviteUsers = async () => {
        if (selectedUserIds.length === 0) return

        setInviting(true)
        setError(null)

        try {
            const response = await ApiClient.createExamInvitations(examId, selectedUserIds, { sendNotification: true })
            const notified = response.data.notificationsSent ?? response.data.emailsSent ?? 0
            showSuccess(`Invited ${response.data.invited} users. Notifications sent: ${notified}.`)
            setSelectedUserIds([])
            loadData() // Refresh invitations list
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to invite users')
        } finally {
            setInviting(false)
        }
    }

    const handleSendNotifications = async (userIds?: string[]) => {
        setSending(true)
        setError(null)

        try {
            const response = await ApiClient.sendExamInvitationNotifications(examId, userIds)
            showSuccess(`Sent ${response.data.sent} notification(s)`)
            loadData() // Refresh to update notification status
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send notifications')
        } finally {
            setSending(false)
        }
    }

    const handlePublish = async () => {
        if (!exam) return

        setInviting(true)
        setError(null)

        try {
            const response = await ApiClient.publishExam(examId, {
                userIds: selectedUserIds,
                sendNotification: publishSendingNotifications,
            })
            setExam(response.data)
            const sent = response.meta?.notificationsSent ?? response.meta?.emailsSent ?? 0
            if (selectedUserIds.length > 0) {
                showSuccess(
                    `Exam published. Assigned ${response.meta?.invited ?? selectedUserIds.length} user(s).` +
                        (publishSendingNotifications ? ` Notifications sent: ${sent}.` : '')
                )
            } else {
                showSuccess(
                    `Exam published. ${response.meta?.existingInvitations ?? invitations.length} existing invitation(s) remain active.`
                )
            }
            setSelectedUserIds([])
            loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to publish exam')
        } finally {
            setInviting(false)
        }
    }

    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        )
    }

    const selectAllFiltered = () => {
        setSelectedUserIds(filteredUsers.map(u => u.id))
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

    if (!exam) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Exam not found</p>
                    <Link href={isSmeMode ? '/sme/training-ops/exams' : '/admin/exams'}>
                        <Button className="mt-4">Back to Exams</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    const pendingNotifications = invitations.filter(inv => !inv.emailSentAt)
    const isPublished = exam.status === 'PUBLISHED'
    const isApproved = exam.status === 'APPROVED'
    const canPublishExistingInvitations = !isPublished && isApproved && invitations.length > 0

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={isSmeMode ? '/sme/training-ops/exams' : '/admin/exams'}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Manage Invitations</h1>
                            <p className="text-muted-foreground mt-1">{exam.title}</p>
                        </div>
                    </div>
                    {pendingNotifications.length > 0 && (
                        <Button onClick={() => handleSendNotifications()} disabled={sending}>
                            {sending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Mail className="h-4 w-4 mr-2" />
                            )}
                            Send All Pending Notifications ({pendingNotifications.length})
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
                            <CardTitle className="text-sm font-medium">Total Invitations</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{invitations.length}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Notifications Sent</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {invitations.filter(inv => inv.emailSentAt).length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Viewed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {invitations.filter(inv => inv.viewed).length}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Publish / Invite Users */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5" />
                            {isPublished ? 'Invite Users' : 'Publish & Assign Users'}
                        </CardTitle>
                        <CardDescription>
                            {isPublished
                                ? 'Select users to invite to this exam'
                                : isApproved
                                    ? 'Select users who must take this exam, then publish'
                                    : 'Approve the exam first, then assign users and publish'}
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

                        {!isPublished && (
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                                <span className="text-sm text-muted-foreground">
                                    {canPublishExistingInvitations
                                        ? 'Publish will keep current invitations active. You can also select additional users below.'
                                        : 'Publish will assign the selected users.'}
                                </span>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={publishSendingNotifications}
                                        onChange={(e) => setPublishSendingNotifications(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    Send WeCom notifications now
                                </label>
                            </div>
                        )}

                        {(selectedUserIds.length > 0 || canPublishExistingInvitations) && (
                            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                                <span className="text-sm font-medium">
                                    {selectedUserIds.length > 0
                                        ? `${selectedUserIds.length} user(s) selected`
                                        : `${invitations.length} existing invitation(s) ready to republish`}
                                </span>
                                <Button
                                    onClick={isPublished ? handleInviteUsers : handlePublish}
                                    disabled={inviting || (!isPublished && !isApproved)}
                                >
                                    {inviting ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4 mr-2" />
                                    )}
                                    {isPublished ? 'Invite Selected' : 'Publish Exam'}
                                </Button>
                            </div>
                        )}

                        <div className="max-h-64 overflow-y-auto space-y-2">
                            {filteredUsers.length === 0 ? (
                                <p className="text-center text-sm text-muted-foreground py-4">
                                    {searchQuery ? 'No users match your search' : 'All users have been invited'}
                                </p>
                            ) : (
                                filteredUsers.slice(0, 50).map(user => (
                                    <div
                                        key={user.id}
                                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                                            selectedUserIds.includes(user.id)
                                                ? 'bg-primary/10 border-primary'
                                                : 'hover:bg-accent'
                                        }`}
                                        onClick={() => toggleUserSelection(user.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.includes(user.id)}
                                                onChange={() => {}}
                                                className="h-4 w-4"
                                            />
                                            <div>
                                                <p className="font-medium">{user.name}</p>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                            </div>
                                        </div>
                                        {user.department && (
                                            <Badge variant="outline">{user.department}</Badge>
                                        )}
                                    </div>
                                ))
                            )}
                            {filteredUsers.length > 50 && (
                                <p className="text-center text-sm text-muted-foreground py-2">
                                    Showing 50 of {filteredUsers.length} users. Use search to find more.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Current Invitations */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Current Invitations ({invitations.length})
                        </CardTitle>
                        <CardDescription>Users who have been invited to this exam</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {invitations.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">
                                No users have been invited yet
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {invitations.map(invitation => (
                                    <div
                                        key={invitation.id}
                                        className="flex items-center justify-between p-3 border rounded-lg"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <p className="font-medium">{invitation.user?.name}</p>
                                                <p className="text-sm text-muted-foreground">{invitation.user?.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                {invitation.emailSentAt ? (
                                                    <span className="flex items-center gap-1 text-green-600">
                                                        <Mail className="h-4 w-4" />
                                                        Notified {formatDate(invitation.emailSentAt)}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-4 w-4" />
                                                        Notification pending
                                                    </span>
                                                )}
                                            </div>
                                            {invitation.viewed && (
                                                <span className="flex items-center gap-1 text-sm text-blue-600">
                                                    <Eye className="h-4 w-4" />
                                                    Viewed
                                                </span>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleSendNotifications([invitation.userId])}
                                                disabled={sending}
                                            >
                                                {sending ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Send className="h-4 w-4 mr-1" />
                                                        {invitation.emailSentAt ? 'Resend' : 'Send'}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
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

export default function ExamInvitationsPage({ params }: PageProps) {
    return (
        <Suspense fallback={null}>
            <ExamInvitationsPageContent params={params} />
        </Suspense>
    )
}
