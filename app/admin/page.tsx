'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, BookOpen, GraduationCap, TrendingUp, Plus, ArrowUp } from 'lucide-react'
import Link from 'next/link'

export default function AdminDashboardPage() {
    // Mock admin data
    const stats = {
        totalUsers: 1250,
        activeCourses: 12,
        completedCertifications: 458,
        averageCompletionRate: 76,
    }

    const recentCourses = [
        { id: '1', title: 'Agora SDK Fundamentals', students: 450, completion: 82 },
        { id: '2', title: 'Advanced Video Calling Features', students: 320, completion: 68 },
        { id: '3', title: 'Cloud Recording with Agora', students: 280, completion: 75 },
    ]

    const recentUsers = [
        { id: '1', name: 'Alice Chen', email: 'alice@agora.io', courses: 3, joined: '2 days ago' },
        { id: '2', name: 'Bob Smith', email: 'bob@agora.io', courses: 2, joined: '5 days ago' },
        { id: '3', name: 'Carol Zhang', email: 'carol@agora.io', courses: 4, joined: '1 week ago' },
    ]

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Page Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                        <p className="text-muted-foreground mt-1">
                            Manage your training system and monitor performance
                        </p>
                    </div>
                    <div className="flex space-x-2">
                        <Link href="/admin/courses/create">
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Course
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground flex items-center mt-1">
                                <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                                <span className="text-green-500">+12%</span>
                                <span className="ml-1">from last month</span>
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.activeCourses}</div>
                            <p className="text-xs text-muted-foreground flex items-center mt-1">
                                <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                                <span className="text-green-500">+2</span>
                                <span className="ml-1">added this month</span>
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Certifications</CardTitle>
                            <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.completedCertifications}</div>
                            <p className="text-xs text-muted-foreground flex items-center mt-1">
                                <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                                <span className="text-green-500">+38</span>
                                <span className="ml-1">this month</span>
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.averageCompletionRate}%</div>
                            <p className="text-xs text-muted-foreground flex items-center mt-1">
                                <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                                <span className="text-green-500">+3%</span>
                                <span className="ml-1">from last month</span>
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Popular Courses */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Popular Courses</CardTitle>
                            <CardDescription>Most enrolled courses this month</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {recentCourses.map(course => (
                                    <div key={course.id} className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="font-medium">{course.title}</p>
                                            <div className="flex items-center space-x-4 mt-1">
                                                <span className="text-sm text-muted-foreground">
                                                    {course.students} students
                                                </span>
                                                <Badge variant="secondary" className="text-xs">
                                                    {course.completion}% completion
                                                </Badge>
                                            </div>
                                        </div>
                                        <Link href={`/admin/courses/${course.id}`}>
                                            <Button variant="ghost" size="sm">
                                                View
                                            </Button>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Users */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Users</CardTitle>
                            <CardDescription>New registrations</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {recentUsers.map(user => (
                                    <div key={user.id} className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                <span className="font-semibold text-primary">{user.name.charAt(0)}</span>
                                            </div>
                                            <div>
                                                <p className="font-medium">{user.name}</p>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium">{user.courses} courses</p>
                                            <p className="text-xs text-muted-foreground">{user.joined}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>Common administrative tasks</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                            <Link href="/admin/courses/create">
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col">
                                    <BookOpen className="h-6 w-6 mb-2" />
                                    <span>Create New Course</span>
                                </Button>
                            </Link>
                            <Link href="/admin/users">
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col">
                                    <Users className="h-6 w-6 mb-2" />
                                    <span>Manage Users</span>
                                </Button>
                            </Link>
                            <Link href="/admin/analytics">
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col">
                                    <TrendingUp className="h-6 w-6 mb-2" />
                                    <span>View Analytics</span>
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
