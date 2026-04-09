import { z } from 'zod'
import { LearningSeriesType } from '@prisma/client'
import prisma from '@/lib/prisma'

const learningSeriesTypes = [
    'WEEKLY_DRILL',
    'CASE_STUDY',
    'KNOWLEDGE_SHARING',
    'FAQ_SHARE',
    'RELEASE_READINESS',
    'QUARTERLY_FINAL',
    'YEAR_END_FINAL',
] as const

const learningSeriesSeedItemSchema = z.object({
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    type: z.enum(learningSeriesTypes),
    domainSlug: z.string().trim().min(1).optional(),
    domainName: z.string().trim().min(1).optional(),
    ownerEmail: z.string().trim().email().optional(),
    description: z.string().trim().optional(),
    cadence: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    badgeEligible: z.boolean().optional(),
    countsTowardPerformance: z.boolean().optional(),
    defaultStarValue: z.number().int().min(0).max(20).optional().nullable(),
})

const learningSeriesSeedFileSchema = z.object({
    version: z.number().int().positive(),
    scopeModel: z.string().trim().min(1),
    activeDomains: z.array(z.string().trim().min(1)).default([]),
    items: z.array(learningSeriesSeedItemSchema).min(1),
})

export type TrainingOpsLearningSeriesImportPayload = z.infer<typeof learningSeriesSeedFileSchema>

export interface TrainingOpsLearningSeriesImportItemSummary {
    slug: string
    name: string
    type: LearningSeriesType
    domainSlug?: string | null
    ownerEmail?: string | null
    action: 'plan' | 'upserted'
}

export interface TrainingOpsLearningSeriesImportSummary {
    version: number
    scopeModel: string
    activeDomains: string[]
    dryRun: boolean
    totals: {
        items: number
        processed: number
    }
    items: TrainingOpsLearningSeriesImportItemSummary[]
}

export function parseTrainingOpsLearningSeriesImportPayload(input: unknown): TrainingOpsLearningSeriesImportPayload {
    return learningSeriesSeedFileSchema.parse(input)
}

export async function importTrainingOpsLearningSeries(
    input: unknown,
    options: { apply: boolean }
): Promise<TrainingOpsLearningSeriesImportSummary> {
    const payload = parseTrainingOpsLearningSeriesImportPayload(input)

    const uniqueDomainSlugs = [...new Set(payload.items.map((item) => item.domainSlug).filter(Boolean))] as string[]
    const uniqueDomainNames = [...new Set(payload.items.map((item) => item.domainName).filter(Boolean))] as string[]
    const uniqueOwnerEmails = [...new Set(payload.items.map((item) => item.ownerEmail).filter(Boolean))] as string[]

    const [domainRows, ownerRows] = await Promise.all([
        uniqueDomainSlugs.length > 0 || uniqueDomainNames.length > 0
            ? prisma.productDomain.findMany({
                  where: {
                      OR: [
                          ...(uniqueDomainSlugs.length > 0 ? [{ slug: { in: uniqueDomainSlugs } }] : []),
                          ...(uniqueDomainNames.length > 0 ? [{ name: { in: uniqueDomainNames } }] : []),
                      ],
                  },
                  select: { id: true, slug: true, name: true },
              })
            : Promise.resolve([]),
        uniqueOwnerEmails.length > 0
            ? prisma.user.findMany({
                  where: {
                      email: { in: uniqueOwnerEmails },
                      status: 'ACTIVE',
                  },
                  select: { id: true, email: true },
              })
            : Promise.resolve([]),
    ])

    const domainsBySlug = new Map(domainRows.map((row) => [row.slug, row]))
    const domainsByName = new Map(domainRows.map((row) => [row.name, row]))
    const ownersByEmail = new Map(ownerRows.map((row) => [row.email, row]))

    const missingDomains = payload.items
        .filter((item) => item.domainSlug || item.domainName)
        .filter((item) => {
            const bySlug = item.domainSlug ? domainsBySlug.get(item.domainSlug) : null
            const byName = item.domainName ? domainsByName.get(item.domainName) : null
            return !bySlug && !byName
        })
        .map((item) => item.domainSlug || item.domainName || item.slug)
    const uniqueMissingDomains = [...new Set(missingDomains)]
    if (uniqueMissingDomains.length > 0) {
        throw new Error(
            `Missing Product Domains for import entries: ${uniqueMissingDomains.join(', ')}. Create those Product Domains first, then retry the import.`
        )
    }

    const missingOwners = uniqueOwnerEmails.filter((email) => !ownersByEmail.has(email))
    if (missingOwners.length > 0) {
        throw new Error(
            `Missing active users for owner emails: ${missingOwners.join(', ')}. Create or reactivate those users first, then retry the import.`
        )
    }

    const summaries: TrainingOpsLearningSeriesImportItemSummary[] = []

    for (const item of payload.items) {
        const domain =
            (item.domainSlug ? domainsBySlug.get(item.domainSlug) : null) ??
            (item.domainName ? domainsByName.get(item.domainName) : null) ??
            null
        const owner = item.ownerEmail ? ownersByEmail.get(item.ownerEmail) ?? null : null

        const data = {
            name: item.name,
            slug: item.slug,
            type: item.type,
            domainId: domain?.id ?? null,
            ownerId: owner?.id ?? null,
            description: item.description ?? null,
            cadence: item.cadence ?? null,
            isActive: item.isActive ?? true,
            badgeEligible: item.badgeEligible ?? true,
            countsTowardPerformance: item.countsTowardPerformance ?? false,
            defaultStarValue: item.defaultStarValue ?? null,
        }

        if (options.apply) {
            await prisma.learningSeries.upsert({
                where: { slug: item.slug },
                update: data,
                create: data,
            })
        }

        summaries.push({
            slug: item.slug,
            name: item.name,
            type: item.type,
            domainSlug: domain?.slug ?? item.domainSlug ?? null,
            ownerEmail: owner?.email ?? item.ownerEmail ?? null,
            action: options.apply ? 'upserted' : 'plan',
        })
    }

    return {
        version: payload.version,
        scopeModel: payload.scopeModel,
        activeDomains: payload.activeDomains,
        dryRun: !options.apply,
        totals: {
            items: payload.items.length,
            processed: summaries.length,
        },
        items: summaries,
    }
}
