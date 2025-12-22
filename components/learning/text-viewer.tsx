'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, ExternalLink, Copy, Check, Loader2, AlertTriangle } from 'lucide-react'

interface TextViewerProps {
    url: string
    title?: string
    maxHeight?: string
}

export function TextViewer({ url, title, maxHeight = '500px' }: TextViewerProps) {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let cancelled = false

        const fetchContent = async () => {
            setLoading(true)
            setError(null)

            try {
                const response = await fetch(url)
                if (!response.ok) {
                    throw new Error(`Failed to load: ${response.statusText}`)
                }
                const text = await response.text()
                if (!cancelled) {
                    setContent(text)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load text content')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchContent()

        return () => {
            cancelled = true
        }
    }, [url])

    const handleCopy = async () => {
        if (content) {
            try {
                await navigator.clipboard.writeText(content)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            } catch (err) {
                console.error('Failed to copy:', err)
            }
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                        <p className="text-destructive font-medium">{error}</p>
                        <div className="flex gap-3 mt-4">
                            <Button variant="outline" asChild>
                                <a href={url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open in New Tab
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href={url} download={title}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                </a>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                {title && <CardTitle className="text-lg">{title}</CardTitle>}
                <div className="flex items-center gap-2 ml-auto">
                    <Button variant="outline" size="sm" onClick={handleCopy}>
                        {copied ? (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Copied
                            </>
                        ) : (
                            <>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy
                            </>
                        )}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                        <a href={url} download={title}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </a>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <pre
                    className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap break-words"
                    style={{ maxHeight }}
                >
                    {content}
                </pre>
            </CardContent>
        </Card>
    )
}

export default TextViewer
