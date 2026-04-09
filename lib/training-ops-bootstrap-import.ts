import { z } from 'zod'
import {
    importTrainingOpsDomains,
    type TrainingOpsDomainImportPayload,
    type TrainingOpsDomainImportSummary,
} from '@/lib/training-ops-domain-import'
import {
    importTrainingOpsLearningSeries,
    type TrainingOpsLearningSeriesImportPayload,
    type TrainingOpsLearningSeriesImportSummary,
} from '@/lib/training-ops-series-import'
import {
    importTrainingOpsBadgeMilestones,
    type TrainingOpsBadgeImportPayload,
    type TrainingOpsBadgeImportSummary,
} from '@/lib/training-ops-badge-import'

const bootstrapImportSchema = z.object({
    version: z.number().int().positive(),
    scopeModel: z.string().trim().min(1),
    domains: z.unknown(),
    series: z.unknown(),
    badges: z.unknown(),
})

export type TrainingOpsBootstrapImportPayload = z.infer<typeof bootstrapImportSchema>

export interface TrainingOpsBootstrapImportSummary {
    version: number
    scopeModel: string
    dryRun: boolean
    totals: {
        sections: number
        items: number
        processed: number
    }
    domains: TrainingOpsDomainImportSummary
    series: TrainingOpsLearningSeriesImportSummary
    badges: TrainingOpsBadgeImportSummary
}

export function parseTrainingOpsBootstrapImportPayload(input: unknown): TrainingOpsBootstrapImportPayload {
    return bootstrapImportSchema.parse(input)
}

export async function importTrainingOpsBootstrap(
    input: unknown,
    options: { apply: boolean }
): Promise<TrainingOpsBootstrapImportSummary> {
    const payload = parseTrainingOpsBootstrapImportPayload(input)

    const domains = await importTrainingOpsDomains(payload.domains as TrainingOpsDomainImportPayload, options)
    const series = await importTrainingOpsLearningSeries(payload.series as TrainingOpsLearningSeriesImportPayload, options)
    const badges = await importTrainingOpsBadgeMilestones(payload.badges as TrainingOpsBadgeImportPayload, options)

    return {
        version: payload.version,
        scopeModel: payload.scopeModel,
        dryRun: !options.apply,
        totals: {
            sections: 3,
            items: domains.totals.items + series.totals.items + badges.totals.items,
            processed: domains.totals.processed + series.totals.processed + badges.totals.processed,
        },
        domains,
        series,
        badges,
    }
}
