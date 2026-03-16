'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sanitizeRichTextHtml } from '@/lib/rich-text'
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Link as LinkIcon, Pilcrow } from 'lucide-react'

type RichTextEditorProps = {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!editorRef.current) return
        if (editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value
        }
    }, [value])

    const syncContent = () => {
        if (!editorRef.current) return
        const sanitized = sanitizeRichTextHtml(editorRef.current.innerHTML)
        if (editorRef.current.innerHTML !== sanitized) {
            editorRef.current.innerHTML = sanitized
        }
        onChange(sanitized)
    }

    const runCommand = (command: string, argument?: string) => {
        editorRef.current?.focus()
        document.execCommand(command, false, argument)
        syncContent()
    }

    const insertLink = () => {
        const href = window.prompt('Enter a URL (http, https, or mailto):')
        if (!href) return
        runCommand('createLink', href)
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-2">
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('formatBlock', '<p>')}>
                    <Pilcrow className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('formatBlock', '<h2>')}>
                    <Heading2 className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('bold')}>
                    <Bold className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('italic')}>
                    <Italic className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('underline')}>
                    <Underline className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('insertUnorderedList')}>
                    <List className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => runCommand('insertOrderedList')}>
                    <ListOrdered className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={insertLink}>
                    <LinkIcon className="h-4 w-4" />
                </Button>
            </div>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[220px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-placeholder={placeholder}
                onInput={syncContent}
                onBlur={syncContent}
            />
            <style jsx>{`
                div[contenteditable][data-placeholder]:empty::before {
                    content: attr(data-placeholder);
                    color: hsl(var(--muted-foreground));
                }
            `}</style>
        </div>
    )
}
