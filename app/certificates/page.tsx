'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import {
    Loader2,
    Award,
    Download,
    Eye,
    Calendar,
    Trophy,
    FileCheck,
    XCircle,
} from 'lucide-react'
import Link from 'next/link'

interface Certificate {
    id: string
    certificateNumber: string
    userId: string
    userName: string
    examId: string | null
    examTitle: string
    score: number
    totalScore: number
    percentageScore: number
    issueDate: string
    pdfUrl: string | null
}

export default function CertificatesPage() {
    const [certificates, setCertificates] = useState<Certificate[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadCertificates()
    }, [])

    const loadCertificates = async () => {
        setLoading(true)
        try {
            const response = await ApiClient.getUserCertificates()
            setCertificates(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load certificates')
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (date: string | Date | null | undefined) => {
        if (!date) return '-'
        return new Date(date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
    }

    const handleDownload = (certificateId: string, certificateNumber: string) => {
        const downloadUrl = ApiClient.downloadCertificateUrl(certificateId)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = `certificate-${certificateNumber}.pdf`
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">My Certificates</h1>
                    <p className="text-muted-foreground mt-1">
                        View and download your earned certificates
                    </p>
                </div>

                {error && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Total Certificates</CardTitle>
                            <Award className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{certificates.length}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Highest Score</CardTitle>
                            <Trophy className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {certificates.length > 0
                                    ? `${Math.max(...certificates.map(c => c.percentageScore)).toFixed(1)}%`
                                    : '-'}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">Latest Certificate</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {certificates.length > 0
                                    ? formatDate(certificates[0].issueDate)
                                    : '-'}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Certificates List */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileCheck className="h-5 w-5" />
                            Earned Certificates
                        </CardTitle>
                        <CardDescription>
                            Certificates you have earned by passing exams
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {certificates.length === 0 ? (
                            <div className="text-center py-12">
                                <Award className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Certificates Yet</h3>
                                <p className="text-muted-foreground mb-4">
                                    Complete exams to earn certificates
                                </p>
                                <Link href="/exams">
                                    <Button>Browse Exams</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {certificates.map(certificate => (
                                    <div
                                        key={certificate.id}
                                        className="flex items-center justify-between p-4 border rounded-lg bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 border-yellow-200 dark:border-yellow-800"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                                                <Award className="h-6 w-6 text-yellow-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-lg">
                                                    {certificate.examTitle}
                                                </h3>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatDate(certificate.issueDate)}
                                                    </span>
                                                    <span>
                                                        Certificate: {certificate.certificateNumber}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200">
                                                {certificate.percentageScore.toFixed(1)}%
                                            </Badge>

                                            <div className="flex items-center gap-2">
                                                <Link href={`/certificates/${certificate.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        <Eye className="h-4 w-4 mr-1" />
                                                        View
                                                    </Button>
                                                </Link>
                                                {certificate.pdfUrl && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleDownload(certificate.id, certificate.certificateNumber)}
                                                    >
                                                        <Download className="h-4 w-4 mr-1" />
                                                        Download
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Verification Info */}
                <Card>
                    <CardHeader>
                        <CardTitle>Certificate Verification</CardTitle>
                        <CardDescription>
                            Employers and institutions can verify your certificates
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Each certificate has a unique certificate number that can be used to verify
                            its authenticity. Share this number or the verification link with employers
                            or institutions.
                        </p>
                        <Link href="/certificates/verify">
                            <Button variant="outline">
                                Go to Verification Page
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
