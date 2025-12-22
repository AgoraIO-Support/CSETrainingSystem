'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Search,
    Shield,
    Award,
    CheckCircle,
} from 'lucide-react'
import Link from 'next/link'

export default function CertificateVerifySearchPage() {
    const router = useRouter()
    const [certificateNumber, setCertificateNumber] = useState('')
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        const trimmed = certificateNumber.trim()
        if (!trimmed) {
            setError('Please enter a certificate number')
            return
        }

        // Validate format (CSE-YYYY-XXXXX)
        const pattern = /^CSE-\d{4}-[A-Z0-9]{5}$/i
        if (!pattern.test(trimmed)) {
            setError('Invalid certificate number format. Expected: CSE-YYYY-XXXXX')
            return
        }

        router.push(`/certificates/verify/${encodeURIComponent(trimmed.toUpperCase())}`)
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
                    {/* Hero Section */}
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
                            <Shield className="h-10 w-10 text-primary" />
                        </div>
                        <h1 className="text-4xl font-bold mb-4">
                            Certificate Verification
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                            Verify the authenticity of certificates issued by CSE Training System.
                            Enter the certificate number to check if it is valid.
                        </p>
                    </div>

                    {/* Verification Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Search className="h-5 w-5" />
                                Verify Certificate
                            </CardTitle>
                            <CardDescription>
                                Enter the certificate number to verify its authenticity
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="certificateNumber">Certificate Number</Label>
                                    <Input
                                        id="certificateNumber"
                                        placeholder="CSE-2025-XXXXX"
                                        value={certificateNumber}
                                        onChange={(e) => {
                                            setCertificateNumber(e.target.value.toUpperCase())
                                            setError(null)
                                        }}
                                        className="text-center text-lg font-mono"
                                    />
                                    {error && (
                                        <p className="text-sm text-destructive">{error}</p>
                                    )}
                                    <p className="text-sm text-muted-foreground">
                                        Certificate numbers are in the format: CSE-YYYY-XXXXX
                                    </p>
                                </div>

                                <Button type="submit" className="w-full" size="lg">
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Verify Certificate
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Info Section */}
                    <div className="mt-8 grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center">
                                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-3">
                                        <Shield className="h-6 w-6 text-green-600" />
                                    </div>
                                    <h3 className="font-semibold mb-1">Secure</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Each certificate has a unique number
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center">
                                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle className="h-6 w-6 text-blue-600" />
                                    </div>
                                    <h3 className="font-semibold mb-1">Instant</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Verification results in seconds
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center">
                                    <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-3">
                                        <Award className="h-6 w-6 text-purple-600" />
                                    </div>
                                    <h3 className="font-semibold mb-1">Official</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Issued by CSE Training System
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
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
