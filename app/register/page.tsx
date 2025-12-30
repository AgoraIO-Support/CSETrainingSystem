'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">Registration disabled</CardTitle>
                    <CardDescription className="text-center">
                        Your administrator must create an account for you.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-sm text-muted-foreground">
                        <p className="mb-4">Please contact your administrator to request access.</p>
                        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                            Back to login
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

