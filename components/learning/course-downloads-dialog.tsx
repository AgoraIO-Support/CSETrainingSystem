'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ApiClient } from '@/lib/api-client'
import type { CourseDownloadItem } from '@/types'
import { AlertTriangle, CheckSquare, Download, File, FileText, Loader2, MonitorPlay, Music, Square, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

type CourseDownloadsDialogProps = {
    courseId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return null
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

const getKindLabel = (item: CourseDownloadItem) => {
    if (item.kind === 'TRANSCRIPT') return 'VTT'
    if (item.kind === 'KNOWLEDGE_XML') return 'XML'
    if (item.kind === 'WEB_PACKAGE_FILE') return 'Web'
    return item.type.replace(/_/g, ' ')
}

const getItemIcon = (item: CourseDownloadItem) => {
    if (item.kind === 'TRANSCRIPT' || item.kind === 'KNOWLEDGE_XML') return <FileText className="h-4 w-4" />
    if (item.kind === 'WEB_PACKAGE_FILE') return <MonitorPlay className="h-4 w-4" />
    if (item.type === 'VIDEO') return <Video className="h-4 w-4" />
    if (item.type === 'AUDIO') return <Music className="h-4 w-4" />
    return <File className="h-4 w-4" />
}

export function CourseDownloadsDialog({ courseId, open, onOpenChange }: CourseDownloadsDialogProps) {
    const [items, setItems] = useState<CourseDownloadItem[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return

        let cancelled = false
        setLoading(true)
        setError(null)

        ApiClient.getCourseDownloads(courseId)
            .then((response) => {
                if (cancelled) return
                setItems(response.data.items)
                setSelectedIds(new Set(response.data.items.map((item) => item.id)))
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load downloads')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [courseId, open])

    const groupedItems = useMemo(() => {
        const groups = new Map<string, { title: string; items: CourseDownloadItem[] }>()
        for (const item of items) {
            const groupKey = item.lessonId || item.chapterId || 'course'
            const title = item.lessonTitle || item.chapterTitle || 'Course files'
            const group = groups.get(groupKey) ?? { title, items: [] }
            group.items.push(item)
            groups.set(groupKey, group)
        }
        return Array.from(groups.entries()).map(([id, group]) => ({ id, ...group }))
    }, [items])

    const selectedItems = items.filter((item) => selectedIds.has(item.id))
    const allSelected = items.length > 0 && selectedIds.size === items.length

    const toggleItem = (itemId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(itemId)) {
                next.delete(itemId)
            } else {
                next.add(itemId)
            }
            return next
        })
    }

    const toggleAll = () => {
        setSelectedIds(allSelected ? new Set() : new Set(items.map((item) => item.id)))
    }

    const downloadSelected = () => {
        selectedItems.forEach((item, index) => {
            window.setTimeout(() => {
                const link = document.createElement('a')
                link.href = item.url
                link.download = item.filename
                link.target = '_blank'
                link.rel = 'noopener noreferrer'
                document.body.appendChild(link)
                link.click()
                link.remove()
            }, index * 120)
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Download course files</DialogTitle>
                    <DialogDescription>
                        Select the files you want to download from this course.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-md border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-slate-700"
                            disabled={items.length === 0}
                            onClick={toggleAll}
                        >
                            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            {allSelected ? 'Unselect all' : 'Select all'}
                        </Button>
                        <span className="text-xs font-medium text-slate-500">
                            {selectedIds.size} of {items.length} selected
                        </span>
                    </div>

                    <ScrollArea className="h-[420px]">
                        {loading ? (
                            <div className="flex h-[260px] items-center justify-center text-sm text-slate-500">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading files...
                            </div>
                        ) : error ? (
                            <div className="flex h-[260px] flex-col items-center justify-center px-6 text-center text-sm text-destructive">
                                <AlertTriangle className="mb-2 h-5 w-5" />
                                {error}
                            </div>
                        ) : items.length === 0 ? (
                            <div className="flex h-[260px] items-center justify-center text-sm text-slate-500">
                                No downloadable files found.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {groupedItems.map((group) => (
                                    <section key={group.id} className="bg-white">
                                        <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-4 py-2">
                                            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                {group.title}
                                            </p>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {group.items.map((item) => {
                                                const checked = selectedIds.has(item.id)
                                                const size = formatFileSize(item.sizeBytes)

                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={cn(
                                                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                                                            checked ? 'bg-[#eefbff]' : 'bg-white hover:bg-slate-50'
                                                        )}
                                                        onClick={() => toggleItem(item.id)}
                                                    >
                                                        <span className="text-[#006688]">
                                                            {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                                        </span>
                                                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                                                            {getItemIcon(item)}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm font-medium text-slate-900">
                                                                {item.title}
                                                            </span>
                                                            <span className="block truncate text-xs text-slate-500">
                                                                {[getKindLabel(item), item.filename, size].filter(Boolean).join(' · ')}
                                                            </span>
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button type="button" disabled={selectedItems.length === 0} onClick={downloadSelected}>
                        <Download className="mr-2 h-4 w-4" />
                        Download selected
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
