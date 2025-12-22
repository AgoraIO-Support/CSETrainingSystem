'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
    ChevronDown,
    ChevronRight,
    PlayCircle,
    CheckCircle,
    Video,
    FileText,
    FileSpreadsheet,
    File,
    Music,
    FolderOpen,
    BookOpen
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Chapter, Lesson, CourseAsset } from '@/types'

interface CourseContentPanelProps {
    chapters: Chapter[]
    currentLessonId?: string
    currentAssetId?: string
    completedLessons: Set<string>
    onLessonSelect: (lesson: Lesson) => void
    onAssetSelect: (asset: CourseAsset, lesson: Lesson) => void
    className?: string
}

function getAssetIcon(type: string | undefined) {
    switch (type) {
        case 'VIDEO':
            return <Video className="h-4 w-4" />
        case 'DOCUMENT':
            return <FileText className="h-4 w-4" />
        case 'PRESENTATION':
            return <FileSpreadsheet className="h-4 w-4" />
        case 'AUDIO':
            return <Music className="h-4 w-4" />
        default:
            return <File className="h-4 w-4" />
    }
}

export function CourseContentPanel({
    chapters,
    currentLessonId,
    currentAssetId,
    completedLessons,
    onLessonSelect,
    onAssetSelect,
    className
}: CourseContentPanelProps) {
    // Initialize with first chapter expanded and current lesson's chapter
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => {
        const initial = new Set<string>()
        if (chapters.length > 0) {
            initial.add(chapters[0].id)
        }
        // Also expand the chapter containing current lesson
        if (currentLessonId) {
            const chapterWithLesson = chapters.find(ch =>
                ch.lessons.some(l => l.id === currentLessonId)
            )
            if (chapterWithLesson) {
                initial.add(chapterWithLesson.id)
            }
        }
        return initial
    })

    const [expandedLessons, setExpandedLessons] = useState<Set<string>>(() => {
        const initial = new Set<string>()
        if (currentLessonId) {
            initial.add(currentLessonId)
        }
        return initial
    })

    // Update expanded states when currentLessonId changes
    useEffect(() => {
        if (currentLessonId) {
            const chapterWithLesson = chapters.find(ch =>
                ch.lessons.some(l => l.id === currentLessonId)
            )
            if (chapterWithLesson) {
                setExpandedChapters(prev => new Set([...prev, chapterWithLesson.id]))
            }
            setExpandedLessons(prev => new Set([...prev, currentLessonId]))
        }
    }, [currentLessonId, chapters])

    const toggleChapter = (chapterId: string) => {
        setExpandedChapters(prev => {
            const next = new Set(prev)
            if (next.has(chapterId)) {
                next.delete(chapterId)
            } else {
                next.add(chapterId)
            }
            return next
        })
    }

    const toggleLesson = (lessonId: string) => {
        setExpandedLessons(prev => {
            const next = new Set(prev)
            if (next.has(lessonId)) {
                next.delete(lessonId)
            } else {
                next.add(lessonId)
            }
            return next
        })
    }

    // Calculate overall progress
    const totalLessons = chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)
    const completedCount = completedLessons.size
    const progressPercent = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0

    return (
        <Card className={cn("h-full flex flex-col", className)}>
            <CardHeader className="border-b flex-shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        <CardTitle>Course Content</CardTitle>
                    </div>
                    <Badge variant="secondary">
                        {completedCount}/{totalLessons} completed
                    </Badge>
                </div>
                <Progress value={progressPercent} className="h-2" />
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-0">
                <div className="divide-y">
                    {chapters.map((chapter, chapterIdx) => {
                        const isChapterExpanded = expandedChapters.has(chapter.id)
                        const chapterLessonsCompleted = chapter.lessons.filter(
                            l => completedLessons.has(l.id)
                        ).length
                        const chapterProgress = chapter.lessons.length > 0
                            ? (chapterLessonsCompleted / chapter.lessons.length) * 100
                            : 0

                        return (
                            <div key={chapter.id}>
                                {/* Chapter Header */}
                                <button
                                    onClick={() => toggleChapter(chapter.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="flex-shrink-0">
                                            {isChapterExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </div>
                                        <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                        <span className="font-medium truncate">
                                            {chapterIdx + 1}. {chapter.title}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                        {chapterProgress === 100 ? (
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Badge variant="outline" className="text-xs">
                                                {chapterLessonsCompleted}/{chapter.lessons.length}
                                            </Badge>
                                        )}
                                    </div>
                                </button>

                                {/* Lessons */}
                                {isChapterExpanded && (
                                    <div className="bg-muted/30">
                                        {chapter.lessons.map((lesson) => {
                                            const isLessonExpanded = expandedLessons.has(lesson.id)
                                            const isCurrentLesson = lesson.id === currentLessonId
                                            const isCompleted = completedLessons.has(lesson.id)
                                            const hasAssets = (lesson.assets?.length || 0) > 0

                                            return (
                                                <div key={lesson.id}>
                                                    {/* Lesson Header */}
                                                    <div
                                                        className={cn(
                                                            "flex items-center pl-8 pr-4 py-3 border-l-2 transition-colors",
                                                            isCurrentLesson
                                                                ? "border-l-primary bg-primary/5"
                                                                : "border-l-transparent hover:bg-accent"
                                                        )}
                                                    >
                                                        <button
                                                            onClick={() => {
                                                                onLessonSelect(lesson)
                                                                if (hasAssets && !isLessonExpanded) {
                                                                    toggleLesson(lesson.id)
                                                                }
                                                            }}
                                                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                                        >
                                                            <div className="flex-shrink-0">
                                                                {isCompleted ? (
                                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                                ) : (
                                                                    <PlayCircle className="h-4 w-4 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                            <span className={cn(
                                                                "text-sm truncate",
                                                                isCurrentLesson && "font-medium"
                                                            )}>
                                                                {lesson.title}
                                                            </span>
                                                        </button>

                                                        {hasAssets && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0 flex-shrink-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    toggleLesson(lesson.id)
                                                                }}
                                                            >
                                                                <ChevronRight
                                                                    className={cn(
                                                                        "h-4 w-4 transition-transform",
                                                                        isLessonExpanded && "rotate-90"
                                                                    )}
                                                                />
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {/* Lesson Assets */}
                                                    {isLessonExpanded && hasAssets && (
                                                        <div className="pl-16 pr-4 pb-2 space-y-1 bg-muted/20">
                                                            {lesson.assets?.map((asset) => {
                                                                const isCurrentAsset = asset.id === currentAssetId

                                                                return (
                                                                    <button
                                                                        key={asset.id}
                                                                        onClick={() => onAssetSelect(asset, lesson)}
                                                                        className={cn(
                                                                            "w-full flex items-center gap-2 p-2 rounded text-left transition-colors",
                                                                            isCurrentAsset
                                                                                ? "bg-primary/10 text-primary"
                                                                                : "hover:bg-accent"
                                                                        )}
                                                                    >
                                                                        {getAssetIcon(asset.type)}
                                                                        <span className="text-xs truncate flex-1">
                                                                            {asset.title}
                                                                        </span>
                                                                        <Badge
                                                                            variant={isCurrentAsset ? "default" : "outline"}
                                                                            className="text-[10px] px-1.5"
                                                                        >
                                                                            {asset.type}
                                                                        </Badge>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

export default CourseContentPanel
