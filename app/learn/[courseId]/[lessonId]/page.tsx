'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VideoPlayer } from '@/components/video/video-player'
import { TranscriptPanel } from '@/components/video/transcript-panel'
import { AIChatPanel } from '@/components/ai/ai-chat-panel'
import { CourseOutline } from '@/components/course/course-outline'
import { ApiClient } from '@/lib/api-client'
import type { Course, Lesson, LessonProgress } from '@/types'
import {
    ChevronLeft,
    ChevronRight,
    BookOpen,
    CheckCircle,
    Home,
    Loader2,
    AlertTriangle,
} from 'lucide-react'

type CourseDetail = Course & {
    isEnrolled: boolean
    progress: number
}

export default function LessonPage({
    params,
}: {
    params: Promise<{ courseId: string; lessonId: string }>
}) {
    const { courseId, lessonId } = use(params)
    const router = useRouter()
    const [course, setCourse] = useState<CourseDetail | null>(null)
    const [lesson, setLesson] = useState<Lesson | null>(null)
    const [currentTime, setCurrentTime] = useState(0)
    const [lessonCompleted, setLessonCompleted] = useState(false)
    const [initialTimestamp, setInitialTimestamp] = useState(0)
    const [lessonProgressMap, setLessonProgressMap] = useState<Record<string, LessonProgress>>({})
    const [loading, setLoading] = useState(true)
    const [progressLoading, setProgressLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [progressError, setProgressError] = useState<string | null>(null)

    const syncThrottleRef = useRef(0)
    const maxWatchedRef = useRef(0)

    useEffect(() => {
        let cancelled = false
        const loadCourse = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await ApiClient.getCourse(courseId)
                if (cancelled) return
                setCourse(response.data)
                const locatedLesson = response.data.chapters
                    ?.flatMap(chapter => chapter.lessons)
                    .find(lessonItem => lessonItem.id === lessonId)
                if (!locatedLesson) {
                    setError('Lesson not found in this course')
                } else {
                    setLesson(locatedLesson)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load lesson')
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
    }, [courseId, lessonId])

    useEffect(() => {
        if (!course || !lesson) return

        let cancelled = false
        const loadProgress = async () => {
            setProgressLoading(true)
            setProgressError(null)
            try {
                const response = await ApiClient.getCourseProgress(course.id)
                if (cancelled) return
                const map: Record<string, LessonProgress> = {}
                response.data.lessonProgress.forEach(entry => {
                    map[entry.lessonId] = entry
                })
                setLessonProgressMap(map)
                const currentLessonProgress = map[lesson.id]
                if (currentLessonProgress) {
                    setLessonCompleted(currentLessonProgress.completed)
                    setInitialTimestamp(currentLessonProgress.lastTimestamp || 0)
                    maxWatchedRef.current = currentLessonProgress.watchedDuration || 0
                } else {
                    setLessonCompleted(false)
                    setInitialTimestamp(0)
                    maxWatchedRef.current = 0
                }
            } catch (err) {
                if (!cancelled) {
                    setProgressError(err instanceof Error ? err.message : 'Unable to load progress')
                }
            } finally {
                if (!cancelled) {
                    setProgressLoading(false)
                }
            }
        }

        loadProgress()
        return () => {
            cancelled = true
        }
    }, [course, lesson])

    const completedLessons = useMemo(() => {
        return new Set(
            Object.entries(lessonProgressMap)
                .filter(([, progress]) => progress.completed)
                .map(([lessonId]) => lessonId)
        )
    }, [lessonProgressMap])

    const findAdjacentLessons = useCallback(() => {
        if (!course?.chapters || !lesson) return { prevLesson: null, nextLesson: null }
        const chapters = course.chapters
        let previous: Lesson | null = null
        let next: Lesson | null = null

        for (let c = 0; c < chapters.length; c++) {
            const lessons = chapters[c].lessons
            for (let l = 0; l < lessons.length; l++) {
                if (lessons[l].id === lesson.id) {
                    if (l > 0) {
                        previous = lessons[l - 1]
                    } else if (c > 0) {
                        const prevChapterLessons = chapters[c - 1].lessons
                        previous = prevChapterLessons[prevChapterLessons.length - 1]
                    }

                    if (l < lessons.length - 1) {
                        next = lessons[l + 1]
                    } else if (c < chapters.length - 1) {
                        next = chapters[c + 1].lessons[0]
                    }
                    return { prevLesson: previous, nextLesson: next }
                }
            }
        }

        return { prevLesson: previous, nextLesson: next }
    }, [course?.chapters, lesson])

    const { prevLesson, nextLesson } = findAdjacentLessons()

    const syncProgress = useCallback(
        async (timestamp: number, opts?: { force?: boolean; completed?: boolean }) => {
            if (!lesson || progressLoading || progressError) return

            maxWatchedRef.current = Math.max(maxWatchedRef.current, timestamp)
            const secondsSinceLastSync = Math.abs(timestamp - syncThrottleRef.current)

            if (!opts?.force && secondsSinceLastSync < 15 && !lessonCompleted) {
                return
            }

            syncThrottleRef.current = timestamp

            try {
                await ApiClient.updateLessonProgress(lesson.id, {
                    watchedDuration: Math.round(maxWatchedRef.current),
                    lastTimestamp: Math.round(timestamp),
                    completed: opts?.completed ?? lessonCompleted,
                })
                setLessonProgressMap(prev => ({
                    ...prev,
                    [lesson.id]: {
                        lessonId: lesson.id,
                        watchedDuration: Math.round(maxWatchedRef.current),
                        lastTimestamp: Math.round(timestamp),
                        completed: opts?.completed ?? lessonCompleted,
                    },
                }))
            } catch (err) {
                console.error('Failed to sync progress', err)
            }
        },
        [lesson, lessonCompleted, progressError, progressLoading]
    )

    useEffect(() => {
        if (!lesson || progressLoading) return
        if (currentTime === 0) return
        syncProgress(currentTime)
    }, [currentTime, lesson, progressLoading, syncProgress])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error || !course || !lesson) {
        return (
            <div className="flex h-screen flex-col items-center justify-center space-y-4 text-center">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <p className="text-lg font-semibold">{error ?? 'Lesson not found'}</p>
                <Button variant="outline" onClick={() => router.push(`/courses/${courseId}`)}>
                    Back to Course
                </Button>
            </div>
        )
    }

    const handleMarkComplete = async () => {
        setLessonCompleted(true)
        await syncProgress(lesson.duration || currentTime, { force: true, completed: true })
    }

    return (
        <div className="h-screen flex flex-col bg-background">
            <div className="border-b bg-card">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-4">
                        <Link href="/">
                            <Button variant="ghost" size="icon">
                                <Home className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="font-semibold text-lg line-clamp-1">{lesson.title}</h1>
                            <p className="text-sm text-muted-foreground">{course.title}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="hidden md:flex items-center space-x-2">
                            <span className="text-sm text-muted-foreground">Course Progress:</span>
                            <Progress value={course.progress} className="w-32" />
                            <span className="text-sm font-medium">{Math.round(course.progress)}%</span>
                        </div>
                        <Link href={`/courses/${courseId}`}>
                            <Button variant="outline" size="sm">
                                <BookOpen className="h-4 w-4 mr-2" />
                                Course Outline
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="h-full grid lg:grid-cols-[1fr,400px] gap-0">
                    <div className="flex flex-col overflow-y-auto">
                        <div className="p-6 space-y-6">
                            {progressError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{progressError}</AlertDescription>
                                </Alert>
                            )}

                            <div>
                                <VideoPlayer
                                    videoUrl={lesson.videoUrl || '/videos/sample.mp4'}
                                    subtitleUrl={lesson.subtitleUrl}
                                    onTimeUpdate={setCurrentTime}
                                    initialTime={initialTimestamp}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold">{lesson.title}</h2>
                                    <p className="text-muted-foreground mt-1">
                                        {course.chapters?.find(ch => ch.lessons.some(l => l.id === lesson.id))?.title}
                                    </p>
                                </div>
                                {!lessonCompleted ? (
                                    <Button onClick={handleMarkComplete}>
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Mark as Complete
                                    </Button>
                                ) : (
                                    <Badge className="bg-green-500">
                                        <CheckCircle className="h-4 w-4 mr-1" />
                                        Completed
                                    </Badge>
                                )}
                            </div>

                            <Tabs defaultValue="transcript" className="w-full">
                                <TabsList>
                                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                                    <TabsTrigger value="notes">Notes</TabsTrigger>
                                    <TabsTrigger value="resources">Resources</TabsTrigger>
                                </TabsList>
                                <TabsContent value="transcript" className="mt-4">
                                    <TranscriptPanel currentTime={currentTime} />
                                </TabsContent>
                                <TabsContent value="notes" className="mt-4">
                                    <Card>
                                        <CardContent className="p-6">
                                            <p className="text-muted-foreground">
                                                Take notes while watching the lesson. Your notes will be saved automatically.
                                            </p>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                                <TabsContent value="resources" className="mt-4">
                                    <Card>
                                        <CardContent className="p-6">
                                            <p className="text-muted-foreground">
                                                Additional resources and downloadable materials will appear here.
                                            </p>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>

                            <div className="flex items-center justify-between pt-6 border-t">
                                {prevLesson ? (
                                    <Link href={`/learn/${courseId}/${prevLesson.id}`}>
                                        <Button variant="outline">
                                            <ChevronLeft className="h-4 w-4 mr-2" />
                                            Previous Lesson
                                        </Button>
                                    </Link>
                                ) : (
                                    <span />
                                )}
                                {nextLesson ? (
                                    <Link href={`/learn/${courseId}/${nextLesson.id}`}>
                                        <Button variant="outline">
                                            Next Lesson
                                            <ChevronRight className="h-4 w-4 ml-2" />
                                        </Button>
                                    </Link>
                                ) : (
                                    <span />
                                )}
                            </div>

                            <CourseOutline
                                chapters={course.chapters || []}
                                courseId={course.id}
                                completedLessons={completedLessons}
                            />
                        </div>
                    </div>
                    <div className="border-l bg-card">
                        <AIChatPanel
                            courseId={courseId}
                            lessonId={lesson.id}
                            lessonTitle={lesson.title}
                            currentTime={currentTime}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
