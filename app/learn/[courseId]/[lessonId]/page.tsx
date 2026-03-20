'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VideoJSPlayer } from '@/components/video/videojs-player'
import { AIChatPanel } from '@/components/ai/ai-chat-panel'
import { KnowledgeAnchors } from '@/components/ai/knowledge-anchors'
import { CourseContentPanel } from '@/components/learning/course-content-panel'
import { AssetViewer } from '@/components/learning/asset-viewer'
import { ApiClient } from '@/lib/api-client'
import type { Course, Lesson, LessonProgress, CourseAsset } from '@/types'
import {
    ChevronLeft,
    ChevronRight,
    CheckCircle,
    Home,
    Loader2,
    AlertTriangle,
    MessageSquare,
    X,
    List,
    LogOut,
    Maximize2,
    Minimize2,
    Minus,
    PanelLeftClose,
    PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAssetBasename, isVttUrl } from '@/lib/video/subtitles'

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
    const [userId, setUserId] = useState<string | null>(null)

    // New state for asset viewing
    const [selectedAsset, setSelectedAsset] = useState<CourseAsset | null>(null)
    const [showAIChat, setShowAIChat] = useState(false)
    const [showSidebar, setShowSidebar] = useState(true)

    const syncThrottleRef = useRef(0)
    const maxWatchedRef = useRef(0)
    const videoPlayerRef = useRef<any>(null)

    const DEFAULT_SIDEBAR_WIDTH = 320
    const SIDEBAR_WIDTH_STORAGE_KEY = 'cse.lessonSidebarWidth'
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
    const [isResizingSidebar, setIsResizingSidebar] = useState(false)
    const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

    const DEFAULT_AI_PANEL_WIDTH = 384
    const AI_PANEL_WIDTH_STORAGE_KEY = 'cse.aiPanelWidth'
    const [aiPanelMode, setAiPanelMode] = useState<'default' | 'maximized' | 'minimized'>('default')
    const [aiPanelWidth, setAiPanelWidth] = useState(DEFAULT_AI_PANEL_WIDTH)
    const [isResizingAiPanel, setIsResizingAiPanel] = useState(false)
    const aiPanelResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

    useEffect(() => {
        let cancelled = false
        ApiClient.getMe()
            .then(res => {
                if (!cancelled) setUserId(res.data?.id ?? null)
            })
            .catch(() => {
                if (!cancelled) setUserId(null)
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        try {
            const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
            const parsed = stored ? Number.parseInt(stored, 10) : NaN
            if (Number.isFinite(parsed) && parsed >= 260 && parsed <= 520) {
                setSidebarWidth(parsed)
            }
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
        } catch {
            // ignore
        }
    }, [sidebarWidth])

    useEffect(() => {
        try {
            const stored = localStorage.getItem(AI_PANEL_WIDTH_STORAGE_KEY)
            const parsed = stored ? Number.parseInt(stored, 10) : NaN
            if (Number.isFinite(parsed) && parsed >= 280 && parsed <= 1200) {
                setAiPanelWidth(parsed)
            }
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(AI_PANEL_WIDTH_STORAGE_KEY, String(aiPanelWidth))
        } catch {
            // ignore
        }
    }, [aiPanelWidth])

    useEffect(() => {
        if (!isResizingSidebar) return

        const prevCursor = document.body.style.cursor
        const prevUserSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
        const onMove = (e: PointerEvent) => {
            const s = sidebarResizeStateRef.current
            if (!s) return
            const minWidth = 260
            const maxWidth = clamp(window.innerWidth * 0.45, 300, 520)
            const next = clamp(s.startWidth + (e.clientX - s.startX), minWidth, maxWidth)
            setSidebarWidth(next)
        }

        const onUp = () => {
            sidebarResizeStateRef.current = null
            setIsResizingSidebar(false)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
            document.body.style.cursor = prevCursor
            document.body.style.userSelect = prevUserSelect
        }
    }, [isResizingSidebar])

    useEffect(() => {
        if (!isResizingAiPanel || aiPanelMode !== 'default') return

        const prevCursor = document.body.style.cursor
        const prevUserSelect = document.body.style.userSelect
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
        const onMove = (e: PointerEvent) => {
            const s = aiPanelResizeStateRef.current
            if (!s) return
            const minWidth = 320
            const maxWidth = clamp(window.innerWidth - 360, 360, 800)
            const next = clamp(s.startWidth + (s.startX - e.clientX), minWidth, maxWidth)
            setAiPanelWidth(next)
        }

        const onUp = () => {
            aiPanelResizeStateRef.current = null
            setIsResizingAiPanel(false)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
            document.body.style.cursor = prevCursor
            document.body.style.userSelect = prevUserSelect
        }
    }, [aiPanelMode, isResizingAiPanel])

    const handleOpenAIChat = () => {
        setShowAIChat(true)
        setAiPanelMode('default')
    }

    const handleCloseAIChat = () => {
        setShowAIChat(false)
        setAiPanelMode('default')
    }

    const handleMinimizeAIChat = () => {
        setShowAIChat(true)
        setAiPanelMode('minimized')
    }

    const handleMaximizeAIChat = () => {
        setShowAIChat(true)
        setAiPanelMode('maximized')
    }

    const handleRestoreAIChat = () => {
        setShowAIChat(true)
        setAiPanelMode('default')
    }

    useEffect(() => {
        let cancelled = false
        const loadCourse = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await ApiClient.getCourse(courseId)
                if (cancelled) return
                if (response.data?.isEnrolled === false) {
                    setCourse(response.data)
                    setLesson(null)
                    setError('You are not enrolled in this course')
                    return
                }
                setCourse(response.data)
                const locatedLesson = response.data.chapters
                    ?.flatMap(chapter => chapter.lessons)
                    .find(lessonItem => lessonItem.id === lessonId)
                if (!locatedLesson) {
                    setError('Lesson not found in this course')
                } else {
                    setLesson(locatedLesson)
                    // Auto-select primary video asset if available
                    const videoAsset = (locatedLesson.assets || []).find(
                        (a: any) => a.type === 'VIDEO' || (a.mimeType?.startsWith?.('video/') ?? false)
                    )
                    if (videoAsset) {
                        setSelectedAsset(videoAsset as CourseAsset)
                    }
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
        if (!course || !lesson || course.isEnrolled === false) return
        try {
            const chapterTitle = course.chapters?.find(ch => ch.lessons.some(l => l.id === lesson.id))?.title
            const payload = {
                courseId: course.id,
                courseTitle: course.title,
                courseSlug: course.slug,
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                chapterTitle,
                updatedAt: new Date().toISOString(),
            }
            const key = `cse:lastLesson:${userId ?? 'anon'}`
            localStorage.setItem(key, JSON.stringify(payload))
        } catch {
            // no-op: localStorage may be unavailable
        }
    }, [course, lesson, userId])

    useEffect(() => {
        if (course?.aiAssistantEnabled === false) {
            setShowAIChat(false)
        }
    }, [course?.aiAssistantEnabled])

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

    const totalLessons = useMemo(() => {
        if (!course?.chapters) return 0
        return course.chapters.reduce((sum, chapter) => sum + (chapter.lessons?.length ?? 0), 0)
    }, [course?.chapters])

    const progressPercent = useMemo(() => {
        if (totalLessons > 0) {
            return (completedLessons.size / totalLessons) * 100
        }
        return course?.progress ?? 0
    }, [completedLessons.size, course?.progress, totalLessons])

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

    // Handle lesson selection from sidebar
    const handleLessonSelect = useCallback((selectedLesson: Lesson) => {
        router.push(`/learn/${courseId}/${selectedLesson.id}`)
    }, [courseId, router])

    // Handle asset selection from sidebar
    const handleAssetSelect = useCallback((asset: CourseAsset, parentLesson: Lesson) => {
        if (parentLesson.id !== lessonId) {
            // Navigate to the lesson containing the asset
            router.push(`/learn/${courseId}/${parentLesson.id}`)
        }
        setSelectedAsset(asset)
    }, [courseId, lessonId, router])

    // Handle seeking to timestamp from AI sources
    // MUST be before early returns to maintain hook order
    const handleSeekToTimestamp = useCallback((timestamp: string) => {
        if (!videoPlayerRef.current) return

        // Parse timestamp format: "MM:SS-MM:SS" or "HH:MM:SS-HH:MM:SS"
        // Extract the start time (before the dash)
        const startTime = timestamp.split('-')[0].trim()
        const parts = startTime.split(':').map(Number)

        let seconds = 0
        if (parts.length === 2) {
            // MM:SS format
            seconds = parts[0] * 60 + parts[1]
        } else if (parts.length === 3) {
            // HH:MM:SS format
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
        }

        // Seek to the timestamp
        if (Number.isFinite(seconds) && seconds >= 0) {
            videoPlayerRef.current.currentTime(seconds)

            // Auto-play after seeking
            if (videoPlayerRef.current.paused()) {
                videoPlayerRef.current.play()
            }
        }
    }, [])

    // Stable callbacks for VideoJSPlayer to prevent re-initialization
    // MUST be defined before any early returns to comply with Rules of Hooks
    const handleVideoReady = useCallback((player: any) => {
        videoPlayerRef.current = player
    }, [])

    const handleVideoEnded = useCallback(() => {
        setLessonCompleted(true)
    }, [])

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
                <Button variant="outline" onClick={() => router.push(`/courses/${course?.slug ?? courseId}`)}>
                    Back to Course
                </Button>
            </div>
        )
    }

    // Prefer assets to determine video and subtitle URLs
    const videoAsset = (lesson.assets || []).find(
        (a: any) => a.type === 'VIDEO' || (a.mimeType?.startsWith?.('video/') ?? false)
    )
    const subtitleCandidates = (lesson.assets || []).filter(
        (a: any) => a?.url && (a.mimeType === 'text/vtt' || isVttUrl(a.url))
    )
    const videoBasename = getAssetBasename(videoAsset as any)
    const subtitleAsset =
        subtitleCandidates.find((a: any) => (videoBasename ? getAssetBasename(a) === videoBasename : false)) ??
        subtitleCandidates[0]
    const resolvedVideoUrl = videoAsset?.url || lesson.videoUrl || null
    const resolvedSubtitleUrl = subtitleAsset?.url || lesson.subtitleUrl

    const handleMarkComplete = async () => {
        setLessonCompleted(true)
        setLessonProgressMap(prev => ({
            ...prev,
            [lesson.id]: {
                lessonId: lesson.id,
                watchedDuration: Math.round(maxWatchedRef.current),
                lastTimestamp: Math.round(currentTime),
                completed: true,
            },
        }))
        await syncProgress(lesson.duration || currentTime, { force: true, completed: true })
    }

    // Determine what to show in main content area
    const renderMainContent = () => {
        // If a non-video asset is selected, show asset viewer
        if (selectedAsset && selectedAsset.type !== 'VIDEO') {
            return (
                <AssetViewer
                    asset={selectedAsset}
                    onClose={() => {
                        // Go back to video if available
                        if (videoAsset) {
                            setSelectedAsset(videoAsset as CourseAsset)
                        } else {
                            setSelectedAsset(null)
                        }
                    }}
                />
            )
        }

        // Default: show video player or placeholder
        if (resolvedVideoUrl) {
            return (
                <div className="space-y-4">
                    <VideoJSPlayer
                        videoUrl={resolvedVideoUrl}
                        subtitleUrl={resolvedSubtitleUrl}
                        onTimeUpdate={setCurrentTime}
                        initialTime={initialTimestamp}
                        onReady={handleVideoReady}
                        onEnded={handleVideoEnded}
                    />
                    <KnowledgeAnchors
                        lessonId={lesson.id}
                        currentTime={currentTime}
                        onSeekToTimestamp={handleSeekToTimestamp}
                    />
                </div>
            )
        }

        return (
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No video available for this lesson</p>
                    {lesson.assets && lesson.assets.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
                            Select a resource from the sidebar to view
                        </p>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <div className="border-b bg-card flex-shrink-0">
                <div className="flex items-center justify-between p-3">
                    <div className="flex items-center space-x-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            title={showSidebar ? 'Hide course content' : 'Show course content'}
                            onClick={() => setShowSidebar(!showSidebar)}
                        >
                            {showSidebar ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
                        </Button>
                        <Link href="/">
                            <Button variant="ghost" size="icon">
                                <Home className="h-5 w-5" />
                            </Button>
                        </Link>
                        <Link href={`/courses/${course?.slug ?? courseId}`}>
                            <Button variant="ghost" size="sm">
                                <List className="h-4 w-4 mr-2" />
                                Course Home
                            </Button>
                        </Link>
                        <div className="hidden sm:block">
                            <h1 className="font-semibold text-sm line-clamp-1">{lesson.title}</h1>
                            <p className="text-xs text-muted-foreground line-clamp-1">{course.title}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <div className="hidden md:flex items-center space-x-2">
                            <Progress value={progressPercent} className="w-24" />
                            <span className="text-xs font-medium">{Math.round(progressPercent)}%</span>
                        </div>

                        {/* AI Chat toggle */}
                        {course?.aiAssistantEnabled !== false && (
                            <Button
                                variant={showAIChat ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    if (!showAIChat) {
                                        handleOpenAIChat()
                                        return
                                    }
                                    if (aiPanelMode === 'minimized') {
                                        handleRestoreAIChat()
                                        return
                                    }
                                    handleCloseAIChat()
                                }}
                            >
                                <MessageSquare className="h-4 w-4" />
                                <span className="hidden sm:inline ml-1">AI Assistant</span>
                            </Button>
                        )}

                        {/* Lesson completion status */}
                        {lessonCompleted ? (
                            <Badge className="bg-green-500 hidden sm:flex">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Completed
                            </Badge>
                        ) : (
                            <Button size="sm" variant="outline" onClick={handleMarkComplete}>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span className="hidden sm:inline">Mark Complete</span>
                            </Button>
                        )}

                        <Button variant="outline" size="sm" onClick={() => ApiClient.logout()}>
                            <LogOut className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Logout</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Sidebar - Course Content Panel */}
                <div
                    className={cn(
                        "relative flex-shrink-0 border-r bg-card overflow-hidden transition-[transform,width] duration-300",
                        isResizingSidebar ? "transition-none" : null,
                        showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:border-0"
                    )}
                    style={{ width: showSidebar ? sidebarWidth : 0 }}
                >
                    {showSidebar && (
                        <div
                            role="separator"
                            aria-label="Resize course content panel"
                            aria-orientation="vertical"
                            tabIndex={0}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-border/60 focus:outline-none focus:ring-2 focus:ring-ring"
                            onPointerDown={(e) => {
                                if (e.button !== 0) return
                                sidebarResizeStateRef.current = { startX: e.clientX, startWidth: sidebarWidth }
                                setIsResizingSidebar(true)
                            }}
                            onKeyDown={(e) => {
                                const delta = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0
                                if (!delta) return
                                e.preventDefault()
                                const minWidth = 260
                                const maxWidth = Math.max(300, Math.min(520, Math.round(window.innerWidth * 0.45)))
                                const next = Math.max(minWidth, Math.min(maxWidth, sidebarWidth + delta))
                                setSidebarWidth(next)
                            }}
                        />
                    )}
                    <CourseContentPanel
                        chapters={course.chapters || []}
                        currentLessonId={lesson.id}
                        currentAssetId={selectedAsset?.id}
                        completedLessons={completedLessons}
                        onLessonSelect={handleLessonSelect}
                        onAssetSelect={handleAssetSelect}
                        className="h-full"
                    />
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-4 lg:p-6 space-y-4">
                            {progressError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{progressError}</AlertDescription>
                                </Alert>
                            )}

                            {/* Navigation */}
                            <div className="flex items-center justify-between">
                                {prevLesson ? (
                                    <Link href={`/learn/${courseId}/${prevLesson.id}`}>
                                        <Button variant="outline" size="sm">
                                            <ChevronLeft className="h-4 w-4 mr-1" />
                                            <span className="hidden sm:inline">Previous</span>
                                        </Button>
                                    </Link>
                                ) : (
                                    <span />
                                )}
                                {nextLesson ? (
                                    <Link href={`/learn/${courseId}/${nextLesson.id}`}>
                                        <Button variant="outline" size="sm">
                                            <span className="hidden sm:inline">Next</span>
                                            <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </Link>
                                ) : (
                                    <span />
                                )}
                            </div>

                            {/* Main Content (Video/Asset Viewer) */}
                            <div className="rounded-lg overflow-hidden">
                                {renderMainContent()}
                            </div>

                            {/* Lesson Info */}
                            <div className="space-y-2">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold">{lesson.title}</h2>
                                        <p className="text-sm text-muted-foreground">
                                            {course.chapters?.find(ch => ch.lessons.some(l => l.id === lesson.id))?.title}
                                        </p>
                                    </div>
                                </div>

                                {lesson.description && (
                                    <p className="text-muted-foreground text-sm">{lesson.description}</p>
                                )}

                                {lesson.learningObjectives && lesson.learningObjectives.length > 0 && (
                                    <div className="mt-4">
                                        <h3 className="text-sm font-semibold mb-2">Learning Objectives</h3>
                                        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                            {lesson.learningObjectives.map((obj, idx) => (
                                                <li key={`objective-${idx}-${obj.substring(0, 20)}`}>{obj}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>

                {/* AI Chat Panel - Slide-in */}
                {course?.aiAssistantEnabled !== false && (
                    <>
                        {showAIChat && aiPanelMode === 'maximized' ? (
                            <>
                                <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" />
                                <div className="fixed inset-x-4 bottom-4 top-20 z-50">
                                    <AIChatPanel
                                        className="h-full overflow-hidden rounded-xl border shadow-2xl"
                                        courseId={courseId}
                                        lessonId={lesson.id}
                                        lessonTitle={lesson.title}
                                        currentTime={currentTime}
                                        onSeekToTimestamp={handleSeekToTimestamp}
                                        headerActions={
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={handleRestoreAIChat}
                                                    title="Restore panel"
                                                >
                                                    <Minimize2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={handleMinimizeAIChat}
                                                    title="Minimize panel"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={handleCloseAIChat}
                                                    title="Close panel"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </>
                                        }
                                    />
                                </div>
                            </>
                        ) : (
                            <div
                                className={cn(
                                    "relative flex-shrink-0 border-l bg-card overflow-hidden transition-[transform,width] duration-300",
                                    isResizingAiPanel ? "transition-none" : null,
                                    showAIChat && aiPanelMode === 'default' ? "translate-x-0" : "translate-x-full border-0"
                                )}
                                style={{ width: showAIChat && aiPanelMode === 'default' ? aiPanelWidth : 0 }}
                            >
                                {showAIChat && aiPanelMode === 'default' && (
                                    <div
                                        role="separator"
                                        aria-label="Resize AI panel"
                                        aria-orientation="vertical"
                                        tabIndex={0}
                                        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-border/60 focus:outline-none focus:ring-2 focus:ring-ring"
                                        onPointerDown={(e) => {
                                            if (e.button !== 0) return
                                            aiPanelResizeStateRef.current = { startX: e.clientX, startWidth: aiPanelWidth }
                                            setIsResizingAiPanel(true)
                                        }}
                                        onKeyDown={(e) => {
                                            const delta = e.key === 'ArrowLeft' ? 20 : e.key === 'ArrowRight' ? -20 : 0
                                            if (!delta) return
                                            e.preventDefault()
                                            const minWidth = 320
                                            const maxWidth = Math.max(360, Math.min(800, window.innerWidth - 360))
                                            const next = Math.max(minWidth, Math.min(maxWidth, aiPanelWidth + delta))
                                            setAiPanelWidth(next)
                                        }}
                                    />
                                )}
                                <div className="h-full min-h-0 overflow-hidden">
                                    <AIChatPanel
                                        className="h-full rounded-none border-0 shadow-none"
                                        courseId={courseId}
                                        lessonId={lesson.id}
                                        lessonTitle={lesson.title}
                                        currentTime={currentTime}
                                        onSeekToTimestamp={handleSeekToTimestamp}
                                        headerActions={
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={handleMaximizeAIChat}
                                                    title="Maximize panel"
                                                >
                                                    <Maximize2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={handleMinimizeAIChat}
                                                    title="Minimize panel"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={handleCloseAIChat}
                                                    title="Close panel"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </>
                                        }
                                    />
                                </div>
                            </div>
                        )}

                        {showAIChat && aiPanelMode === 'minimized' ? (
                            <div className="fixed bottom-4 right-4 z-40">
                                <Button
                                    className="h-11 rounded-full px-4 shadow-lg"
                                    onClick={handleRestoreAIChat}
                                >
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Restore AI Assistant
                                </Button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    )
}
