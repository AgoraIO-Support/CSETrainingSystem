'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Download,
    ExternalLink,
    Video,
    FileText,
    FileSpreadsheet,
    File,
    Music,
    FileType,
    X
} from 'lucide-react'
import { VideoJSPlayer } from '@/components/video/videojs-player'
import { PDFViewer } from './pdf-viewer'
import { DocumentViewer } from './document-viewer'
import { TextViewer } from './text-viewer'
import type { CourseAsset } from '@/types'

interface AssetViewerProps {
    asset: CourseAsset
    onTimeUpdate?: (time: number) => void
    onVideoEnded?: () => void
    initialTime?: number
    onClose?: () => void
}

// Helper functions to determine file type
function isPDF(mimeType: string | null | undefined, url: string): boolean {
    return mimeType === 'application/pdf' || url.toLowerCase().endsWith('.pdf')
}

function isOfficeDocument(mimeType: string | null | undefined, url: string): boolean {
    const officeTypes = [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
    const officeExtensions = ['.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx']

    return officeTypes.includes(mimeType || '') ||
        officeExtensions.some(ext => url.toLowerCase().endsWith(ext))
}

function isVideo(type: string | undefined, mimeType: string | null | undefined): boolean {
    return type === 'VIDEO' || mimeType?.startsWith('video/') || false
}

function isAudio(type: string | undefined, mimeType: string | null | undefined): boolean {
    return type === 'AUDIO' || mimeType?.startsWith('audio/') || false
}

function isText(type: string | undefined, mimeType: string | null | undefined, url: string): boolean {
    const textExtensions = ['.txt', '.md', '.json', '.xml', '.csv', '.log']
    return type === 'TEXT' ||
        mimeType?.startsWith('text/') ||
        textExtensions.some(ext => url.toLowerCase().endsWith(ext))
}

function getAssetIcon(type: string | undefined) {
    switch (type) {
        case 'VIDEO':
            return <Video className="h-5 w-5" />
        case 'DOCUMENT':
            return <FileText className="h-5 w-5" />
        case 'PRESENTATION':
            return <FileSpreadsheet className="h-5 w-5" />
        case 'AUDIO':
            return <Music className="h-5 w-5" />
        case 'TEXT':
            return <FileType className="h-5 w-5" />
        default:
            return <File className="h-5 w-5" />
    }
}

export function AssetViewer({
    asset,
    onTimeUpdate,
    onVideoEnded,
    initialTime = 0,
    onClose
}: AssetViewerProps) {
    const assetUrl = asset.cloudfrontUrl || asset.url
    const mimeType = asset.mimeType || asset.contentType

    // Render video content
    if (isVideo(asset.type, mimeType)) {
        return (
            <div className="space-y-4">
                <VideoJSPlayer
                    videoUrl={assetUrl}
                    onTimeUpdate={onTimeUpdate}
                    onEnded={onVideoEnded}
                    initialTime={initialTime}
                />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {getAssetIcon(asset.type)}
                        <span className="font-medium">{asset.title}</span>
                        <Badge variant="secondary">{asset.type}</Badge>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <a href={assetUrl} download={asset.title}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                        </a>
                    </Button>
                </div>
            </div>
        )
    }

    // Render PDF content
    if (isPDF(mimeType, assetUrl)) {
        return (
            <div className="space-y-2">
                {onClose && (
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="h-4 w-4 mr-1" />
                            Back to Video
                        </Button>
                    </div>
                )}
                <PDFViewer url={assetUrl} title={asset.title} />
            </div>
        )
    }

    // Render Office documents (PPT, DOC, DOCX, XLS, XLSX)
    if (isOfficeDocument(mimeType, assetUrl)) {
        return (
            <div className="space-y-2">
                {onClose && (
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="h-4 w-4 mr-1" />
                            Back to Video
                        </Button>
                    </div>
                )}
                <DocumentViewer url={assetUrl} title={asset.title} mimeType={mimeType || undefined} />
            </div>
        )
    }

    // Render text files
    if (isText(asset.type, mimeType, assetUrl)) {
        return (
            <div className="space-y-2">
                {onClose && (
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="h-4 w-4 mr-1" />
                            Back to Video
                        </Button>
                    </div>
                )}
                <TextViewer url={assetUrl} title={asset.title} />
            </div>
        )
    }

    // Render audio files
    if (isAudio(asset.type, mimeType)) {
        return (
            <div className="space-y-2">
                {onClose && (
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="h-4 w-4 mr-1" />
                            Back to Video
                        </Button>
                    </div>
                )}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {getAssetIcon(asset.type)}
                                <CardTitle className="text-lg">{asset.title}</CardTitle>
                                <Badge variant="secondary">AUDIO</Badge>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <a href={assetUrl} download={asset.title}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                </a>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <audio
                            controls
                            className="w-full"
                            src={assetUrl}
                        >
                            Your browser does not support the audio element.
                        </audio>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Fallback: Download-only for unsupported types
    return (
        <div className="space-y-2">
            {onClose && (
                <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4 mr-1" />
                        Back to Video
                    </Button>
                </div>
            )}
            <Card>
                <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                        {getAssetIcon(asset.type)}
                        <h3 className="mt-4 font-medium text-lg">{asset.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {asset.description || 'Preview not available for this file type'}
                        </p>
                        <Badge variant="secondary" className="mt-2">
                            {asset.type || 'FILE'}
                        </Badge>

                        <div className="flex gap-3 mt-6">
                            <Button asChild>
                                <a href={assetUrl} download={asset.title}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download File
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href={assetUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open in New Tab
                                </a>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default AssetViewer
