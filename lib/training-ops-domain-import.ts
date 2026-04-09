import { z } from 'zod'
import { ProductDomainCategory, ProductTrack, SmeKpiMode } from '@prisma/client'
import prisma from '@/lib/prisma'

const productDomainCategories = ['RTE', 'AI'] as const
const productTracks = ['AGILE', 'MASTERY', 'RELEASE', 'FINAL'] as const
const smeKpiModes = ['DELTA', 'RETENTION', 'READINESS'] as const

const productDomainSeedItemSchema = z.object({
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    category: z.enum(productDomainCategories),
    track: z.enum(productTracks),
    kpiMode: z.enum(smeKpiModes),
    description: z.string().trim().optional(),
    cadence: z.string().trim().optional(),
    active: z.boolean().optional(),
    baselinePassRate: z.number().min(0).max(100).optional().nullable(),
    targetPassRate: z.number().min(0).max(100).optional().nullable(),
    challengeThreshold: z.number().min(0).max(100).optional().nullable(),
    primarySmeEmail: z.string().trim().email().optional(),
    backupSmeEmail: z.string().trim().email().optional(),
})

const productDomainSeedFileSchema = z.object({
    version: z.number().int().positive(),
    scopeModel: z.string().trim().min(1),
    items: z.array(productDomainSeedItemSchema).min(1),
})

export type TrainingOpsDomainImportPayload = z.infer<typeof productDomainSeedFileSchema>

export interface TrainingOpsDomainImportItemSummary {
    slug: string
    name: string
    category: ProductDomainCategory
    track: ProductTrack
    kpiMode: SmeKpiMode
    primarySmeEmail?: string | null
    backupSmeEmail?: string | null
    action: 'plan' | 'upserted'
}

export interface TrainingOpsDomainImportSummary {
    version: number
    scopeModel: string
    dryRun: boolean
    totals: {
        items: number
        processed: number
    }
    items: TrainingOpsDomainImportItemSummary[]
}

export function parseTrainingOpsDomainImportPayload(input: unknown): TrainingOpsDomainImportPayload {
    return productDomainSeedFileSchema.parse(input)
}

export async function importTrainingOpsDomains(
    input: unknown,
    options: { apply: boolean }
): Promise<TrainingOpsDomainImportSummary> {
    const payload = parseTrainingOpsDomainImportPayload(input)

    const uniqueSmeEmails = [
        ...new Set(
            payload.items.flatMap((item) => [item.primarySmeEmail, item.backupSmeEmail]).filter(Boolean)
        ),
    ] as string[]

    const users = uniqueSmeEmails.length > 0
        ? await prisma.user.findMany({
              where: {
                  email: { in: uniqueSmeEmails },
                  status: 'ACTIVE',
              },
              select: { id: true, email: true },
          })
        : []

    const usersByEmail = new Map(users.map((user) => [user.email, user]))
    const missingUsers = uniqueSmeEmails.filter((email) => !usersByEmail.has(email))
    if (missingUsers.length > 0) {
        throw new Error(
            `Missing active users for SME emails: ${missingUsers.join(', ')}. Create or reactivate those users first, then retry the import.`
        )
    }

    const summaries: TrainingOpsDomainImportItemSummary[] = []

    for (const item of payload.items) {
        const primarySme = item.primarySmeEmail ? usersByEmail.get(item.primarySmeEmail) ?? null : null
        const backupSme = item.backupSmeEmail ? usersByEmail.get(item.backupSmeEmail) ?? null : null

        const data = {
            name: item.name,
            slug: item.slug,
            category: item.category,
            track: item.track,
            kpiMode: item.kpiMode,
            description: item.description ?? null,
            cadence: item.cadence ?? null,
            active: item.active ?? true,
            baselinePassRate: item.baselinePassRate ?? null,
            targetPassRate: item.targetPassRate ?? null,
            challengeThreshold: item.challengeThreshold ?? null,
            primarySmeId: primarySme?.id ?? null,
            backupSmeId: backupSme?.id ?? null,
        }

        if (options.apply) {
            await prisma.productDomain.upsert({
                where: { slug: item.slug },
                update: data,
                create: data,
            })
        }

        summaries.push({
            slug: item.slug,
            name: item.name,
            category: item.category,
            track: item.track,
            kpiMode: item.kpiMode,
            primarySmeEmail: primarySme?.email ?? item.primarySmeEmail ?? null,
            backupSmeEmail: backupSme?.email ?? item.backupSmeEmail ?? null,
            action: options.apply ? 'upserted' : 'plan',
        })
    }

    return {
        version: payload.version,
        scopeModel: payload.scopeModel,
        dryRun: !options.apply,
        totals: {
            items: payload.items.length,
            processed: summaries.length,
        },
        items: summaries,
    }
}
