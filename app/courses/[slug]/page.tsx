'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { notFound } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'
import { CourseOutline } from '@/components/course/course-outline'
import { InstructorCard } from '@/components/course/instructor-card'
import { ApiClient } from '@/lib/api-client'
import type { Course } from '@/types'
import {
    Clock,
    Users,
    Star,
    BookOpen,
    Play,
    Award,
    Loader2,
    Paperclip,
} from 'lucide-react'

type CourseDetail = Course & {
    isEnrolled: boolean
    progress: number
}

const formatLevelLabel = (level?: string) => {
    if (!level) return 'All Levels'
    return level
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

export default function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params)
    const [course, setCourse] = useState<CourseDetail | null>(null)
    const [enrolled, setEnrolled] = useState(false)
    const [enrollLoading, setEnrollLoading] = useState(false)
    const [enrollError, setEnrollError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const loadCourse = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await ApiClient.getCourse(slug)
                if (!cancelled) {
                    setCourse(response.data)
                    setEnrolled(response.data.isEnrolled)
                }
            } catch (err) {
                if (!cancelled) {
                    const message = err instanceof Error ? err.message : 'Failed to load course'
                    if (message.toLowerCase().includes('not found')) {
                        setError(null)
                        setCourse(null)
                    } else {
                        setError(message)
                    }
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadCourse()
        return () => {
            cancelled = true
        }
    }, [slug])

    const firstLesson = course?.chapters?.[0]?.lessons?.[0]
    const totalLessons = useMemo(() => {
        if (!course?.chapters) return 0
        return course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)
    }, [course])

    if (!loading && !course && !error) {
        notFound()
    }

    const durationLabel = course
        ? `${Math.floor(course.duration / 3600)}h ${Math.floor((course.duration % 3600) / 60)}m`
        : ''

    const levelLabel = formatLevelLabel(course?.level)

    const handleEnroll = async () => {
        if (enrollLoading) return

        setEnrollError(null)
        setEnrollLoading(true)

        try {
            // Enrollment requires the course UUID
            if (!course?.id) throw new Error('Missing course id')

            await ApiClient.enrollInCourse(course.id)
            setEnrolled(true)
            setCourse(prev => (prev ? { ...prev, isEnrolled: true } : prev))
        } catch (err) {
            setEnrollError(err instanceof Error ? err.message : 'Failed to enroll in course')
        } finally {
            setEnrollLoading(false)
        }
    }

    return (
        <DashboardLayout>
            {loading ? (
                <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-[50vh] space-y-3 text-center">
                    <p className="text-lg font-semibold">Unable to load course</p>
                    <p className="text-muted-foreground">{error}</p>
                </div>
            ) : course ? (
                <div className="space-y-6">
                    <div className="relative rounded-xl overflow-hidden">
                        <div className="absolute inset-0">
                            <img
                                src={
                                    course.thumbnail ||
                                    'https://placehold.co/1200x675/0f172a/ffffff?text=Course'
                                }
                                alt={course.title}
                                className="w-full h-full object-cover opacity-20 blur-sm"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/80" />
                        </div>
                        <div className="relative p-8 md:p-12 space-y-6">
                            <div className="flex items-center space-x-2">
                                <Badge variant="secondary">{course.category}</Badge>
                                <Badge variant="outline">{levelLabel}</Badge>
                            </div>
                            <div>
                                <h1 className="text-4xl font-bold mb-4">{course.title}</h1>
                                <p className="text-lg text-muted-foreground max-w-3xl">
                                    {course.description}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-6 text-sm">
                                <div className="flex items-center">
                                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400 mr-2" />
                                    <span className="font-semibold">{course.rating}</span>
                                    <span className="text-muted-foreground ml-1">
                                        ({course.reviewCount} reviews)
                                    </span>
                                </div>
                                <div className="flex items-center">
                                    <Users className="h-5 w-5 mr-2 text-muted-foreground" />
                                    <span>{course.enrolledCount.toLocaleString()} students</span>
                                </div>
                                <div className="flex items-center">
                                    <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
                                    <span>{durationLabel}</span>
                                </div>
                                <div className="flex items-center">
                                    <BookOpen className="h-5 w-5 mr-2 text-muted-foreground" />
                                    <span>{totalLessons} lessons</span>
                                </div>
                            </div>
                            {enrollError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{enrollError}</AlertDescription>
                                </Alert>
                            )}
                            {enrolled ? (
                                <div className="space-y-4 max-w-md">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span>Your Progress</span>
                                            <span className="font-medium">
                                                {Math.round(course.progress)}%
                                            </span>
                                        </div>
                                    </div>
                                    <Progress value={course.progress} className="h-2" />
                                    {firstLesson && (
                                        <Button size="lg" className="w-full md:w-auto" asChild>
                                            <a href={`/learn/${course.id}/${firstLesson.id}`}>
                                                <Play className="mr-2 h-5 w-5" />
                                                {course.progress > 0 ? 'Continue Learning' : 'Start Course'}
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <Button size="lg" onClick={handleEnroll} disabled={enrollLoading}>
                                    {enrollLoading ? 'Enrolling...' : 'Enroll Now - Free'}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-6">
                            <Tabs defaultValue="overview" className="w-full">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
                                    <TabsTrigger value="reviews">Reviews</TabsTrigger>
                                </TabsList>
                                <TabsContent value="overview" className="space-y-4 mt-6">
                                    <Card>
                                        <CardContent className="p-6">
                                            <h3 className="text-xl font-bold mb-4">What you'll learn</h3>
                                            {course.learningOutcomes && course.learningOutcomes.length > 0 ? (
                                                <ul className="space-y-3">
                                                    {course.learningOutcomes.map((item, idx) => (
                                                        <li key={`outcome-${idx}-${item.substring(0, 20)}`} className="flex items-start">
                                                            <Award className="h-5 w-5 mr-3 text-primary flex-shrink-0 mt-0.5" />
                                                            <span>{item}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    Learning objectives will be added soon.
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-6">
                                            <h3 className="text-xl font-bold mb-4">Requirements</h3>
                                            {course.requirements && course.requirements.length > 0 ? (
                                                <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                                                    {course.requirements.map((item, idx) => (
                                                        <li key={`requirement-${idx}-${item.substring(0, 20)}`}>{item}</li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    No prerequisites listed.
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-6">
                                            <h3 className="text-xl font-bold mb-4">Tags</h3>
                                            <div className="flex flex-wrap gap-2">
                                                {course.tags.map(tag => (
                                                    <Badge key={tag} variant="secondary">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                                <TabsContent value="curriculum" className="mt-6">
                                    {course.chapters ? (
                                        <CourseOutline chapters={course.chapters} courseId={course.id} />
                                    ) : (
                                        <Card>
                                            <CardContent className="p-6 text-muted-foreground">
                                                Curriculum coming soon.
                                            </CardContent>
                                        </Card>
                                    )}
                                </TabsContent>
                                <TabsContent value="reviews" className="mt-6">
                                    <Card>
                                        <CardContent className="p-6">
                                            <div className="text-center py-8">
                                                <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                                <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
                                                <p className="text-muted-foreground">
                                                    Be the first to review this course
                                                </p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>
                        </div>
                        <div className="space-y-6">
                            <InstructorCard instructor={course.instructor} />
                            {course?.assets && course.assets.length > 0 && (
                                <Card>
                                    <CardContent className="p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-semibold">Course Materials</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    Access downloadable reference files and recordings.
                                                </p>
                                            </div>
                                            <Button asChild size="sm">
                                                <Link href={`/courses/${course.slug || course.id}/materials`}>
                                                    Open Library
                                                </Link>
                                            </Button>
                                        </div>
                                        <ul className="space-y-1 text-sm text-muted-foreground">
                                            {course.assets.slice(0, 3).map((asset, idx) => (
                                                <li key={`${asset.id}-${idx}`} className="flex items-center gap-2">
                                                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                                                    <span className="truncate">{asset.title}</span>
                                                </li>
                                            ))}
                                            {course.assets.length > 3 && (
                                                <li className="text-xs text-muted-foreground">
                                                    +{course.assets.length - 3} more items
                                                </li>
                                            )}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                            <Card>
                                <CardContent className="p-6">
                                    <h4 className="font-semibold mb-4">This course includes:</h4>
                                    <ul className="space-y-3 text-sm">
                                        <li className="flex items-center">
                                            <Play className="h-4 w-4 mr-3 text-primary" />
                                            <span>{durationLabel} of video content</span>
                                        </li>
                                        <li className="flex items-center">
                                            <BookOpen className="h-4 w-4 mr-3 text-primary" />
                                            <span>{totalLessons} lessons</span>
                                        </li>
                                        <li className="flex items-center">
                                            <Award className="h-4 w-4 mr-3 text-primary" />
                                            <span>Certificate of completion</span>
                                        </li>
                                        <li className="flex items-center">
                                            <Clock className="h-4 w-4 mr-3 text-primary" />
                                            <span>Lifetime access</span>
                                        </li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            ) : null}
        </DashboardLayout>
    )
}
