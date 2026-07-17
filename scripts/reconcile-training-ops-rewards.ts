import prisma from '@/lib/prisma'
import { TrainingOpsRewardService } from '@/lib/services/training-ops-reward.service'
import { resolveUnambiguousRewardDomainId } from '@/lib/training-ops-reward-domain'

const APPLY_CONFIRMATION = 'BACKFILL_TRAINING_OPS_REWARDS'
const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const confirmation = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--confirm='))
    ?.slice('--confirm='.length)

const keyForAward = (badgeId: string, userId: string) => `${badgeId}:${userId}`
const keyForUserDomain = (userId: string, domainId: string) => `${userId}:${domainId}`

async function main() {
    if (apply && confirmation !== APPLY_CONFIRMATION) {
        throw new Error(`Apply mode requires --confirm=${APPLY_CONFIRMATION}`)
    }

    const [unscopedAwards, allStarAwards, activeMilestones, existingBadgeAwards, domains] = await Promise.all([
        prisma.starAward.findMany({
            where: { domainId: null },
            select: {
                id: true,
                exam: {
                    select: {
                        productDomainId: true,
                        learningSeries: { select: { domainId: true } },
                        learningEvent: {
                            select: {
                                domainId: true,
                                series: { select: { domainId: true } },
                            },
                        },
                    },
                },
                event: {
                    select: {
                        domainId: true,
                        series: { select: { domainId: true } },
                    },
                },
            },
            orderBy: { awardedAt: 'asc' },
        }),
        prisma.starAward.findMany({
            select: { id: true, userId: true, domainId: true, stars: true },
        }),
        prisma.badgeMilestone.findMany({
            where: { active: true, domainId: { not: null } },
            select: {
                id: true,
                name: true,
                thresholdStars: true,
                domainId: true,
                domain: { select: { name: true } },
            },
        }),
        prisma.badgeAward.findMany({
            select: { badgeId: true, userId: true },
        }),
        prisma.productDomain.findMany({
            select: { id: true, name: true },
        }),
    ])

    const mappings = unscopedAwards.map((award) => ({
        awardId: award.id,
        ...resolveUnambiguousRewardDomainId({
            examDomainId: award.exam?.productDomainId,
            awardEventDomainId: award.event?.domainId,
            examEventDomainId: award.exam?.learningEvent?.domainId,
            examSeriesDomainId: award.exam?.learningSeries?.domainId,
            awardEventSeriesDomainId: award.event?.series?.domainId,
            examEventSeriesDomainId: award.exam?.learningEvent?.series?.domainId,
        }),
    }))
    const resolvableMappings = mappings.filter(
        (mapping): mapping is typeof mapping & { domainId: string } => Boolean(mapping.domainId)
    )
    const conflictingMappings = mappings.filter((mapping) => mapping.conflict)
    const unresolvedMappings = mappings.filter((mapping) => !mapping.domainId && !mapping.conflict)
    const mappedDomainsByAward = new Map(
        resolvableMappings.map((mapping) => [mapping.awardId, mapping.domainId])
    )

    const starTotalsByUserDomain = new Map<string, number>()
    for (const award of allStarAwards) {
        const domainId = award.domainId ?? mappedDomainsByAward.get(award.id)
        if (!domainId) continue
        const key = keyForUserDomain(award.userId, domainId)
        starTotalsByUserDomain.set(key, (starTotalsByUserDomain.get(key) ?? 0) + award.stars)
    }

    const existingAwardKeys = new Set(
        existingBadgeAwards.map((award) => keyForAward(award.badgeId, award.userId))
    )
    const missingEligibleAwards = activeMilestones.flatMap((milestone) => {
        if (!milestone.domainId) return []

        return [...starTotalsByUserDomain.entries()]
            .filter(([key, stars]) => key.endsWith(`:${milestone.domainId}`) && stars >= milestone.thresholdStars)
            .map(([key]) => key.slice(0, -(milestone.domainId!.length + 1)))
            .filter((userId) => !existingAwardKeys.has(keyForAward(milestone.id, userId)))
            .map((userId) => ({
                badgeId: milestone.id,
                badgeName: milestone.name,
                userId,
                domainId: milestone.domainId!,
                domainName: milestone.domain?.name ?? 'Unknown domain',
            }))
    })

    const domainNames = new Map(domains.map((domain) => [domain.id, domain.name]))
    const mappedAwardsByDomain = resolvableMappings.reduce<Record<string, number>>((totals, mapping) => {
        const name = domainNames.get(mapping.domainId) ?? mapping.domainId
        totals[name] = (totals[name] ?? 0) + 1
        return totals
    }, {})
    const missingBadgesByDomain = missingEligibleAwards.reduce<Record<string, number>>((totals, award) => {
        totals[award.domainName] = (totals[award.domainName] ?? 0) + 1
        return totals
    }, {})

    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
    console.log(`Unscoped star awards: ${unscopedAwards.length}`)
    console.log(`Unambiguously resolvable: ${resolvableMappings.length}`)
    console.log(`Conflicting domain candidates: ${conflictingMappings.length}`)
    console.log(`Unresolved: ${unresolvedMappings.length}`)
    console.log(`Missing eligible badge awards after mapping: ${missingEligibleAwards.length}`)
    console.log(`Resolvable star awards by domain: ${JSON.stringify(mappedAwardsByDomain)}`)
    console.log(`Missing badges by domain: ${JSON.stringify(missingBadgesByDomain)}`)

    if (conflictingMappings.length > 0) {
        console.log('Conflicts require manual review:')
        for (const mapping of conflictingMappings) {
            console.log(`  ${mapping.awardId}: ${mapping.candidates.join(', ')}`)
        }
    }

    if (!apply) {
        console.log(`Dry run complete. Apply with --apply --confirm=${APPLY_CONFIRMATION}`)
        return
    }

    const result = await prisma.$transaction(async (tx) => {
        let starAwardsUpdated = 0
        for (const mapping of resolvableMappings) {
            const updated = await tx.starAward.updateMany({
                where: { id: mapping.awardId, domainId: null },
                data: { domainId: mapping.domainId },
            })
            starAwardsUpdated += updated.count
        }

        let badgeAwardsCreated = 0
        const domainIds = [...new Set(activeMilestones.map((milestone) => milestone.domainId).filter(Boolean))] as string[]
        for (const domainId of domainIds) {
            const reconciliation = await TrainingOpsRewardService.reconcileBadgeAwardsForDomain(domainId, tx)
            badgeAwardsCreated += reconciliation.awardsCreated
        }

        return { starAwardsUpdated, badgeAwardsCreated }
    })

    console.log(`Star awards updated: ${result.starAwardsUpdated}`)
    console.log(`Badge awards created: ${result.badgeAwardsCreated}`)
    console.log('Reward reconciliation completed successfully.')
}

main()
    .catch((error) => {
        console.error('Training Ops reward reconciliation failed:', error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
