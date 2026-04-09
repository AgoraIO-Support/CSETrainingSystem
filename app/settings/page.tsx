'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiClient } from '@/lib/api-client'
import { Loader2 } from 'lucide-react'

export default function SettingsPage() {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const handlePasswordChange = async (event: React.FormEvent) => {
        event.preventDefault()
        setError(null)
        setSuccess(null)

        if (newPassword !== confirmPassword) {
            setError('New password and confirmation do not match')
            return
        }

        try {
            setSubmitting(true)
            await ApiClient.changePassword({
                currentPassword,
                newPassword,
            })
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setSuccess('Password updated successfully')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update password')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Settings</h1>
                    <p className="mt-1 text-muted-foreground">
                        Manage your account security and quick-access learner links.
                    </p>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Change Password</CardTitle>
                            <CardDescription>Update your account password for local sign-in.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-4" onSubmit={handlePasswordChange}>
                                <div className="space-y-2">
                                    <Label htmlFor="currentPassword">Current Password</Label>
                                    <Input
                                        id="currentPassword"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Enter current password"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newPassword">New Password</Label>
                                    <Input
                                        id="newPassword"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter new password"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                    />
                                </div>
                                {error ? (
                                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                        {error}
                                    </div>
                                ) : null}
                                {success ? (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                        {success}
                                    </div>
                                ) : null}
                                <Button type="submit" disabled={submitting}>
                                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Update Password
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Quick Links</CardTitle>
                            <CardDescription>Jump to the learner pages you will use most often.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button asChild variant="outline" className="w-full justify-between">
                                <Link href="/profile">Edit Profile</Link>
                            </Button>
                            <Button asChild variant="outline" className="w-full justify-between">
                                <Link href="/training">Open My Training</Link>
                            </Button>
                            <Button asChild variant="outline" className="w-full justify-between">
                                <Link href="/rewards">Open My Rewards</Link>
                            </Button>
                            <Button asChild variant="outline" className="w-full justify-between">
                                <Link href="/certificates">View Certificates</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
