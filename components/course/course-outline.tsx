'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, PlayCircle, CheckCircle, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chapter } from '@/types'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CourseOutlineProps {
    chapters: Chapter[]
    courseId: string
    completedLessons?: Set<string>
}

export function CourseOutline({ chapters, courseId, completedLessons = new Set() }: CourseOutlineProps) {
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set([chapters[0]?.id]))

    const toggleChapter = (chapterId: string) => {
        const newExpanded = new Set(expandedChapters)
        if (newExpanded.has(chapterId)) {
            newExpanded.delete(chapterId)
        } else {
            newExpanded.add(chapterId)
        }
        setExpandedChapters(newExpanded)
    }

    const formatDuration = (lesson: any) => {
        const mins = lesson.durationMinutes ?? Math.round((lesson.duration ?? 0) / 60)
        if (!mins || mins <= 0) return '--'
        return `${mins} min`
    }

    const totalLessons = chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)
    const completedCount = completedLessons.size

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">Course Content</h3>
                    <div className="text-sm text-muted-foreground">
                        {completedCount} / {totalLessons} lessons completed
                    </div>
                </div>

                <div className="space-y-2">
                    {chapters.map((chapter, chapterIndex) => {
                        const isExpanded = expandedChapters.has(chapter.id)
                        const chapterCompleted = chapter.lessons.every(lesson =>
                            completedLessons.has(lesson.id)
                        )

                        return (
                            <div key={chapter.id} className="border rounded-lg overflow-hidden">
                                <button
                                    onClick={() => toggleChapter(chapter.id)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors"
                                >
                                    <div className="flex items-center space-x-3">
                                        {chapterCompleted ? (
                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                                        )}
                                        <div className="text-left">
                                            <p className="font-semibold">
                                                Chapter {chapterIndex + 1}: {chapter.title}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {chapter.lessons.length} lessons
                                            </p>
                                        </div>
                                    </div>
                                    {isExpanded ? (
                                        <ChevronUp className="h-5 w-5" />
                                    ) : (
                                        <ChevronDown className="h-5 w-5" />
                                    )}
                                </button>

                                {isExpanded && (
                                    <div className="border-t bg-muted/30">
                                        {chapter.lessons.map((lesson, lessonIndex) => {
                                            const isCompleted = completedLessons.has(lesson.id)
                                            const isLocked = lessonIndex > 0 && !completedLessons.has(chapter.lessons[lessonIndex - 1].id)

                                            return (
                                                <Link
                                                    key={lesson.id}
                                                    href={isLocked ? '#' : `/learn/${courseId}/${lesson.id}`}
                                                    className={cn(
                                                        'flex items-center justify-between p-4 hover:bg-accent transition-colors border-b last:border-b-0',
                                                        isLocked && 'opacity-50 cursor-not-allowed'
                                                    )}
                                                    onClick={(e) => isLocked && e.preventDefault()}
                                                >
                                                    <div className="flex items-center space-x-3 flex-1">
                                                        {isCompleted ? (
                                                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                        ) : isLocked ? (
                                                            <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        ) : (
                                                            <PlayCircle className="h-4 w-4 text-primary flex-shrink-0" />
                                                        )}
                                                        <span className="text-sm">{lesson.title}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        {lesson.subtitleUrl && (
                                                            <Badge variant="outline" className="text-xs">
                                                                CC
                                                            </Badge>
                                                        )}
                                                        <span className="text-sm text-muted-foreground">
                                                            {formatDuration(lesson)}
                                                        </span>
                                                    </div>
                                                </Link>
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
