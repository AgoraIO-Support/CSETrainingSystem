'use client'

import { useState, useEffect, use } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import {
    ArrowLeft,
    Loader2,
    Award,
    Share2,
    Calendar,
    Trophy,
    User,
    FileText,
    Copy,
    Check,
    AlertCircle,
    XCircle,
    ExternalLink,
} from 'lucide-react'
import Link from 'next/link'

interface Certificate {
    id: string
    certificateNumber: string
    userId: string
    userName: string
    courseId: string | null
    courseTitle: string | null
    examId: string | null
    examTitle: string
    certificateTitle?: string | null
    score: number
    totalScore: number
    percentageScore: number
    issueDate: string
    pdfUrl: string | null
    status: 'ISSUED' | 'REVOKED'
    revokedAt?: string | null
    badgeUrl?: string | null
    badgeMode?: 'AUTO' | 'UPLOADED' | null
}

type PageProps = {
    params: Promise<{ id: string }>
}

export default function CertificateDetailPage({ params }: PageProps) {
    const { id: certificateId } = use(params)
    const [certificate, setCertificate] = useState<Certificate | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        loadCertificate()
    }, [certificateId])

    const loadCertificate = async () => {
        setLoading(true)
        try {
            const response = await ApiClient.getCertificate(certificateId)
            setCertificate(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load certificate')
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

    const copyVerificationLink = () => {
        if (!certificate) return
        const verificationUrl = `${window.location.origin}/certificates/verify/${certificate.certificateNumber}`
        navigator.clipboard.writeText(verificationUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const copyCertificateNumber = () => {
        if (!certificate) return
        navigator.clipboard.writeText(certificate.certificateNumber)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
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

    if (error || !certificate) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <p className="text-muted-foreground">{error || 'Certificate not found'}</p>
                    <Link href="/certificates">
                        <Button className="mt-4">Back to Certificates</Button>
                    </Link>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-4">
                    <Link href="/certificates">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">Certificate Details</h1>
                        <p className="text-muted-foreground mt-1">{certificate.examTitle}</p>
                    </div>
                </div>

                {certificate.status === 'REVOKED' && (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        This certificate has been revoked.
                    </div>
                )}

                {/* Certificate Preview Card */}
                <Card className="bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-900/20 dark:via-amber-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800 overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400" />
                    <CardContent className="p-8">
                        <div className="text-center">
                            <div className="flex justify-center mb-6">
                                <div className="relative">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg overflow-hidden">
                                        {certificate.badgeUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={certificate.badgeUrl} alt="Badge" className="w-full h-full object-cover" />
                                        ) : (
                                            <Award className="h-12 w-12 text-white" />
                                        )}
                                    </div>
                                    <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center ${certificate.status === 'REVOKED' ? 'bg-red-500' : 'bg-green-500'}`}>
                                        {certificate.status === 'REVOKED' ? (
                                            <XCircle className="h-5 w-5 text-white" />
                                        ) : (
                                            <Check className="h-5 w-5 text-white" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                                {certificate.certificateTitle || 'Certificate'}
                            </h2>
                            <h3 className="text-3xl font-bold text-foreground mb-4">
                                {certificate.examTitle}
                            </h3>

                            <p className="text-lg text-muted-foreground mb-2">
                                This certifies that
                            </p>
                            <p className="text-2xl font-semibold text-foreground mb-6">
                                {certificate.userName}
                            </p>

                            <div className="flex items-center justify-center gap-6 mb-6">
                                <div className="text-center">
                                    <p className="text-sm text-muted-foreground">Score</p>
                                    <p className="text-xl font-bold text-green-600">
                                        {certificate.score}/{certificate.totalScore}
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-border" />
                                <div className="text-center">
                                    <p className="text-sm text-muted-foreground">Percentage</p>
                                    <p className="text-xl font-bold text-green-600">
                                        {certificate.percentageScore.toFixed(1)}%
                                    </p>
                                </div>
                                <div className="w-px h-10 bg-border" />
                                <div className="text-center">
                                    <p className="text-sm text-muted-foreground">Issued</p>
                                    <p className="text-xl font-bold">
                                        {formatDate(certificate.issueDate)}
                                    </p>
                                </div>
                            </div>

                            <Badge variant="secondary" className="text-sm">
                                Certificate No: {certificate.certificateNumber}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Certificate Info */}
                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Recipient
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{certificate.userName}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Exam
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{certificate.examTitle}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Trophy className="h-4 w-4" />
                                Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold text-green-600">
                                {certificate.score}/{certificate.totalScore} ({certificate.percentageScore.toFixed(1)}%)
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Issue Date
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{formatDate(certificate.issueDate)}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Actions</CardTitle>
                        <CardDescription>Share and verify your certificate</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <Button variant="outline" onClick={copyCertificateNumber}>
                                {copied ? (
                                    <Check className="h-4 w-4 mr-2" />
                                ) : (
                                    <Copy className="h-4 w-4 mr-2" />
                                )}
                                Copy Certificate Number
                            </Button>

                            <Button variant="outline" onClick={copyVerificationLink}>
                                <Share2 className="h-4 w-4 mr-2" />
                                Copy Verification Link
                            </Button>
                        </div>

                        <div className="p-4 bg-muted rounded-lg">
                            <h4 className="font-medium mb-2">Verification</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                                Anyone can verify this certificate using the certificate number or verification link.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 bg-background rounded text-sm border">
                                    {certificate.certificateNumber}
                                </code>
                                <Link
                                    href={`/certificates/verify/${certificate.certificateNumber}`}
                                    target="_blank"
                                >
                                    <Button variant="ghost" size="icon">
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Back Button */}
                <div className="flex justify-center pt-4">
                    <Link href="/certificates">
                        <Button variant="outline" size="lg">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Certificates
                        </Button>
                    </Link>
                </div>
            </div>
        </DashboardLayout>
    )
}
