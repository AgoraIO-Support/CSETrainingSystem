import { createHash } from 'crypto'
import { Prisma, UserRole } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
    DomainCandidate,
    DomainObjectType,
    DomainResolution,
    assertPublishableDomain,
    normalizeDomainAlias,
    resolveDomainCandidates,
} from '@/lib/domain-governance'

type GovernanceDbClient = typeof prisma | Prisma.TransactionClient
type GovernanceActor = { id: string; role: UserRole }

export type DomainAssignment = {
    objectType: 'PROGRAM' | 'EVENT'
    id: string
    domainId: string
}

type AuditRecord = {
    objectType: DomainObjectType
    id: string
    title: string
    status: string
    directDomainId: string | null
    updatedAt: Date
    resolution: DomainResolution
}

const structural = (domainId: string | null | undefined, source: string): DomainCandidate => ({
    domainId,
    source,
    kind: 'STRUCTURAL',
})

const compatibility = (domainId: string | null | undefined, source: string): DomainCandidate => ({
    domainId,
    source,
    kind: 'COMPATIBILITY',
})

export class DomainGovernanceService {
    private static assertAdmin(actor: GovernanceActor) {
        if (actor.role !== UserRole.ADMIN) {
            throw new Error('DOMAIN_GOVERNANCE_ADMIN_REQUIRED')
        }
    }

    static async getCourseResolution(courseId: string, db: GovernanceDbClient = prisma) {
        const course = await db.course.findUnique({
            where: { id: courseId },
            select: {
                id: true,
                learningEvent: {
                    select: {
                        domainId: true,
                        series: { select: { domainId: true } },
                    },
                },
                sourceLearningEvent: {
                    select: {
                        domainId: true,
                        series: { select: { domainId: true } },
                    },
                },
            },
        })

        if (!course) throw new Error('COURSE_NOT_FOUND')

        return resolveDomainCandidates([
            structural(course.learningEvent?.domainId, 'course.event.domainId'),
            structural(course.learningEvent?.series?.domainId, 'course.event.program.domainId'),
            structural(course.sourceLearningEvent?.domainId, 'course.sourceEvent.domainId'),
            structural(course.sourceLearningEvent?.series?.domainId, 'course.sourceEvent.program.domainId'),
        ])
    }

    static async getExamResolution(examId: string, db: GovernanceDbClient = prisma) {
        const exam = await db.exam.findUnique({
            where: { id: examId },
            select: {
                id: true,
                productDomainId: true,
                learningSeries: { select: { domainId: true } },
                learningEvent: {
                    select: { domainId: true, series: { select: { domainId: true } } },
                },
                sourceLearningEvent: {
                    select: { domainId: true, series: { select: { domainId: true } } },
                },
                course: {
                    select: {
                        learningEvent: {
                            select: { domainId: true, series: { select: { domainId: true } } },
                        },
                        sourceLearningEvent: {
                            select: { domainId: true, series: { select: { domainId: true } } },
                        },
                    },
                },
            },
        })

        if (!exam) throw new Error('EXAM_NOT_FOUND')

        return resolveDomainCandidates([
            compatibility(exam.productDomainId, 'exam.productDomainId'),
            compatibility(exam.learningSeries?.domainId, 'exam.program.domainId'),
            structural(exam.learningEvent?.domainId, 'exam.event.domainId'),
            structural(exam.learningEvent?.series?.domainId, 'exam.event.program.domainId'),
            structural(exam.course?.learningEvent?.domainId, 'exam.course.event.domainId'),
            structural(exam.course?.learningEvent?.series?.domainId, 'exam.course.event.program.domainId'),
            structural(exam.course?.sourceLearningEvent?.domainId, 'exam.course.sourceEvent.domainId'),
            structural(exam.course?.sourceLearningEvent?.series?.domainId, 'exam.course.sourceEvent.program.domainId'),
            structural(exam.sourceLearningEvent?.domainId, 'exam.sourceEvent.domainId'),
            structural(exam.sourceLearningEvent?.series?.domainId, 'exam.sourceEvent.program.domainId'),
        ])
    }

