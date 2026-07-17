'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Users, XCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiClient } from '@/lib/api-client'
import type { SmeLearnerGapDrilldown } from '@/types'

function formatDate(value: string | Date | null) {
    if (!value) return 'Not submitted'
    return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function KnowledgeGapDrilldownContent() {
    const searchParams = useSearchParams()
    const kind = searchParams.get('kind') === 'learner' ? 'learner' : 'topic'
    const topic = searchParams.get('topic') ?? ''
    const domainId = searchParams.get('domainId') ?? ''
    const userId = searchParams.get('userId') ?? ''
    const [data, setData] = useState<SmeLearnerGapDrilldown | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        const load = async () => {
            if ((kind === 'topic' && (!topic || !domainId)) || (kind === 'learner' && !userId)) {
                setError('This drill-down link is incomplete.')
                setLoading(false)
                return
            }
            try {
                setLoading(true)
                const response = kind === 'topic'
                    ? await ApiClient.getSmeLearnerGapDrilldown({ kind, topic, domainId })
                    : await ApiClient.getSmeLearnerGapDrilldown({ kind, userId })
                if (!active) return
                setData(response.data)
                setError(null)
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : 'Failed to load drill-down details')
            } finally {
                if (active) setLoading(false)
            }
        }
        void load()
        return () => { active = false }
    }, [domainId, kind, topic, userId])

    const title = data?.kind === 'topic' ? data.topic : data?.kind === 'learner' ? data.learner.name : 'Knowledge-gap drill-down'
    const subtitle = data?.kind === 'topic'
        ? `${data.domain.name} · specific missed-answer examples`
        : data?.kind === 'learner'
            ? `${data.learner.email} · scoped exam evidence`
            : 'Detailed evidence from your owned domains'

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-start gap-4">
                    <Link href="/sme#knowledge-gaps">
                        <Button variant="ghost" size="icon" aria-label="Back to knowledge gaps"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#006688]">Knowledge gaps</p>
                        <h1 className="mt-1 text-3xl font-bold">{title}</h1>
                        <p className="mt-1 text-muted-foreground">{subtitle}</p>
                    </div>
                </div>

                {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
                {loading ? (
                    <div className="flex h-52 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading evidence...</div>
                ) : data?.kind === 'topic' ? (
                    <>
                        <div className="grid gap-4 md:grid-cols-3">
                            <Metric label="Miss rate" value={`${data.answered ? Math.round((data.misses / data.answered) * 100) : 0}%`} tone="rose" />
                            <Metric label="Misses" value={String(data.misses)} />
                            <Metric label="Answered items" value={String(data.answered)} />
                        </div>
                        <Card>
                            <CardHeader><CardTitle>Missed-answer examples</CardTitle><CardDescription>Most recent graded answers that were marked incorrect for this Topic.</CardDescription></CardHeader>
                            <CardContent className="space-y-4">
                                {data.examples.length === 0 ? <Empty text="No missed-answer examples are available." /> : data.examples.map((example) => (
                                    <div key={`${example.attemptId}-${example.question}`} className="rounded-lg border bg-slate-50/60 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div><p className="font-semibold">{example.learnerName}</p><p className="text-sm text-muted-foreground">{example.learnerEmail} · {formatDate(example.submittedAt)}</p></div>
                                            <Link href={`/sme/training-ops/exams/${example.examId}`}><Button variant="outline" size="sm">{example.examTitle}<ExternalLink className="ml-2 h-3.5 w-3.5" /></Button></Link>
                                        </div>
                                        <p className="mt-4 font-medium text-slate-950">{example.question}</p>
                                        <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
                                            <div className="rounded-md border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-semibold uppercase text-rose-700">Learner answer</p><p className="mt-1 text-rose-950">{example.answer ?? (example.selectedOption === null ? 'No answer recorded' : `Selected option ${example.selectedOption + 1}`)}</p></div>
                                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase text-emerald-700">Expected answer</p><p className="mt-1 text-emerald-950">{example.correctAnswer ?? 'See Exam review'}</p></div>
                                        </div>
                                        {example.explanation ? <p className="mt-3 text-sm text-muted-foreground">{example.explanation}</p> : null}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </>
                ) : data?.kind === 'learner' ? (
                    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-[#006688]" />Weak topics</CardTitle><CardDescription>Topics this learner misses most often in your scope.</CardDescription></CardHeader>
                            <CardContent className="space-y-3">
                                {data.weakTopics.length === 0 ? <Empty text="No topic-level misses are available." /> : data.weakTopics.map((item) => (
                                    <div key={`${item.domainName}-${item.topic}`} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{item.topic}</p><p className="text-xs text-muted-foreground">{item.domainName ?? 'Unmapped Domain'} · {item.misses} misses / {item.answered} answered</p></div><Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{Math.round((item.misses / item.answered) * 100)}% miss</Badge></div>
                                ))}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-[#006688]" />Graded attempts</CardTitle><CardDescription>Up to 50 most recent attempts across your owned Domains.</CardDescription></CardHeader>
                            <CardContent>
                                {data.attempts.length === 0 ? <Empty text="No graded attempts are available in your scope." /> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-3 pr-4 font-medium">Exam</th><th className="py-3 pr-4 font-medium">Attempt</th><th className="py-3 pr-4 font-medium">Submitted</th><th className="py-3 pr-4 font-medium">Score</th><th className="py-3 font-medium">Result</th></tr></thead><tbody>{data.attempts.map((attempt) => <tr key={attempt.id} className="border-b last:border-0"><td className="py-3 pr-4"><Link href={`/sme/training-ops/exams/${attempt.examId}`} className="font-medium text-[#006688] hover:underline">{attempt.examTitle}</Link></td><td className="py-3 pr-4">#{attempt.attemptNumber}</td><td className="py-3 pr-4 text-muted-foreground">{formatDate(attempt.submittedAt)}</td><td className="py-3 pr-4">{attempt.percentageScore ?? '-'}{attempt.percentageScore === null ? '' : '%'}</td><td className="py-3">{attempt.passed === true ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />Passed</span> : attempt.passed === false ? <span className="inline-flex items-center gap-1 text-rose-700"><XCircle className="h-4 w-4" />Failed</span> : <span className="text-muted-foreground">No result</span>}</td></tr>)}</tbody></table></div>}
                            </CardContent>
                        </Card>
                    </div>
                ) : null}
            </div>
        </DashboardLayout>
    )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
    return <Card className={tone === 'rose' ? 'border-rose-200 bg-rose-50' : ''}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-3xl">{value}</CardTitle></CardHeader></Card>
}

function Empty({ text }: { text: string }) {
    return <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{text}</div>
}

export default function KnowledgeGapDrilldownPage() {
    return <Suspense fallback={null}><KnowledgeGapDrilldownContent /></Suspense>
}
