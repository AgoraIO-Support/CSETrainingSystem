"use client"

import { useState, useEffect } from 'react'
import { Course } from '@/types'
import { ChapterSection } from './chapter-section'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type ContentResponse = {
  courseId: string
  chapters: Array<{
    id: string
    title: string
    description?: string | null
    order: number
    lessons: Array<{
      id: string
      title: string
      description?: string | null
      order: number
      durationMinutes?: number | null
      lessonType?: string | null
      completionRule?: string | null
      learningObjectives?: string[]
      assets: Array<{
        id: string
        title: string
        type: string
        url: string
        mimeType?: string | null
      }>
    }>
  }>
}

type Props = {
  course: Course
  content: ContentResponse
}

export function CourseContent({ course, content }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ContentResponse | null>(content)

  useEffect(() => {
    setData(content)
  }, [content])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load content</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data || !data.chapters?.length) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <p className="text-muted-foreground">No content available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Course #{course.id}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1>
        <p className="text-sm text-muted-foreground">Course content</p>
      </div>
      <div className="space-y-4">
        {data.chapters.map((chapter) => (
          <ChapterSection key={chapter.id} chapter={chapter} courseId={course.id} />
        ))}
      </div>
    </div>
  )
}