    static async assertCoursePublishable(courseId: string, db: GovernanceDbClient = prisma) {
        return assertPublishableDomain(await this.getCourseResolution(courseId, db), 'COURSE')
    }

    static async assertExamPublishable(examId: string, db: GovernanceDbClient = prisma) {
        return assertPublishableDomain(await this.getExamResolution(examId, db), 'EXAM')
    }

    static async audit(actor: GovernanceActor, db: GovernanceDbClient = prisma) {
        this.assertAdmin(actor)

        const [domains, aliases, programs, events, courses, exams] = await Promise.all([
            db.productDomain.findMany({ select: { id: true, name: true, slug: true } }),
            db.productDomainAlias.findMany({ select: { domainId: true, alias: true, normalizedAlias: true } }),
            db.learningSeries.findMany({
                select: { id: true, name: true, slug: true, type: true, isActive: true, domainId: true, updatedAt: true },
            }),
            db.learningEvent.findMany({
                select: {
                    id: true,
                    title: true,
                    status: true,
                    domainId: true,
                    updatedAt: true,
                    series: { select: { domainId: true } },
                },
            }),
            db.course.findMany({
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    category: true,
                    tags: true,
                    status: true,
                    updatedAt: true,
                    learningEvent: { select: { domainId: true, series: { select: { domainId: true } } } },
                    sourceLearningEvent: { select: { domainId: true, series: { select: { domainId: true } } } },
                },
            }),
            db.exam.findMany({
                select: {
                    id: true,
                    title: true,
                    status: true,
                    productDomainId: true,
                    updatedAt: true,
                    learningSeries: { select: { domainId: true } },
                    learningEvent: { select: { domainId: true, series: { select: { domainId: true } } } },
                    sourceLearningEvent: { select: { domainId: true, series: { select: { domainId: true } } } },
                    course: {
                        select: {
                            title: true,
                            category: true,
                            tags: true,
                            learningEvent: { select: { domainId: true, series: { select: { domainId: true } } } },
                            sourceLearningEvent: { select: { domainId: true, series: { select: { domainId: true } } } },
                        },
                    },
                },
            }),
        ])

        const aliasLookup = new Map<string, string>()
        for (const domain of domains) {
            aliasLookup.set(normalizeDomainAlias(domain.name), domain.id)
            aliasLookup.set(normalizeDomainAlias(domain.slug), domain.id)
        }
        for (const alias of aliases) {
            aliasLookup.set(alias.normalizedAlias || normalizeDomainAlias(alias.alias), alias.domainId)
        }

        const aliasCandidates = (signals: Array<string | null | undefined>): DomainCandidate[] =>
            signals.flatMap((signal) => {
                if (!signal) return []
                const normalized = normalizeDomainAlias(signal)
                const domainId = aliasLookup.get(normalized)
                return domainId ? [{ domainId, source: `alias:${normalized}`, kind: 'ALIAS' as const }] : []
            })

