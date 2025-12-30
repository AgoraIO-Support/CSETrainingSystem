'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ApiClient } from '@/lib/api-client'
import {
    Loader2,
    Award,
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
}

export default function CertificatesPage() {
    const [certificates, setCertificates] = useState<Certificate[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ISSUED' | 'REVOKED'>('ALL')

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

    const filteredCertificates = certificates.filter((certificate) => {
        if (statusFilter !== 'ALL' && certificate.status !== statusFilter) return false

        const query = search.trim().toLowerCase()
        if (!query) return true

        const title = (certificate.certificateTitle || certificate.examTitle || '').toLowerCase()
        const secondary = (certificate.courseTitle || '').toLowerCase()
        const number = (certificate.certificateNumber || '').toLowerCase()
        return title.includes(query) || secondary.includes(query) || number.includes(query)
    })

    const highestExamPercentage = certificates
        .filter((c) => c.status !== 'REVOKED' && c.examId)
        .reduce((max, c) => Math.max(max, c.percentageScore || 0), 0)

    const latestIssued = certificates
        .filter((c) => c.status !== 'REVOKED')
        .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())[0]

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
                                {certificates.length > 0 ? `${highestExamPercentage.toFixed(1)}%` : '-'}
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
                                {latestIssued ? formatDate(latestIssued.issueDate) : '-'}
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
                            Certificates you have earned by passing exams or completing courses
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {certificates.length === 0 ? (
                            <div className="text-center py-12">
                                <Award className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Certificates Yet</h3>
                                <p className="text-muted-foreground mb-4">
                                    Complete exams or courses to earn certificates
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <Link href="/exams">
                                        <Button>Browse Exams</Button>
                                    </Link>
                                    <Link href="/courses">
                                        <Button variant="outline">Browse Courses</Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                                        <Input
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search by title or certificate number..."
                                            className="md:w-[320px]"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setStatusFilter('ALL')}
                                            >
                                                All
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={statusFilter === 'ISSUED' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setStatusFilter('ISSUED')}
                                            >
                                                Issued
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={statusFilter === 'REVOKED' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setStatusFilter('REVOKED')}
                                            >
                                                Revoked
                                            </Button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Showing {filteredCertificates.length} of {certificates.length}
                                    </p>
                                </div>

                                {filteredCertificates.map(certificate => (
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
                                                    {certificate.certificateTitle || certificate.examTitle}
                                                </h3>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatDate(certificate.issueDate)}
                                                    </span>
                                                    <span>
                                                        Certificate: {certificate.certificateNumber}
                                                    </span>
                                                    <Badge variant="outline">
                                                        {certificate.examId ? 'Exam' : 'Course'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <Badge className={certificate.status === 'REVOKED'
                                                ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200'
                                                : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200'}>
                                                {certificate.status === 'REVOKED'
                                                    ? 'Revoked'
                                                    : certificate.examId
                                                        ? `${certificate.percentageScore.toFixed(1)}%`
                                                        : 'Issued'}
                                            </Badge>

                                            <div className="flex items-center gap-2">
                                                <Link href={`/certificates/${certificate.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        <Eye className="h-4 w-4 mr-1" />
                                                        View
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {filteredCertificates.length === 0 && (
                                    <div className="text-center py-12 text-muted-foreground">
                                        No certificates match your filters.
                                    </div>
                                )}
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
