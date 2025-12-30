'use client'

import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
    return (
        <DashboardLayout>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                    <CardDescription>
                        Account and app preferences.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This page is not configured yet. Use Profile for now.
                    </p>
                    <Button asChild variant="outline">
                        <Link href="/profile">Go to Profile</Link>
                    </Button>
                </CardContent>
            </Card>
        </DashboardLayout>
    )
}

