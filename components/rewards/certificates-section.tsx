'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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

export function CertificatesSection() {
    const [certificates, setCertificates] = useState<Certificate[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ISSUED' | 'REVOKED'>('ALL')

    useEffect(() => {
        const loadCertificates = async () => {
            setLoading(true)
            try {
                const response = await ApiClient.getUserCertificates()
                setCertificates(response.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load certificates')
            } finally {
                setLoading(false)
            }
        }

        void loadCertificates()
    }, [])

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
        .filter((certificate) => certificate.status !== 'REVOKED' && certificate.examId)
        .reduce((max, certificate) => Math.max(max, certificate.percentageScore || 0), 0)

    const latestIssued = certificates
        .filter((certificate) => certificate.status !== 'REVOKED')
        .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())[0]

    return (
        <section id="certificates" className="space-y-6 scroll-mt-24">
            <div>
                <h2 className="text-2xl font-bold">Certificates</h2>
                <p className="mt-1 text-muted-foreground">
                    Formal recognition earned from qualifying assessments.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading certificates...
                </div>
            ) : (
                <>
                    {error ? (
                        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
                            <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4" />
                                {error}
                            </div>
                        </div>
                    ) : null}

                    <Card>
                        <CardHeader>
                            <CardTitle>Certificate Policy</CardTitle>
                            <CardDescription>Certificates stay inside the same recognition surface as stars and badges.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                            <div className="rounded-lg border p-3">
                                <p className="font-medium text-foreground">Formal only</p>
                                <p className="mt-1">Certificates are intended for formal assessments, quarterly finals, or year-end exams.</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="font-medium text-foreground">Pass required</p>
                                <p className="mt-1">A certificate is only issued when the learner passes and the exam has certificate-on-pass enabled.</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="font-medium text-foreground">Practice stays separate</p>
                                <p className="mt-1">Weekly drills and readiness quizzes may award stars and badges, but they do not automatically issue certificates.</p>
                            </div>
                        </CardContent>
                    </Card>

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

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileCheck className="h-5 w-5" />
                                Earned Certificates
                            </CardTitle>
                            <CardDescription>
                                Certificates you have earned by passing exams or completing courses.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {certificates.length === 0 ? (
                                <div className="py-12 text-center">
                                    <Award className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                                    <h3 className="mb-2 text-lg font-semibold">No Certificates Yet</h3>
                                    <p className="mb-4 text-muted-foreground">
                                        Complete formal assessments to earn certificates.
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
                                                onChange={(event) => setSearch(event.target.value)}
                                                placeholder="Search by title or certificate number..."
                                                className="md:w-[320px]"
                                            />
                                            <div className="flex items-center gap-2">
                                                <Button type="button" variant={statusFilter === 'ALL' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('ALL')}>
                                                    All
                                                </Button>
                                                <Button type="button" variant={statusFilter === 'ISSUED' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('ISSUED')}>
                                                    Issued
                                                </Button>
                                                <Button type="button" variant={statusFilter === 'REVOKED' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('REVOKED')}>
                                                    Revoked
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Showing {filteredCertificates.length} of {certificates.length}
                                        </p>
                                    </div>

                                    {filteredCertificates.map((certificate) => (
                                        <div
                                            key={certificate.id}
                                            className="flex items-center justify-between rounded-lg border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 p-4"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                                                    <Award className="h-6 w-6 text-yellow-600" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-semibold">
                                                        {certificate.certificateTitle || certificate.examTitle}
                                                    </h3>
                                                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {formatDate(certificate.issueDate)}
                                                        </span>
                                                        <span>Certificate: {certificate.certificateNumber}</span>
                                                        <Badge variant="outline">
                                                            {certificate.examId ? 'Exam' : 'Course'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <Badge className={certificate.status === 'REVOKED' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                                                    {certificate.status === 'REVOKED'
                                                        ? 'Revoked'
                                                        : certificate.examId
                                                            ? `${certificate.percentageScore.toFixed(1)}%`
                                                            : 'Issued'}
                                                </Badge>

                                                <Link href={`/certificates/${certificate.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        <Eye className="mr-1 h-4 w-4" />
                                                        View
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    ))}

                                    {filteredCertificates.length === 0 ? (
                                        <div className="py-12 text-center text-muted-foreground">
                                            No certificates match your filters.
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Certificate Verification</CardTitle>
                            <CardDescription>
                                Employers and institutions can verify your certificates.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="mb-4 text-sm text-muted-foreground">
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
                </>
            )}
        </section>
    )
}
