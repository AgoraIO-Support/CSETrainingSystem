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
    const [continueLoading, setContinueLoading] = useState(false)
    const [continueCard, setContinueCard] = useState<null | {
        courseId: string
        courseTitle: string
        courseSlug?: string
        lessonId: string
        lessonTitle: string
        chapterTitle?: string
        nextLesson?: { id: string; title: string; chapterTitle?: string }
    }>(null)

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

    useEffect(() => {
        if (!user) return
        const stored = (() => {
            try {
                const key = `cse:lastLesson:${user?.id ?? 'anon'}`
                return localStorage.getItem(key)
            } catch {
                return null
            }
        })()
        if (!stored) return
        let parsed: any = null
        try {
            parsed = JSON.parse(stored)
        } catch {
            return
        }
        if (!parsed?.courseId || !parsed?.lessonId) return

        const loadContinueCard = async () => {
            setContinueLoading(true)
            try {
                const courseRes = await ApiClient.getCourse(parsed.courseId)
                const course = courseRes.data
                if (course?.isEnrolled === false) {
                    setContinueCard(null)
                    return
                }
                const chapters = course.chapters || []
                let nextLesson: { id: string; title: string; chapterTitle?: string } | undefined

                for (let c = 0; c < chapters.length; c++) {
                    const lessons = chapters[c].lessons || []
                    for (let l = 0; l < lessons.length; l++) {
                        if (lessons[l].id === parsed.lessonId) {
                            if (l < lessons.length - 1) {
                                nextLesson = {
                                    id: lessons[l + 1].id,
                                    title: lessons[l + 1].title,
                                    chapterTitle: chapters[c].title,
                                }
                            } else if (c < chapters.length - 1) {
                                const firstNext = chapters[c + 1].lessons?.[0]
                                if (firstNext) {
                                    nextLesson = {
                                        id: firstNext.id,
                                        title: firstNext.title,
                                        chapterTitle: chapters[c + 1].title,
                                    }
                                }
                            }
                            break
                        }
                    }
                }

                setContinueCard({
                    courseId: course.id,
                    courseTitle: course.title,
                    courseSlug: course.slug,
                    lessonId: parsed.lessonId,
                    lessonTitle: parsed.lessonTitle || 'Last lesson',
                    chapterTitle: parsed.chapterTitle,
                    nextLesson,
                })
            } catch (error) {
                console.error('Failed to load continue card:', error)
            } finally {
                setContinueLoading(false)
            }
        }

        loadContinueCard()
    }, [user])

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

                {/* Continue Learning */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle className="text-lg">Continue Learning</CardTitle>
                            <CardDescription>Pick up where you left off</CardDescription>
                        </div>
                        {continueLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {continueCard ? (
                            <>
                                <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Last watched</p>
                                    <p className="font-semibold">{continueCard.lessonTitle}</p>
                                    {continueCard.chapterTitle && (
                                        <p className="text-xs text-muted-foreground">
                                            {continueCard.courseTitle} · {continueCard.chapterTitle}
                                        </p>
                                    )}
                                </div>
                                {continueCard.nextLesson ? (
                                    <div className="space-y-1">
                                        <p className="text-sm text-muted-foreground">Next lesson</p>
                                        <p className="font-semibold">{continueCard.nextLesson.title}</p>
                                        {continueCard.nextLesson.chapterTitle && (
                                            <p className="text-xs text-muted-foreground">
                                                {continueCard.nextLesson.chapterTitle}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        You’re at the end of this course.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <Link href={`/learn/${continueCard.courseId}/${continueCard.lessonId}`}>
                                        <Button size="sm">
                                            Continue lesson
                                        </Button>
                                    </Link>
                                    <Link href={`/courses/${continueCard.courseSlug ?? continueCard.courseId}`}>
                                        <Button size="sm" variant="outline">
                                            Course home
                                        </Button>
                                    </Link>
                                    {continueCard.nextLesson && (
                                        <Link href={`/learn/${continueCard.courseId}/${continueCard.nextLesson.id}`}>
                                            <Button size="sm" variant="ghost">
                                                Go to next lesson
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <p className="text-sm text-muted-foreground">No recent lesson found.</p>
                                <Link href="/courses">
                                    <Button size="sm" variant="outline">Browse courses</Button>
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>

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
                                    <Link href={`/courses/${course.slug || course.id}`}>
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
