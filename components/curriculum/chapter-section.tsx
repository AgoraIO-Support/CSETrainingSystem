"use client"

import { LessonItem } from './lesson-item'

type Chapter = {
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
    assets: Array<{
      id: string
      title: string
      type: string
      url: string
      mimeType?: string | null
    }>
  }>
}

export function ChapterSection({ chapter, courseId }: { chapter: Chapter; courseId: string }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">Chapter</p>
        <h2 className="text-xl font-semibold">{chapter.title}</h2>
        {chapter.description && <p className="text-sm text-muted-foreground">{chapter.description}</p>}
      </div>
      {chapter.lessons && chapter.lessons.length > 0 ? (
        <div className="space-y-2">
          {chapter.lessons.map((lesson) => (
            <LessonItem key={lesson.id} lesson={lesson} courseId={courseId} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No lessons in this chapter.</p>
      )}
    </div>
  )
}
