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
                'prose prose-sm max-w-none break-words text-foreground [&_a]:break-all [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_div]:my-3 [&_div]:leading-7 [&_h1]:mb-3 [&_h1]:mt-5 [&_h2]:mb-3 [&_h2]:mt-5 [&_h3]:mb-2 [&_h3]:mt-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:my-3 [&_li]:my-1 [&_ol]:pl-5 [&_p]:my-3 [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:pl-5 [overflow-wrap:anywhere]',
                className
            )}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
    )
}
