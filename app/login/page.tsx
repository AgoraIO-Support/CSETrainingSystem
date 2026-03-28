'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            await ApiClient.login(email, password)
            router.push('/')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f9fa] px-4 py-10">
            <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-xl shadow-[#006688]/5 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="hidden border-r border-slate-200/60 bg-slate-50 p-10 lg:flex lg:flex-col lg:justify-between">
                    <div className="space-y-6">
                        <div className="inline-flex w-fit items-center rounded-full border border-[#00c2ff]/15 bg-[#00c2ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#006688]">
                            Agora Internal Platform
                        </div>
                        <div className="space-y-4">
                            <h1 className="max-w-md text-4xl font-extrabold tracking-[-0.05em] text-foreground">
                                Concise learning operations for technical support enablement.
                            </h1>
                            <p className="max-w-lg text-base leading-8 text-muted-foreground">
                                Access weekly practice, product training, release readiness checks, and formal assessments in one structured workspace.
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-4">
                        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Designed for</p>
                            <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">Training, badges, and measurable readiness</p>
                        </div>
                        <div className="rounded-2xl border border-[#00c2ff]/10 bg-[#c2e8ff]/30 p-5 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Access model</p>
                            <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">Use your Agora credentials to continue</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8 lg:p-10">
                    <Card className="border-none bg-transparent shadow-none">
                        <CardHeader className="space-y-3 px-0 pt-0">
                            <div className="inline-flex w-fit items-center rounded-full border border-[#00c2ff]/15 bg-[#00c2ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#006688] lg:hidden">
                                Agora Internal Platform
                            </div>
                            <CardTitle className="text-3xl font-semibold tracking-[-0.05em]">Sign in</CardTitle>
                            <CardDescription className="max-w-md">
                                Enter your work credentials to access training plans, courses, and assessments.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            <form onSubmit={handleLogin} className="space-y-5">
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-sm font-semibold text-foreground">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="name@agora.io"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-sm font-semibold text-foreground">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>

                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Signing in...
                                        </>
                                    ) : (
                                        'Sign in to workspace'
                                    )}
                                </Button>

                                <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
                                    Don&apos;t have an account? Contact your administrator.
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
