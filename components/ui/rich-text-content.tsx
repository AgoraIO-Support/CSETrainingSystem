'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { sanitizeRichTextHtml } from '@/lib/rich-text'

type RichTextContentProps = {
    html: string
    className?: string
}

export function RichTextContent({ html, className }: RichTextContentProps) {
    const [sanitizedHtml, setSanitizedHtml] = useState('')

    useEffect(() => {
        setSanitizedHtml(sanitizeRichTextHtml(html))
    }, [html])

    return (
        <div
            className={cn(
                'prose prose-sm max-w-none text-foreground [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_ol]:pl-5 [&_ul]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
                className
            )}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
    )
}
