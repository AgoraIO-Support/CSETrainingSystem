import type { ComponentType, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

type IconType = ComponentType<{ className?: string }>

const toneStyles = {
    neutral: {
        frame: 'border-slate-200 bg-white',
        icon: 'border-slate-200 bg-slate-50 text-[#006688]',
        accent: 'bg-[#006688]',
    },
    positive: {
        frame: 'border-emerald-200 bg-emerald-50/35',
        icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        accent: 'bg-emerald-500',
    },
    warning: {
        frame: 'border-amber-200 bg-amber-50/35',
        icon: 'border-amber-200 bg-amber-50 text-amber-700',
        accent: 'bg-amber-500',
    },
    risk: {
        frame: 'border-rose-200 bg-rose-50/35',
        icon: 'border-rose-200 bg-rose-50 text-rose-700',
        accent: 'bg-rose-500',
    },
} as const

export function OpsHero({
    eyebrow,
    title,
    description,
    scope,
    meta,
    actions,
}: {
    eyebrow: string
    title: string
    description: string
    scope: string
    meta?: string
    actions?: ReactNode
}) {
    return (
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[#071c24] text-white shadow-[0_24px_70px_-42px_rgba(2,33,45,0.8)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(0,194,255,0.24),transparent_30%),linear-gradient(115deg,transparent_55%,rgba(255,255,255,0.04)_55%)]" />
            <div className="absolute inset-y-0 right-[18%] w-px bg-white/10" />
            <div className="relative grid gap-6 p-6 md:p-8 xl:grid-cols-[1fr_auto] xl:items-end">
                <div className="max-w-4xl space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 hover:bg-white/10">
                            {eyebrow}
                        </Badge>
                        <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-50">
                            Scope · {scope}
                        </Badge>
                        {meta ? (
                            <span className="text-xs text-slate-300">{meta}</span>
                        ) : null}
                    </div>
                    <div>
                        <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                            {title}
                        </h1>
                        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                            {description}
                        </p>
                    </div>
                </div>
                {actions ? <div className="flex flex-wrap gap-2 xl:justify-end">{actions}</div> : null}
            </div>
        </section>
    )
}

export function SignalCard({
    label,
    value,
    denominator,
    hint,
    icon: Icon,
    tone = 'neutral',
}: {
    label: string
    value: string | number
    denominator?: string
    hint: string
    icon: IconType
    tone?: keyof typeof toneStyles
}) {
    const styles = toneStyles[tone]

    return (
        <Card className={`relative overflow-hidden shadow-sm ${styles.frame}`}>
            <span className={`absolute inset-x-0 top-0 h-1 ${styles.accent}`} />
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 pt-6">
                <div>
                    <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {label}
                    </CardDescription>
                    <div className="mt-3 flex items-baseline gap-2">
                        <CardTitle className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                            {value}
                        </CardTitle>
                        {denominator ? <span className="whitespace-nowrap text-sm font-medium text-slate-400">{denominator}</span> : null}
                    </div>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm leading-6 text-slate-600">{hint}</p>
            </CardContent>
        </Card>
    )
}

export interface FunnelStep {
    label: string
    value: number
    note?: string
}

export function FunnelCard({
    title,
    description,
    steps,
    icon: Icon,
    emptyMessage,
}: {
    title: string
    description: string
    steps: FunnelStep[]
    icon: IconType
    emptyMessage?: string
}) {
    const total = steps[0]?.value ?? 0

    return (
        <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-xl text-slate-950">{title}</CardTitle>
                        <CardDescription className="mt-1 leading-6 text-slate-500">{description}</CardDescription>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#006688]">
                        <Icon className="h-5 w-5" />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {total === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm leading-6 text-slate-500">
                        {emptyMessage ?? 'No records are available for this period.'}
                    </div>
                ) : (
                    <div className="space-y-5">
                        {steps.map((step, index) => {
                            const progress = Math.round((step.value / total) * 100)
                            return (
                                <div key={step.label}>
                                    <div className="mb-2 flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">
                                                <span className="mr-2 text-xs text-slate-400">0{index + 1}</span>
                                                {step.label}
                                            </p>
                                            {step.note ? <p className="mt-1 text-xs text-slate-500">{step.note}</p> : null}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-semibold text-slate-950">{step.value}</p>
                                            <p className="text-[11px] text-slate-400">{progress}% of entry</p>
                                        </div>
                                    </div>
                                    <Progress value={progress} className="h-2 bg-slate-100" />
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export function SectionHeading({
    eyebrow,
    title,
    description,
    action,
}: {
    eyebrow?: string
    title: string
    description?: string
    action?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                {eyebrow ? (
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#006688]">{eyebrow}</p>
                ) : null}
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-slate-950 md:text-3xl">{title}</h2>
                {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
            </div>
            {action}
        </div>
    )
}
