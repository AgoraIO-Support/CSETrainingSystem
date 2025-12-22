'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ExternalLink, Download, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react'

interface DocumentViewerProps {
    url: string
    title?: string
    mimeType?: string
    height?: string
}

export function DocumentViewer({ url, title, mimeType, height = '600px' }: DocumentViewerProps) {
    const [viewerError, setViewerError] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Determine if URL is a signed/presigned URL (contains signature parameters)
    const isSignedUrl = url.includes('X-Amz-Signature') || url.includes('Signature=')

    // For public files, use Google Docs Viewer
    // For signed URLs, try Microsoft Office Online Viewer
    const getViewerUrl = (): string => {
        if (isSignedUrl) {
            // Microsoft Office Online viewer - works better with authenticated URLs
            return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
        }
        // Google Docs Viewer for public URLs
        return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
    }

    const handleError = () => {
        setViewerError(true)
    }

    // Fallback UI when viewer fails
    if (viewerError) {
        return (
            <div className="space-y-4">
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        Unable to preview this document in the browser. Please download to view.
                    </AlertDescription>
                </Alert>

                <div className="flex flex-col items-center justify-center py-12 bg-muted rounded-lg">
                    <div className="text-center mb-6">
                        <p className="text-lg font-medium">{title || 'Document'}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {mimeType || 'Office Document'}
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button asChild>
                            <a href={url} download={title}>
                                <Download className="h-4 w-4 mr-2" />
                                Download File
                            </a>
                        </Button>
                        <Button variant="outline" asChild>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open in New Tab
                            </a>
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4' : ''}`}>
            {/* Header with controls */}
            <div className={`flex items-center justify-between mb-2 ${isFullscreen ? 'mb-4' : ''}`}>
                {title && (
                    <h3 className="font-medium text-sm truncate">{title}</h3>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    <Button variant="outline" size="sm" asChild>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open
                        </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                        <a href={url} download={title}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </a>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                    >
                        {isFullscreen ? (
                            <>
                                <Minimize2 className="h-4 w-4 mr-2" />
                                Exit
                            </>
                        ) : (
                            <>
                                <Maximize2 className="h-4 w-4 mr-2" />
                                Fullscreen
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Document iframe */}
            <iframe
                src={getViewerUrl()}
                className="w-full border rounded-lg bg-white"
                style={{ height: isFullscreen ? 'calc(100vh - 80px)' : height }}
                title={title || 'Document Viewer'}
                onError={handleError}
            />
        </div>
    )
}

export default DocumentViewer
