"use client"

import { Badge } from '@/components/ui/badge'

type Lesson = {
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
}

const typeLabel: Record<string, string> = {
  VIDEO: 'Video',
  DOC: 'Document',
  QUIZ: 'Quiz',
  OTHER: 'Other',
}

export function LessonItem({ lesson, courseId }: { lesson: Lesson; courseId?: string }) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{lesson.title}</p>
          {lesson.description && <p className="text-sm text-muted-foreground">{lesson.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {lesson.lessonType && <Badge variant="secondary">{typeLabel[lesson.lessonType] || lesson.lessonType}</Badge>}
          {lesson.durationMinutes ? (
            <span className="text-xs text-muted-foreground">{lesson.durationMinutes} min</span>
          ) : null}
          {courseId && ((lesson.lessonType === 'VIDEO') || (lesson.assets || []).some(a => a.type === 'VIDEO' || (a.mimeType?.startsWith?.('video/') ?? false))) && (
            <a
              href={`/learn/${courseId}/${lesson.id}`}
              className="text-xs underline text-primary hover:text-primary/80"
            >
              Play
            </a>
          )}
        </div>
      </div>
      <div className="space-y-1">
        {lesson.assets && lesson.assets.length > 0 ? (
          lesson.assets.map((asset, idx) => (
            <a
              key={`${asset.id}-${idx}`}
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-sm border px-2 py-1 text-sm hover:bg-accent"
            >
              <span>{asset.title}</span>
              <span className="text-xs text-muted-foreground">{asset.type}</span>
            </a>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No assets</p>
        )}
      </div>
    </div>
  )
}
