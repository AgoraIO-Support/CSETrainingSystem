import { z } from 'zod'
import prisma from '@/lib/prisma'

const badgeScopes = ['DOMAIN'] as const
const badgeLevels = ['READY', 'PRACTITIONER', 'TROUBLESHOOTER', 'DOMAIN_SPECIALIST'] as const

const badgeSeedItemSchema = z.object({
    scope: z.enum(badgeScopes),
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
    activeDomains: z.array(z.string().trim().min(1)).default([]),
    items: z.array(badgeSeedItemSchema).min(1),
})

export type TrainingOpsBadgeImportPayload = z.infer<typeof badgeSeedFileSchema>

export interface TrainingOpsBadgeImportItemSummary {
    slug: string
    name: string
    scope: (typeof badgeScopes)[number]
    domainSlug?: string | null
    thresholdStars: number
    action: 'plan' | 'upserted'
}

export interface TrainingOpsBadgeImportSummary {
    version: number
    scopeModel: string
    activeDomains: string[]
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

    const uniqueDomainSlugs = [...new Set(payload.items.map((item) => item.domainSlug).filter(Boolean))] as string[]

    const domainRows = uniqueDomainSlugs.length > 0
        ? await prisma.productDomain.findMany({
              where: { slug: { in: uniqueDomainSlugs } },
              select: { id: true, slug: true },
          })
        : []
    const domainsBySlug = new Map(domainRows.map((row) => [row.slug, row]))

    const itemsMissingDomain = payload.items
        .filter((item) => !item.domainSlug)
        .map((item) => item.slug)
    if (itemsMissingDomain.length > 0) {
        throw new Error(`Badge import entries must include domainSlug: ${itemsMissingDomain.join(', ')}`)
    }

    const missingDomains = uniqueDomainSlugs.filter((slug) => !domainsBySlug.has(slug))
    if (missingDomains.length > 0) {
        throw new Error(`Missing Product Domains for slugs: ${missingDomains.join(', ')}`)
    }

    const payloadScopeKeys = payload.items.map((item) => `${item.domainSlug}:${item.slug}`)
    const duplicatePayloadScopeKeys = payloadScopeKeys.filter((key, index, values) => values.indexOf(key) !== index)
    if (duplicatePayloadScopeKeys.length > 0) {
        throw new Error(
            `Badge import entries must use unique slugs within each domain: ${[...new Set(duplicatePayloadScopeKeys)].join(', ')}`
        )
    }

    const resolvedItems = payload.items.map((item) => {
        const domain = item.domainSlug ? domainsBySlug.get(item.domainSlug) ?? null : null
        return {
            item,
            domain,
            domainId: domain?.id ?? null,
        }
    })

    const importedScopeKeys = new Set(
        resolvedItems
            .filter(({ domainId }) => Boolean(domainId))
            .map(({ item, domainId }) => `${domainId}:${item.slug}`)
    )
    const scopedDomainIds = [...new Set(resolvedItems.map(({ domainId }) => domainId).filter(Boolean))] as string[]
    const existingBadges = scopedDomainIds.length > 0
        ? await prisma.badgeMilestone.findMany({
              where: {
                  domainId: { in: scopedDomainIds },
              },
              select: {
                  domainId: true,
                  slug: true,
                  thresholdStars: true,
              },
          })
        : []

    const assignedThresholdsByDomain = new Map<string, Map<number, string>>()
    for (const badge of existingBadges) {
        if (!badge.domainId || importedScopeKeys.has(`${badge.domainId}:${badge.slug}`)) continue

        const current = assignedThresholdsByDomain.get(badge.domainId) ?? new Map<number, string>()
        current.set(badge.thresholdStars, badge.slug)
        assignedThresholdsByDomain.set(badge.domainId, current)
    }

    for (const { item, domainId } of resolvedItems) {
        if (!domainId) {
            continue
        }

        const current = assignedThresholdsByDomain.get(domainId) ?? new Map<number, string>()
        const conflictSlug = current.get(item.thresholdStars)
        if (conflictSlug) {
            throw new Error(
                `Badge import threshold conflict in domain ${item.domainSlug}: ` +
                `${item.thresholdStars} stars is already assigned to ${conflictSlug}`
            )
        }

        current.set(item.thresholdStars, item.slug)
        assignedThresholdsByDomain.set(domainId, current)
    }

    const summaries: TrainingOpsBadgeImportItemSummary[] = []

    for (const { item, domain } of resolvedItems) {
        const data = {
            name: item.name,
            slug: item.slug,
            description: item.description ?? null,
            icon: item.level,
            thresholdStars: item.thresholdStars,
            active: item.active ?? true,
            domainId: domain?.id ?? null,
        }

        if (options.apply) {
            const existing = await prisma.badgeMilestone.findFirst({
                where: {
                    domainId: domain?.id ?? null,
                    slug: item.slug,
                },
                select: { id: true },
            })

            if (existing) {
                await prisma.badgeMilestone.update({
                    where: { id: existing.id },
                    data,
                })
            } else {
                await prisma.badgeMilestone.create({
                    data,
                })
            }
        }

        summaries.push({
            slug: item.slug,
            name: item.name,
            scope: item.scope,
            domainSlug: item.domainSlug ?? null,
            thresholdStars: item.thresholdStars,
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
