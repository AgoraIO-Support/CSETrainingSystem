'use client'

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ApiClient } from '@/lib/api-client'
import type { UserProfile, UserProgressOverview } from '@/types'
import { formatDate } from '@/lib/utils'
import { Mail, Award, BookOpen, Clock, TrendingUp, Edit, Loader2, Play } from 'lucide-react'

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [profileLoading, setProfileLoading] = useState(true)
    const [profileError, setProfileError] = useState<string | null>(null)

    const [overview, setOverview] = useState<UserProgressOverview | null>(null)
    const [overviewLoading, setOverviewLoading] = useState(true)
    const [overviewError, setOverviewError] = useState<string | null>(null)

    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const [form, setForm] = useState({
        name: '',
        title: '',
        department: '',
        bio: '',
        avatar: '',
    })

    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    })
    const [passwordSaving, setPasswordSaving] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const loadProfile = async () => {
            setProfileLoading(true)
            setProfileError(null)
            try {
                const response = await ApiClient.getProfile()
                if (cancelled) return
                setProfile(response.data)
            } catch (error) {
                if (cancelled) return
                setProfileError(error instanceof Error ? error.message : 'Failed to load profile')
            } finally {
                if (!cancelled) {
                    setProfileLoading(false)
                }
            }
        }
        loadProfile()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        const loadOverview = async () => {
            setOverviewLoading(true)
            setOverviewError(null)
            try {
                const response = await ApiClient.getProgressOverview()
                if (cancelled) return
                setOverview(response.data)
            } catch (error) {
                if (cancelled) return
                setOverviewError(error instanceof Error ? error.message : 'Failed to load progress overview')
            } finally {
                if (!cancelled) {
                    setOverviewLoading(false)
                }
            }
        }
        loadOverview()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (!profile) return
        setForm({
            name: profile.name,
            title: profile.title ?? '',
            department: profile.department ?? '',
            bio: profile.bio ?? '',
            avatar: profile.avatar ?? '',
        })
    }, [profile])

    const inProgressCourses = useMemo(
        () => (overview?.courses ?? []).filter(course => course.status !== 'COMPLETED'),
        [overview]
    )

    const completedCourses = useMemo(
        () => (overview?.courses ?? []).filter(course => course.status === 'COMPLETED'),
        [overview]
    )

    const certificates = overview?.certificates ?? []
    const activity = overview?.recentActivity ?? []

    const handleChange =
        (field: keyof typeof form) =>
        (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value
            setForm(prev => ({ ...prev, [field]: value }))
        }

    const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!form.name.trim()) {
            setSaveError('Name is required')
            return
        }
        setSaving(true)
        setSaveError(null)
        try {
            const payload = {
                name: form.name.trim(),
                title: form.title.trim() || null,
                department: form.department.trim() || null,
                bio: form.bio.trim() || null,
                avatar: form.avatar.trim() || null,
            }
            const response = await ApiClient.updateProfile(payload)
            setProfile(response.data)
            setEditing(false)
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to update profile')
        } finally {
            setSaving(false)
        }
    }

    const handlePasswordSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setPasswordError(null)
        setPasswordSuccess(null)

        if (passwordForm.newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters')
            return
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('Passwords do not match')
            return
        }

        setPasswordSaving(true)
        try {
            await ApiClient.changePassword({
                currentPassword: passwordForm.currentPassword.trim() ? passwordForm.currentPassword : undefined,
                newPassword: passwordForm.newPassword,
            })
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
            setPasswordSuccess('Password updated')
        } catch (error) {
            setPasswordError(error instanceof Error ? error.message : 'Failed to update password')
        } finally {
            setPasswordSaving(false)
        }
    }

    const isLoading = profileLoading || overviewLoading

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <Card>
                    <CardContent className="p-8">
                        <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-6">
                                <Avatar className="h-24 w-24">
                                    {profile?.avatar ? <AvatarImage src={profile.avatar} alt={profile.name} /> : null}
                                    <AvatarFallback className="text-2xl">
                                        {profile?.name ? profile.name.charAt(0) : '?'}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h1 className="text-3xl font-bold mb-2">
                                        {profileLoading ? 'Loading...' : profile?.name ?? 'Unnamed user'}
                                    </h1>
                                    <div className="flex items-center text-muted-foreground mb-4">
                                        <Mail className="h-4 w-4 mr-2" />
                                        {profile?.email ?? '—'}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                        <Badge variant="secondary" className="text-sm">
                                            {profile?.role === 'ADMIN' ? 'Administrator' : profile?.role === 'SME' ? 'SME' : 'Learner'}
                                        </Badge>
                                        {profile?.createdAt && (
                                            <span>Member since {formatDate(profile.createdAt)}</span>
                                        )}
                                        {profile?.title && <span>• {profile.title}</span>}
                                        {profile?.department && <span>• {profile.department}</span>}
                                    </div>
                                </div>
                            </div>
                            <Button variant="outline" onClick={() => setEditing(current => !current)} disabled={profileLoading}>
                                <Edit className="h-4 w-4 mr-2" />
                                {editing ? 'Cancel' : 'Edit Profile'}
                            </Button>
                        </div>

                        {editing && (
                            <form className="mt-8 space-y-4 border-t pt-6" onSubmit={handleProfileSave}>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-sm font-medium">Name</label>
                                        <Input value={form.name} onChange={handleChange('name')} required className="mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Title</label>
                                        <Input value={form.title} onChange={handleChange('title')} className="mt-1" placeholder="e.g. Senior Engineer" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Department</label>
                                        <Input value={form.department} onChange={handleChange('department')} className="mt-1" placeholder="e.g. Training" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Avatar URL</label>
                                        <Input value={form.avatar} onChange={handleChange('avatar')} className="mt-1" placeholder="https://" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Bio</label>
                                    <Textarea value={form.bio} onChange={handleChange('bio')} className="mt-1" rows={4} placeholder="Tell others about yourself" />
                                </div>
                                {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                                <div className="flex items-center gap-3">
                                    <Button type="submit" disabled={saving}>
                                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        )}

                        {profileError && !editing && (
                            <p className="text-sm text-destructive mt-4">{profileError}</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Security</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4 max-w-lg" onSubmit={handlePasswordSave}>
                            {passwordError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{passwordError}</AlertDescription>
                                </Alert>
                            )}
                            {passwordSuccess && !passwordError && (
                                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                                    <AlertDescription>{passwordSuccess}</AlertDescription>
                                </Alert>
                            )}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium">Current password</label>
                                    <Input
                                        type="password"
                                        value={passwordForm.currentPassword}
                                        onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                        autoComplete="current-password"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">New password</label>
                                    <Input
                                        type="password"
                                        value={passwordForm.newPassword}
                                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Confirm new password</label>
                                    <Input
                                        type="password"
                                        value={passwordForm.confirmPassword}
                                        onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Button type="submit" disabled={passwordSaving}>
                                    {passwordSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Update password
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-4">
                    <StatCard
                        title="Courses Enrolled"
                        value={overview?.stats.totalEnrolled?.toString() ?? '0'}
                        helper={`${overview?.stats.completedCourses ?? 0} completed`}
                        icon={BookOpen}
                    />
                    <StatCard
                        title="Learning Hours"
                        value={`${(overview?.stats.hoursLearned ?? 0).toFixed(1)}h`}
                        helper="Total time spent"
                        icon={Clock}
                    />
                    <StatCard
                        title="Average Progress"
                        value={`${overview?.stats.avgProgress ?? 0}%`}
                        helper="Across all courses"
                        icon={TrendingUp}
                    />
                    <StatCard
                        title="Certificates"
                        value={certificates.length.toString()}
                        helper="Issued certificates"
                        icon={Award}
                    />
                </div>

                <Tabs defaultValue="courses" className="w-full">
                    <TabsList>
                        <TabsTrigger value="courses">My Courses</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                    </TabsList>

                    <TabsContent value="courses" className="mt-6 space-y-6">
                        <CourseSection title="In Progress" courses={inProgressCourses} loading={overviewLoading} emptyMessage="No courses in progress yet." />
                        <CourseSection title="Completed" courses={completedCourses} loading={overviewLoading} emptyMessage="You have not completed any courses." showCompleted />
                    </TabsContent>

                    <TabsContent value="activity" className="mt-6">
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                            {activity.length ? (
                                activity.map(entry => (
                                    <Card key={entry.id}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-semibold">{entry.lessonTitle}</p>
                                                    <p className="text-xs text-muted-foreground">{entry.courseTitle}</p>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{formatDate(entry.updatedAt)}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs mt-2">
                                                <span className="flex items-center gap-1">
                                                    <Play className="h-3 w-3" /> {Math.round(entry.watchedDuration / 60)} min watched
                                                </span>
                                                <Badge variant={entry.completed ? 'default' : 'outline'}>
                                                    {entry.completed ? 'Completed' : 'In progress'}
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : overviewLoading ? (
                                <p className="text-sm text-muted-foreground">Loading activity...</p>
                            ) : (
                                <p className="text-sm text-muted-foreground">No recent activity found.</p>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>

                {(profileError || overviewError) && !isLoading && (
                    <Card>
                        <CardContent className="p-4 text-sm text-destructive">
                            {profileError && <p>{profileError}</p>}
                            {overviewError && <p>{overviewError}</p>}
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    )
}

interface StatCardProps {
    title: string
    value: string
    helper: string
    icon: React.ComponentType<{ className?: string }>
}

function StatCard({ title, value, helper, icon: Icon }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{helper}</p>
            </CardContent>
        </Card>
    )
}

interface CourseSectionProps {
    title: string
    courses: UserProgressOverview['courses']
    loading: boolean
    emptyMessage: string
    showCompleted?: boolean
}

function CourseSection({ title, courses, loading, emptyMessage, showCompleted = false }: CourseSectionProps) {
    return (
        <div>
            <h3 className="text-xl font-semibold mb-4">{title}</h3>
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading courses...
                </div>
            ) : courses.length ? (
                <div className="space-y-4">
                    {courses.map(course => (
                        <Card key={course.courseId}>
                            <CardContent className="p-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h4 className="font-semibold mb-1">{course.title}</h4>
                                        <p className="text-sm text-muted-foreground">
                                            {course.category} · {course.level}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge variant={course.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                                {course.status === 'COMPLETED' ? 'Completed' : 'In progress'}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                Last accessed {course.lastAccessedAt ? formatDate(course.lastAccessedAt) : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-64">
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span>Progress</span>
                                            <span className="font-medium">{course.progress}%</span>
                                        </div>
                                        <Progress value={course.progress} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            )}
            {!showCompleted && courses.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground mt-2">
                    Start a course from the catalog to see it listed here.
                </p>
            )}
        </div>
    )
}
