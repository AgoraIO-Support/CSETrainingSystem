'use client'

import { useState, useEffect, use } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiClient } from '@/lib/api-client'
import {
    Loader2,
    Award,
    CheckCircle,
    XCircle,
    Calendar,
    User,
    FileText,
    ArrowLeft,
    Shield,
    AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'

interface VerificationResult {
    valid: boolean
    message?: string
    certificate?: {
        certificateNumber: string
        userName: string
        examTitle: string
        issueDate: string
        percentageScore: number
    }
}

type PageProps = {
    params: Promise<{ number: string }>
}

export default function CertificateVerifyResultPage({ params }: PageProps) {
    const { number: certificateNumber } = use(params)
    const [result, setResult] = useState<VerificationResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        verifyC()
    }, [certificateNumber])

    const verifyC = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await ApiClient.verifyCertificate(decodeURIComponent(certificateNumber))
            setResult(response.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to verify certificate')
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

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
            {/* Header */}
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <Award className="h-6 w-6 text-primary" />
                        <span className="font-bold text-xl">CSE Training</span>
                    </Link>
                    <Link href="/login">
                        <Button variant="outline">Sign In</Button>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-12">
                <div className="max-w-2xl mx-auto">
                    {/* Back Link */}
                    <Link href="/certificates/verify" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Verification
                    </Link>

                    {/* Loading State */}
                    {loading && (
                        <Card>
                            <CardContent className="py-12">
                                <div className="flex flex-col items-center justify-center">
                                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                                    <p className="text-lg text-muted-foreground">Verifying certificate...</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Certificate: {decodeURIComponent(certificateNumber)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <Card className="border-destructive">
                            <CardContent className="py-12">
                                <div className="flex flex-col items-center justify-center text-center">
                                    <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                                        <AlertTriangle className="h-10 w-10 text-destructive" />
                                    </div>
                                    <h2 className="text-2xl font-bold mb-2">Verification Error</h2>
                                    <p className="text-muted-foreground mb-4">{error}</p>
                                    <Button onClick={verifyC}>
                                        Try Again
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Valid Certificate */}
                    {!loading && !error && result?.valid && result.certificate && (
                        <>
                            <Card className="border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                                <CardContent className="py-8">
                                    <div className="flex flex-col items-center justify-center text-center">
                                        <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4 relative">
                                            <Shield className="h-12 w-12 text-green-600" />
                                            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                                                <CheckCircle className="h-5 w-5 text-white" />
                                            </div>
                                        </div>
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 mb-4">
                                            <CheckCircle className="h-3 w-3 mr-1" />
                                            Valid Certificate
                                        </Badge>
                                        <h2 className="text-2xl font-bold text-green-700 dark:text-green-300 mb-2">
                                            Certificate Verified
                                        </h2>
                                        <p className="text-muted-foreground">
                                            This certificate is authentic and was issued by CSE Training System.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Certificate Details */}
                            <Card className="mt-6">
                                <CardHeader>
                                    <CardTitle>Certificate Details</CardTitle>
                                    <CardDescription>
                                        Information about this certificate
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                                            <Award className="h-5 w-5 text-muted-foreground mt-0.5" />
                                            <div>
                                                <p className="text-sm text-muted-foreground">Certificate Number</p>
                                                <p className="font-semibold font-mono">
                                                    {result.certificate.certificateNumber}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                                            <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                                            <div>
                                                <p className="text-sm text-muted-foreground">Recipient</p>
                                                <p className="font-semibold">{result.certificate.userName}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                                            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                                            <div>
                                                <p className="text-sm text-muted-foreground">Exam</p>
                                                <p className="font-semibold">{result.certificate.examTitle}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                                            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                                            <div>
                                                <p className="text-sm text-muted-foreground">Issue Date</p>
                                                <p className="font-semibold">
                                                    {formatDate(result.certificate.issueDate)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                        <div className="text-center">
                                            <p className="text-sm text-muted-foreground">Score Achieved</p>
                                            <p className="text-3xl font-bold text-green-600">
                                                {result.certificate.percentageScore.toFixed(1)}%
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* Invalid Certificate */}
                    {!loading && !error && result && !result.valid && (
                        <Card className="border-red-500 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20">
                            <CardContent className="py-12">
                                <div className="flex flex-col items-center justify-center text-center">
                                    <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                                        <XCircle className="h-12 w-12 text-red-600" />
                                    </div>
                                    <Badge variant="destructive" className="mb-4">
                                        <XCircle className="h-3 w-3 mr-1" />
                                        Invalid Certificate
                                    </Badge>
                                    <h2 className="text-2xl font-bold text-red-700 dark:text-red-300 mb-2">
                                        Certificate Not Found
                                    </h2>
                                    <p className="text-muted-foreground mb-4 max-w-md">
                                        The certificate number <code className="px-2 py-1 bg-muted rounded font-mono">
                                            {decodeURIComponent(certificateNumber)}
                                        </code> was not found in our records.
                                    </p>
                                    <p className="text-sm text-muted-foreground mb-6">
                                        Please check the certificate number and try again. If you believe this is an error,
                                        please contact support.
                                    </p>
                                    <Link href="/certificates/verify">
                                        <Button>
                                            <ArrowLeft className="h-4 w-4 mr-2" />
                                            Try Another Number
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Additional Info */}
                    {!loading && !error && result?.valid && (
                        <Card className="mt-6">
                            <CardContent className="py-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                        <Shield className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold mb-1">About This Verification</h3>
                                        <p className="text-sm text-muted-foreground">
                                            This verification confirms that the certificate was legitimately issued by
                                            CSE Training System. The recipient successfully completed the exam with the
                                            score shown above. For any questions about this certificate, please contact
                                            our support team.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t mt-12">
                <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
                    <p>&copy; {new Date().getFullYear()} CSE Training System. All rights reserved.</p>
                </div>
            </footer>
        </div>
    )
}
