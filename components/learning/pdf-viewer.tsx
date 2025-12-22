'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, Download, ExternalLink } from 'lucide-react'

interface PDFViewerProps {
    url: string
    title?: string
    height?: string
}

export function PDFViewer({ url, title, height = '600px' }: PDFViewerProps) {
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Use browser's native PDF viewer via iframe
    // This works in most modern browsers (Chrome, Firefox, Edge, Safari)
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
                        <a href={url} download={title || 'document.pdf'}>
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
                                Exit Fullscreen
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

            {/* PDF iframe */}
            <iframe
                src={`${url}#toolbar=1&navpanes=1&scrollbar=1`}
                className="w-full border rounded-lg bg-white"
                style={{ height: isFullscreen ? 'calc(100vh - 80px)' : height }}
                title={title || 'PDF Viewer'}
            />
        </div>
    )
}

export default PDFViewer