        const records: AuditRecord[] = [
            ...programs.map((program) => ({
                objectType: 'PROGRAM' as const,
                id: program.id,
                title: program.name,
                status: program.isActive ? `ACTIVE:${program.type}` : `INACTIVE:${program.type}`,
                directDomainId: program.domainId,
                updatedAt: program.updatedAt,
                resolution: resolveDomainCandidates([
                    structural(program.domainId, 'program.domainId'),
                    ...aliasCandidates([program.name, program.slug]),
                ]),
            })),
            ...events.map((event) => ({
                objectType: 'EVENT' as const,
                id: event.id,
                title: event.title,
                status: event.status,
                directDomainId: event.domainId,
                updatedAt: event.updatedAt,
                resolution: resolveDomainCandidates([
                    structural(event.domainId, 'event.domainId'),
                    structural(event.series?.domainId, 'event.program.domainId'),
                    ...aliasCandidates([event.title]),
                ]),
            })),
            ...courses.map((course) => ({
                objectType: 'COURSE' as const,
                id: course.id,
                title: course.title,
                status: course.status,
                directDomainId: null,
                updatedAt: course.updatedAt,
                resolution: resolveDomainCandidates([
                    structural(course.learningEvent?.domainId, 'course.event.domainId'),
                    structural(course.learningEvent?.series?.domainId, 'course.event.program.domainId'),
                    structural(course.sourceLearningEvent?.domainId, 'course.sourceEvent.domainId'),
                    structural(course.sourceLearningEvent?.series?.domainId, 'course.sourceEvent.program.domainId'),
                    ...aliasCandidates([course.title, course.slug, course.category, ...course.tags]),
                ]),
            })),
            ...exams.map((exam) => ({
                objectType: 'EXAM' as const,
                id: exam.id,
                title: exam.title,
                status: exam.status,
                directDomainId: exam.productDomainId,
                updatedAt: exam.updatedAt,
                resolution: resolveDomainCandidates([
                    compatibility(exam.productDomainId, 'exam.productDomainId'),
                    compatibility(exam.learningSeries?.domainId, 'exam.program.domainId'),
                    structural(exam.learningEvent?.domainId, 'exam.event.domainId'),
                    structural(exam.learningEvent?.series?.domainId, 'exam.event.program.domainId'),
                    structural(exam.course?.learningEvent?.domainId, 'exam.course.event.domainId'),
                    structural(exam.course?.learningEvent?.series?.domainId, 'exam.course.event.program.domainId'),
                    structural(exam.course?.sourceLearningEvent?.domainId, 'exam.course.sourceEvent.domainId'),
                    structural(exam.course?.sourceLearningEvent?.series?.domainId, 'exam.course.sourceEvent.program.domainId'),
                    structural(exam.sourceLearningEvent?.domainId, 'exam.sourceEvent.domainId'),
                    structural(exam.sourceLearningEvent?.series?.domainId, 'exam.sourceEvent.program.domainId'),
                    ...aliasCandidates([exam.title, exam.course?.title, exam.course?.category, ...(exam.course?.tags ?? [])]),
                ]),
            })),
        ]

        const summary = records.reduce<Record<DomainObjectType, Record<string, number>>>((totals, record) => {
            totals[record.objectType][record.resolution.status] =
                (totals[record.objectType][record.resolution.status] ?? 0) + 1
            return totals
        }, {
            PROGRAM: {},
            EVENT: {},
            COURSE: {},
            EXAM: {},
        })

