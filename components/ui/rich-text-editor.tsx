'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sanitizeRichTextHtml } from '@/lib/rich-text'
import {
    Bold,
    Italic,
    Underline,
    List,
    ListOrdered,
    Heading2,
    Link as LinkIcon,
    Pilcrow,
    ImagePlus,
    Paperclip,
    Loader2,
} from 'lucide-react'

type UploadedRichTextAsset = {
    url: string
    name?: string
    assetKey?: string
}

type RichTextEditorProps = {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    onUploadImage?: (file: File) => Promise<UploadedRichTextAsset>
    onUploadFile?: (file: File) => Promise<UploadedRichTextAsset>
}

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

export function RichTextEditor({
    value,
    onChange,
    placeholder,
    className,
    onUploadImage,
    onUploadFile,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null)
    const imageInputRef = useRef<HTMLInputElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const selectionRef = useRef<Range | null>(null)
    const [uploadingKind, setUploadingKind] = useState<'image' | 'file' | null>(null)
    const [uploadError, setUploadError] = useState<string | null>(null)

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

    const saveSelection = () => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        selectionRef.current = selection.getRangeAt(0).cloneRange()
    }

    const restoreSelection = () => {
        const selection = window.getSelection()
        if (!selection || !selectionRef.current) return
        selection.removeAllRanges()
        selection.addRange(selectionRef.current)
    }

    const runCommand = (command: string, argument?: string) => {
        editorRef.current?.focus()
        restoreSelection()
        document.execCommand(command, false, argument)
        syncContent()
    }

    const insertLink = () => {
        const href = window.prompt('Enter a URL (http, https, or mailto):')
        if (!href) return
        runCommand('createLink', href)
    }

    const insertHtml = (html: string) => {
        const editor = editorRef.current
        if (!editor) return

        editor.focus()
        restoreSelection()

        const selection = window.getSelection()
        let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : selectionRef.current

        if (!range) {
            range = document.createRange()
            range.selectNodeContents(editor)
            range.collapse(false)
        }

        const template = document.createElement('template')
        template.innerHTML = html
        const fragment = template.content.cloneNode(true) as DocumentFragment
        const insertedNodes = Array.from(fragment.childNodes)
        if (insertedNodes.length === 0) return

        range.deleteContents()
        range.insertNode(fragment)

        const nextRange = document.createRange()
        nextRange.setStartAfter(insertedNodes[insertedNodes.length - 1])
        nextRange.collapse(true)

        selection?.removeAllRanges()
        selection?.addRange(nextRange)
        selectionRef.current = nextRange.cloneRange()
        syncContent()
    }

    const openFilePicker = (kind: 'image' | 'file') => {
        saveSelection()
        setUploadError(null)
        if (kind === 'image') {
            imageInputRef.current?.click()
            return
        }
        fileInputRef.current?.click()
    }

    const handleAssetUpload = async (kind: 'image' | 'file', files: File[]) => {
        if (files.length === 0) return
        const upload = kind === 'image' ? onUploadImage : onUploadFile
        if (!upload) return

        setUploadingKind(kind)
        setUploadError(null)

        try {
            for (const file of files) {
                const uploaded = await upload(file)
                const assetKeyAttribute = uploaded.assetKey
                    ? ` data-asset-key="${escapeHtml(uploaded.assetKey)}"`
                    : ''

                if (kind === 'image') {
                    insertHtml(
                        `<div><img src="${escapeHtml(uploaded.url)}" alt="${escapeHtml(
                            uploaded.name || file.name
                        )}"${assetKeyAttribute} /></div>`
                    )
                } else {
                    insertHtml(
                        `<div><a href="${escapeHtml(uploaded.url)}"${assetKeyAttribute} target="_blank" rel="noreferrer noopener">${escapeHtml(
                            uploaded.name || file.name
                        )}</a></div>`
                    )
                }
            }
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : 'Failed to upload file')
        } finally {
            if (imageInputRef.current) imageInputRef.current.value = ''
            if (fileInputRef.current) fileInputRef.current.value = ''
            setUploadingKind(null)
        }
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
                {onUploadImage && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openFilePicker('image')}
                        disabled={uploadingKind !== null}
                        title="Upload image"
                    >
                        {uploadingKind === 'image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    </Button>
                )}
                {onUploadFile && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openFilePicker('file')}
                        disabled={uploadingKind !== null}
                        title="Upload attachment"
                    >
                        {uploadingKind === 'file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                )}
            </div>
            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void handleAssetUpload('image', Array.from(event.target.files ?? []))}
            />
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => void handleAssetUpload('file', Array.from(event.target.files ?? []))}
            />
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[220px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-placeholder={placeholder}
                onInput={syncContent}
                onBlur={syncContent}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
            />
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            <style jsx>{`
                div[contenteditable][data-placeholder]:empty::before {
                    content: attr(data-placeholder);
                    color: hsl(var(--muted-foreground));
                }
            `}</style>
        </div>
    )
}
