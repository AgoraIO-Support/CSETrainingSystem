'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ApiClient } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ArrowRight, Clock, BookOpen, Award, Loader2 } from 'lucide-react'

export default function HomePage() {
    const router = useRouter()
    const [user, setUser] = useState<any>(null)
    const [courses, setCourses] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [redirecting, setRedirecting] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userRes, coursesRes] = await Promise.all([
                    ApiClient.getMe(),
                    ApiClient.getCourses()
                ])
                setUser(userRes.data)
                setCourses(coursesRes.data.courses)
                if (userRes.data.role === 'ADMIN') {
                    setRedirecting(true)
                    router.replace('/admin')
                    return
                }
            } catch (error) {
                console.error('Failed to fetch data:', error)
                router.push('/login')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [router])

    if (loading || redirecting) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!user) return null

    // Filter courses (mock logic for now since backend doesn't return enrollment status fully yet)
    // In a real app, the backend would return "enrolledCourses" specifically
    const enrolledCourses = courses.slice(0, 2)
    const recommendedCourses = courses.slice(2, 5)

    return (
        <DashboardLayout initialUser={user}>
            <div className="space-y-6">
                {/* Welcome Banner */}
                <div className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-800 p-8 text-white">
                    <h1 className="text-3xl font-bold mb-2">
                        Welcome back, {(user.name || 'Teammate').split(' ')[0]}! 👋
                    </h1>
                    <p className="text-blue-100 text-lg">
                        Continue your learning journey and master new skills
                    </p>
                </div>

                {/* Stats Overview */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Enrolled Courses</CardTitle>
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{enrolledCourses.length}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Active courses
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Role</CardTitle>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{user.role}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                System Access
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Status</CardTitle>
                            <Award className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">Active</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Account Status
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Available Courses */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold">Available Courses</h2>
                        <Link href="/courses">
                            <Button variant="ghost" size="sm">
                                View All
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        {courses.map(course => (
                            <Card key={course.id} className="hover:shadow-lg transition-shadow">
                                <div className="aspect-video relative overflow-hidden rounded-t-lg bg-slate-100">
                                    <img
                                        src={
                                            course.thumbnail ||
                                            'https://placehold.co/800x450/0f172a/ffffff?text=Course'
                                        }
                                        alt={course.title}
                                        className="object-cover w-full h-full"
                                    />
                                </div>
                                <CardHeader>
                                    <Badge variant="secondary" className="w-fit mb-2">
                                        {course.category}
                                    </Badge>
                                    <CardTitle className="text-lg line-clamp-2">{course.title}</CardTitle>
                                    <CardDescription className="line-clamp-2">
                                        {course.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between text-sm mb-4">
                                        <span className="text-muted-foreground">
                                            {Math.floor(course.duration / 3600)}h {Math.floor((course.duration % 3600) / 60)}m
                                        </span>
                                        <span className="font-medium">⭐ {course.rating}</span>
                                    </div>
                                    <Link href={`/courses/${course.id}`}>
                                        <Button variant="outline" className="w-full">
                                            View Course
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