        return { summary, records }
    }

    static async proposeAssignments(actor: GovernanceActor, db: GovernanceDbClient = prisma) {
        const audit = await this.audit(actor, db)
        const assignments = audit.records
            .filter((record) =>
                (record.objectType === 'PROGRAM' || record.objectType === 'EVENT') &&
                !record.directDomainId &&
                record.resolution.domainId
            )
            .map((record) => ({
                objectType: record.objectType as DomainAssignment['objectType'],
                id: record.id,
                title: record.title,
                status: record.status,
                domainId: record.resolution.domainId!,
                source: record.resolution.status === 'SCOPED' ? 'STRUCTURAL' as const : 'ALIAS' as const,
                automaticAssignmentAllowed: record.resolution.automaticAssignmentAllowed,
                updatedAt: record.updatedAt,
            }))
        const associationSuggestions = audit.records
            .filter((record) =>
                (record.objectType === 'COURSE' || record.objectType === 'EXAM') &&
                record.resolution.status === 'SUGGESTED' &&
                record.resolution.domainId
            )
            .map((record) => ({
                objectType: record.objectType,
                id: record.id,
                title: record.title,
                status: record.status,
                suggestedDomainId: record.resolution.domainId!,
                action: 'ATTACH_TO_EVENT' as const,
                automaticAssignmentAllowed: false,
                updatedAt: record.updatedAt,
            }))

        return {
            summary: {
                total: assignments.length,
                automatic: assignments.filter((assignment) => assignment.automaticAssignmentAllowed).length,
                approvalRequired: assignments.filter((assignment) => !assignment.automaticAssignmentAllowed).length,
                associationSuggestions: associationSuggestions.length,
            },
            assignments,
            associationSuggestions,
            conflicts: audit.records.filter((record) => record.resolution.status === 'CONFLICT'),
            unresolved: audit.records.filter((record) => record.resolution.status === 'UNSCOPED'),
        }
    }

    private static async loadAliasState(
        input: { domainId: string; alias: string },
        db: GovernanceDbClient
    ) {
        const normalizedAlias = normalizeDomainAlias(input.alias)
        if (!normalizedAlias) throw new Error('DOMAIN_ALIAS_INVALID')

        const [domain, existing] = await Promise.all([
            db.productDomain.findUnique({ where: { id: input.domainId }, select: { id: true, active: true } }),
            db.productDomainAlias.findUnique({ where: { normalizedAlias }, select: { id: true, domainId: true, updatedAt: true } }),
        ])
        if (!domain?.active) throw new Error('DOMAIN_ASSIGNMENT_TARGET_INVALID')
        if (existing && existing.domainId !== input.domainId) throw new Error('DOMAIN_ALIAS_CONFLICT')

        const state = {
            domainId: input.domainId,
            alias: input.alias.trim(),
            normalizedAlias,
            existingId: existing?.id ?? null,
            existingUpdatedAt: existing?.updatedAt.toISOString() ?? null,
            noOp: Boolean(existing),
        }
        return {
            ...state,
            confirmationToken: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
        }
    }

    static async previewAlias(actor: GovernanceActor, input: { domainId: string; alias: string }) {
        this.assertAdmin(actor)
        return this.loadAliasState(input, prisma)
    }

    static async applyAlias(
        actor: GovernanceActor,
        input: { domainId: string; alias: string },
        confirmationToken: string
    ) {
        this.assertAdmin(actor)
        return prisma.$transaction(async (tx) => {
            const preview = await this.loadAliasState(input, tx)
            if (preview.confirmationToken !== confirmationToken) throw new Error('DOMAIN_ALIAS_CONFIRMATION_STALE')
            if (preview.noOp) return { created: false, alias: preview }

            const created = await tx.productDomainAlias.create({
                data: {
                    domainId: preview.domainId,
                    alias: preview.alias,
                    normalizedAlias: preview.normalizedAlias,
                },
            })
            return { created: true, alias: created }
        })
    }

    private static async getAssignmentResolution(
        assignment: Pick<DomainAssignment, 'objectType' | 'id'>,
        db: GovernanceDbClient
    ) {
        if (assignment.objectType === 'EVENT') {
            const event = await db.learningEvent.findUnique({
                where: { id: assignment.id },
                select: {
                    domainId: true,
                    series: { select: { domainId: true } },
                    exams: { select: { productDomainId: true } },
                },
            })
            if (!event) throw new Error(`DOMAIN_ASSIGNMENT_OBJECT_NOT_FOUND:EVENT:${assignment.id}`)
            return resolveDomainCandidates([
                structural(event.domainId, 'event.domainId'),
                structural(event.series?.domainId, 'event.program.domainId'),
                ...event.exams.map((exam) => compatibility(exam.productDomainId, 'event.exam.productDomainId')),
            ])
        }

        const program = await db.learningSeries.findUnique({
            where: { id: assignment.id },
            select: {
                domainId: true,
                events: { select: { domainId: true, exams: { select: { productDomainId: true } } } },
                exams: { select: { productDomainId: true } },
            },
        })
        if (!program) throw new Error(`DOMAIN_ASSIGNMENT_OBJECT_NOT_FOUND:PROGRAM:${assignment.id}`)
        return resolveDomainCandidates([
            structural(program.domainId, 'program.domainId'),
            ...program.events.map((event) => structural(event.domainId, 'program.event.domainId')),
            ...program.events.flatMap((event) =>
                event.exams.map((exam) => compatibility(exam.productDomainId, 'program.event.exam.productDomainId'))
            ),
            ...program.exams.map((exam) => compatibility(exam.productDomainId, 'program.exam.productDomainId')),
        ])
    }

    private static async loadAssignmentState(assignments: DomainAssignment[], db: GovernanceDbClient) {
        const domainIds = [...new Set(assignments.map((assignment) => assignment.domainId))]
        const domains = await db.productDomain.findMany({
            where: { id: { in: domainIds }, active: true },
            select: { id: true },
        })
        if (domains.length !== domainIds.length) throw new Error('DOMAIN_ASSIGNMENT_TARGET_INVALID')

        const changes = []
        for (const assignment of [...assignments].sort((a, b) => `${a.objectType}:${a.id}`.localeCompare(`${b.objectType}:${b.id}`))) {
            const record = assignment.objectType === 'PROGRAM'
                ? await db.learningSeries.findUnique({
                    where: { id: assignment.id },
                    select: { id: true, updatedAt: true, domainId: true },
                })
                : await db.learningEvent.findUnique({
                    where: { id: assignment.id },
                    select: { id: true, updatedAt: true, domainId: true },
                })

            if (!record) throw new Error(`DOMAIN_ASSIGNMENT_OBJECT_NOT_FOUND:${assignment.objectType}:${assignment.id}`)
            const currentDomainId = record.domainId ?? null
            if (currentDomainId && currentDomainId !== assignment.domainId) {
                throw new Error(`DOMAIN_ASSIGNMENT_WOULD_OVERWRITE:${assignment.objectType}:${assignment.id}`)
            }

            const resolution = await this.getAssignmentResolution(assignment, db)
            if (resolution.status === 'CONFLICT') {
                throw new Error(`DOMAIN_ASSIGNMENT_SOURCE_CONFLICT:${assignment.objectType}:${assignment.id}`)
            }
            if (resolution.domainId && resolution.domainId !== assignment.domainId) {
                throw new Error(`DOMAIN_ASSIGNMENT_TARGET_CONFLICT:${assignment.objectType}:${assignment.id}`)
            }
            if (resolution.compatibilityDomainIds.some((domainId) => domainId !== assignment.domainId)) {
                throw new Error(`DOMAIN_ASSIGNMENT_TARGET_CONFLICT:${assignment.objectType}:${assignment.id}`)
            }

            changes.push({
                ...assignment,
                currentDomainId,
                updatedAt: record.updatedAt.toISOString(),
                noOp: currentDomainId === assignment.domainId,
            })
        }

        const confirmationToken = createHash('sha256').update(JSON.stringify(changes)).digest('hex')
        return { confirmationToken, changes }
    }

    static async previewAssignments(actor: GovernanceActor, assignments: DomainAssignment[]) {
        this.assertAdmin(actor)
        if (assignments.length === 0) throw new Error('DOMAIN_ASSIGNMENTS_REQUIRED')
        return this.loadAssignmentState(assignments, prisma)
    }

    static async applyAssignments(actor: GovernanceActor, assignments: DomainAssignment[], confirmationToken: string) {
        this.assertAdmin(actor)
        if (assignments.length === 0) throw new Error('DOMAIN_ASSIGNMENTS_REQUIRED')

        return prisma.$transaction(async (tx) => {
            const preview = await this.loadAssignmentState(assignments, tx)
            if (preview.confirmationToken !== confirmationToken) {
                throw new Error('DOMAIN_ASSIGNMENT_CONFIRMATION_STALE')
            }

            let updated = 0
            for (const change of preview.changes) {
                if (change.noOp) continue

                const where = { id: change.id, updatedAt: new Date(change.updatedAt) }
                const data = { domainId: change.domainId }
                const result = change.objectType === 'PROGRAM'
                    ? await tx.learningSeries.updateMany({ where: { ...where, domainId: null }, data })
                    : await tx.learningEvent.updateMany({ where: { ...where, domainId: null }, data })

                if (result.count !== 1) throw new Error('DOMAIN_ASSIGNMENT_CONCURRENT_CHANGE')
                updated += result.count
            }

            return { updated, unchanged: preview.changes.length - updated, changes: preview.changes }
        })
    }
}
