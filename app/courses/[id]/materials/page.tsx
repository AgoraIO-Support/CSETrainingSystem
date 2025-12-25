'use client'

import { use, useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { ApiClient } from '@/lib/api-client'
import type { Course, CourseAsset } from '@/types'
import { CloudFrontPlayer } from '@/components/video/cloudfront-player'

export default function CourseMaterialsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [course, setCourse] = useState<(Course & { assets?: CourseAsset[] }) | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        const fetchData = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await ApiClient.getCourse(id)
                if (!cancelled) {
                    setCourse(response.data)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load materials')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        const requestCfCookie = async () => {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
            if (!token) return
            try {
                // Call the Next.js API proxy so the browser never talks to the Fastify backend directly.
                await fetch(`/api/materials/${id}/cf-cookie`, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    credentials: 'include',
                })
            } catch (err) {
                console.error('Failed to obtain CloudFront cookie', err)
            }
        }

        fetchData()
        requestCfCookie()

        return () => {
            cancelled = true
        }
    }, [id])

    const videos = course?.assets?.filter(asset => asset.type === 'VIDEO') ?? []
    const docs = course?.assets?.filter(asset => asset.type !== 'VIDEO') ?? []

    return (
        <DashboardLayout>
            {loading ? (
                <div className="flex h-[60vh] flex-col items-center justify-center space-y-3 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p>Loading training materials…</p>
                </div>
            ) : error ? (
                <Alert variant="destructive" className="max-w-2xl">
                    <AlertTitle>Unable to load materials</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : course && (videos.length > 0 || docs.length > 0) ? (
                <div className="space-y-6">
                    {videos.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Videos</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {videos.map(video => (
                                    <div key={video.id}>
                                        <p className="mb-2 font-semibold">{video.title}</p>
                                        <CloudFrontPlayer src={video.url} />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {docs.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Documents</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {docs.map(doc => (
                                        <li key={doc.id}>
                                            <a
                                                className="text-primary underline"
                                                href={doc.url}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {doc.title}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ) : (
                <Alert className="max-w-2xl">
                    <AlertTitle>No materials yet</AlertTitle>
                    <AlertDescription>
                        The instructor hasn&apos;t published downloadable assets for this course. Check back soon.
                    </AlertDescription>
                </Alert>
            )}
        </DashboardLayout>
    )
}
