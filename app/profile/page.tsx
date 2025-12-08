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
import { ApiClient } from '@/lib/api-client'
import type { UserProfile, UserProgressOverview } from '@/types'
import { formatDate } from '@/lib/utils'
import { Mail, Award, BookOpen, Clock, TrendingUp, Edit, Loader2, Play, Download } from 'lucide-react'

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
                                            {profile?.role === 'ADMIN' ? 'Administrator' : 'Learner'}
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
                        <TabsTrigger value="achievements">Certificates</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                    </TabsList>

                    <TabsContent value="courses" className="mt-6 space-y-6">
                        <CourseSection title="In Progress" courses={inProgressCourses} loading={overviewLoading} emptyMessage="No courses in progress yet." />
                        <CourseSection title="Completed" courses={completedCourses} loading={overviewLoading} emptyMessage="You have not completed any courses." showCompleted />
                    </TabsContent>

                    <TabsContent value="achievements" className="mt-6">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {certificates.length ? (
                                certificates.map(certificate => (
                                    <Card key={certificate.id}>
                                        <CardContent className="p-6 space-y-3">
                                            <div>
                                                <h4 className="font-semibold">{certificate.courseTitle}</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    Issued {formatDate(certificate.issueDate)}
                                                </p>
                                            </div>
                                            <Badge variant="outline">{certificate.certificateNumber}</Badge>
                                            {certificate.instructorName && (
                                                <p className="text-xs text-muted-foreground">Instructor: {certificate.instructorName}</p>
                                            )}
                                            {certificate.pdfUrl ? (
                                                <Button asChild variant="ghost" className="px-0">
                                                    <a href={certificate.pdfUrl} target="_blank" rel="noreferrer">
                                                        <Download className="h-4 w-4 mr-2" /> Download PDF
                                                    </a>
                                                </Button>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">PDF not available.</p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">Complete a course to earn your first certificate.</p>
                            )}
                        </div>
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
