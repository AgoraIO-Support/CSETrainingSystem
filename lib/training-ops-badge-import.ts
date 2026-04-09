import { z } from 'zod'
import prisma from '@/lib/prisma'

const badgeScopes = ['SERIES', 'GLOBAL', 'DOMAIN'] as const
const badgeLevels = ['READY', 'PRACTITIONER', 'TROUBLESHOOTER', 'DOMAIN_SPECIALIST'] as const

const badgeSeedItemSchema = z.object({
    scope: z.enum(badgeScopes),
    learningSeriesSlug: z.string().trim().min(1).optional(),
    learningSeriesName: z.string().trim().min(1).optional(),
    domainSlug: z.string().trim().min(1).optional(),
    level: z.enum(badgeLevels),
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    description: z.string().trim().optional(),
    thresholdStars: z.number().int().min(1).max(1000),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
})

const badgeSeedFileSchema = z.object({
    version: z.number().int().positive(),
    scopeModel: z.string().trim().min(1),
    activeSeries: z.array(z.string().trim().min(1)).default([]),
    items: z.array(badgeSeedItemSchema).min(1),
})

export type TrainingOpsBadgeImportPayload = z.infer<typeof badgeSeedFileSchema>

export interface TrainingOpsBadgeImportItemSummary {
    slug: string
    name: string
    scope: (typeof badgeScopes)[number]
    learningSeriesSlug?: string | null
    domainSlug?: string | null
    thresholdStars: number
    action: 'plan' | 'upserted'
}

export interface TrainingOpsBadgeImportSummary {
    version: number
    scopeModel: string
    activeSeries: string[]
    dryRun: boolean
    totals: {
        items: number
        processed: number
    }
    items: TrainingOpsBadgeImportItemSummary[]
}

export function parseTrainingOpsBadgeImportPayload(input: unknown): TrainingOpsBadgeImportPayload {
    return badgeSeedFileSchema.parse(input)
}

export async function importTrainingOpsBadgeMilestones(
    input: unknown,
    options: { apply: boolean }
): Promise<TrainingOpsBadgeImportSummary> {
    const payload = parseTrainingOpsBadgeImportPayload(input)

    const uniqueSeriesSlugs = [...new Set(payload.items.map((item) => item.learningSeriesSlug).filter(Boolean))] as string[]
    const uniqueSeriesNames = [...new Set(payload.items.map((item) => item.learningSeriesName).filter(Boolean))] as string[]
    const uniqueDomainSlugs = [...new Set(payload.items.map((item) => item.domainSlug).filter(Boolean))] as string[]

    const [seriesRows, domainRows] = await Promise.all([
        uniqueSeriesSlugs.length > 0 || uniqueSeriesNames.length > 0
            ? prisma.learningSeries.findMany({
                  where: {
                      OR: [
                          ...(uniqueSeriesSlugs.length > 0 ? [{ slug: { in: uniqueSeriesSlugs } }] : []),
                          ...(uniqueSeriesNames.length > 0 ? [{ name: { in: uniqueSeriesNames } }] : []),
                      ],
                  },
                  select: { id: true, slug: true, name: true },
              })
            : Promise.resolve([]),
        uniqueDomainSlugs.length > 0
            ? prisma.productDomain.findMany({
                  where: { slug: { in: uniqueDomainSlugs } },
                  select: { id: true, slug: true },
              })
            : Promise.resolve([]),
    ])

    const seriesBySlug = new Map(seriesRows.map((row) => [row.slug, row]))
    const seriesByName = new Map(seriesRows.map((row) => [row.name, row]))
    const domainsBySlug = new Map(domainRows.map((row) => [row.slug, row]))

    const missingSeries = payload.items
        .filter((item) => item.scope === 'SERIES')
        .filter((item) => {
            const bySlug = item.learningSeriesSlug ? seriesBySlug.get(item.learningSeriesSlug) : null
            const byName = item.learningSeriesName ? seriesByName.get(item.learningSeriesName) : null
            return !bySlug && !byName
        })
        .map((item) => item.learningSeriesSlug || item.learningSeriesName || item.slug)
    const uniqueMissingSeries = [...new Set(missingSeries)]
    if (uniqueMissingSeries.length > 0) {
        throw new Error(
            `Missing Learning Series for import entries: ${uniqueMissingSeries.join(', ')}. Create those Learning Series first, then retry the import.`
        )
    }

    const missingDomains = uniqueDomainSlugs.filter((slug) => !domainsBySlug.has(slug))
    if (missingDomains.length > 0) {
        throw new Error(`Missing Product Domains for slugs: ${missingDomains.join(', ')}`)
    }

    const summaries: TrainingOpsBadgeImportItemSummary[] = []

    for (const item of payload.items) {
        const learningSeries =
            (item.learningSeriesSlug ? seriesBySlug.get(item.learningSeriesSlug) : null) ??
            (item.learningSeriesName ? seriesByName.get(item.learningSeriesName) : null) ??
            null
        const domain = item.domainSlug ? domainsBySlug.get(item.domainSlug) ?? null : null

        const data = {
            name: item.name,
            slug: item.slug,
            description: item.description ?? null,
            icon: item.level,
            thresholdStars: item.thresholdStars,
            active: item.active ?? true,
            learningSeriesId: item.scope === 'SERIES' ? (learningSeries?.id ?? null) : null,
            domainId: item.scope === 'DOMAIN' ? (domain?.id ?? null) : null,
        }

        if (options.apply) {
            await prisma.badgeMilestone.upsert({
                where: { slug: item.slug },
                update: data,
                create: data,
            })
        }

        summaries.push({
            slug: item.slug,
            name: item.name,
            scope: item.scope,
            learningSeriesSlug: item.learningSeriesSlug ?? null,
            domainSlug: item.domainSlug ?? null,
            thresholdStars: item.thresholdStars,
            action: options.apply ? 'upserted' : 'plan',
        })
    }

    return {
        version: payload.version,
        scopeModel: payload.scopeModel,
        activeSeries: payload.activeSeries,
        dryRun: !options.apply,
        totals: {
            items: payload.items.length,
            processed: summaries.length,
        },
        items: summaries,
    }
}
