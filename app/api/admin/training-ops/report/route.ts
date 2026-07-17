import { NextRequest, NextResponse } from 'next/server'
import { CertificateStatus, ExamAttemptStatus, UserRole, UserStatus } from '@prisma/client'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { averageNumber, percentage, selectLatestEvidenceAttempts } from '@/lib/training-ops-report-metrics'
import type { TrainingOpsAdminReport, TrainingOpsLearnerRiskStatus, TrainingOpsReportRange } from '@/types'

const formatRange = (startDate: Date, endDate: Date) => {
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
}

const REPORT_RANGES: TrainingOpsReportRange[] = ['30d', '90d', '180d', '365d', 'ytd', 'all']

const resolveRange = (range: string | null): TrainingOpsReportRange => {
    if (range && REPORT_RANGES.includes(range as TrainingOpsReportRange)) {
        return range as TrainingOpsReportRange
    }
    return '30d'
}

const parseBoolean = (value: string | null, fallback: boolean) => {
    if (value === null) return fallback
    return value === 'true'
}

const parseExcludedUserIds = (value: string | null) => {
    if (!value) return []
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

const buildPeriod = (range: TrainingOpsReportRange) => {
    const endDate = new Date()
    const startDate = new Date(endDate)

    switch (range) {
        case '30d':
            startDate.setDate(startDate.getDate() - 30)
            break
        case '90d':
            startDate.setDate(startDate.getDate() - 90)
            break
        case '180d':
            startDate.setDate(startDate.getDate() - 180)
            break
        case '365d':
            startDate.setDate(startDate.getDate() - 365)
            break
        case 'ytd':
            startDate.setMonth(0, 1)
            startDate.setHours(0, 0, 0, 0)
            break
        case 'all':
            startDate.setFullYear(2000, 0, 1)
            startDate.setHours(0, 0, 0, 0)
            break
    }

    return { startDate, endDate }
}

export const GET = withAdminAuth(async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url)
        const range = resolveRange(searchParams.get('range'))
        const includeAdmins = parseBoolean(searchParams.get('includeAdmins'), false)
        const excludedUserIds = parseExcludedUserIds(searchParams.get('excludeUserIds'))
        const { startDate, endDate } = buildPeriod(range)
        const includedRoles = includeAdmins ? [UserRole.USER, UserRole.SME, UserRole.ADMIN] : [UserRole.USER, UserRole.SME]
        const userFilter = {
            status: UserStatus.ACTIVE,
            role: { in: includedRoles },
            ...(excludedUserIds.length > 0 ? { id: { notIn: excludedUserIds } } : {}),
        } as const

        const [
            learners,
            availableUsers,
            enrollments,
            invitations,
            attempts,
            certificates,
            starAwards,
            badgeAwards,
            domainEffectiveness,
        ] = await Promise.all([
            prisma.user.findMany({
                where: {
                    ...userFilter,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    department: true,
                    title: true,
                    lastLoginAt: true,
                },
                orderBy: [{ department: 'asc' }, { name: 'asc' }],
            }),
            prisma.user.findMany({
                where: {
                    status: UserStatus.ACTIVE,
                    role: { in: [UserRole.USER, UserRole.SME, UserRole.ADMIN] },
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
                orderBy: [{ role: 'asc' }, { name: 'asc' }],
            }),
            prisma.enrollment.findMany({
                where: {
                    user: {
                        ...userFilter,
                    },
                    enrolledAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    userId: true,
                    status: true,
                    progress: true,
                    completedAt: true,
                    lastAccessedAt: true,
                },
            }),
            prisma.examInvitation.findMany({
                where: {
                    user: {
                        ...userFilter,
                    },
                    exam: {
                        status: 'PUBLISHED',
                    },
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    userId: true,
                    examId: true,
                    expiresAt: true,
                    exam: {
                        select: {
                            deadline: true,
                            countsTowardPerformance: true,
                        },
                    },
                },
            }),
            prisma.examAttempt.findMany({
                where: {
                    user: {
                        ...userFilter,
                    },
                    status: {
                        in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED],
                    },
                    submittedAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    userId: true,
                    examId: true,
                    status: true,
                    percentageScore: true,
                    passed: true,
                    submittedAt: true,
                    updatedAt: true,
                    exam: {
                        select: {
                            maxAttempts: true,
                            deadline: true,
                            countsTowardPerformance: true,
                        },
                    },
                },
            }),
            prisma.certificate.findMany({
                where: {
                    status: CertificateStatus.ISSUED,
                    issueDate: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    userId: true,
                    issueDate: true,
                },
            }),
            prisma.starAward.groupBy({
                by: ['userId'],
                where: {
                    user: {
                        ...userFilter,
                    },
                    awardedAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                _sum: {
                    stars: true,
                },
            }),
            prisma.badgeAward.groupBy({
                by: ['userId'],
                where: {
                    user: {
                        ...userFilter,
                    },
                    awardedAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                _count: {
                    _all: true,
                },
            }),
            TrainingOpsService.getDomainEffectiveness({ startDate, endDate }),
        ])

        const enrollmentsByUser = new Map<string, typeof enrollments>()
        const invitationsByUser = new Map<string, typeof invitations>()
        const attemptsByUser = new Map<string, typeof attempts>()
        const certificatesByUser = new Map<string, typeof certificates>()
        const starsByUser = new Map(starAwards.map((row) => [row.userId, row._sum.stars ?? 0]))
        const badgesByUser = new Map(badgeAwards.map((row) => [row.userId, row._count._all]))
        const now = new Date()

        enrollments.forEach((row) => {
            const current = enrollmentsByUser.get(row.userId) ?? []
            current.push(row)
            enrollmentsByUser.set(row.userId, current)
        })
        invitations.forEach((row) => {
            const current = invitationsByUser.get(row.userId) ?? []
            current.push(row)
            invitationsByUser.set(row.userId, current)
        })
        attempts.forEach((row) => {
            const current = attemptsByUser.get(row.userId) ?? []
            current.push(row)
            attemptsByUser.set(row.userId, current)
        })
        certificates.forEach((row) => {
            const current = certificatesByUser.get(row.userId) ?? []
            current.push(row)
            certificatesByUser.set(row.userId, current)
        })

        const learnerPerformance: TrainingOpsAdminReport['learnerPerformance'] = learners.map((learner) => {
            const userEnrollments = enrollmentsByUser.get(learner.id) ?? []
            const userInvitations = invitationsByUser.get(learner.id) ?? []
            const userAttempts = attemptsByUser.get(learner.id) ?? []
            const userCertificates = certificatesByUser.get(learner.id) ?? []
            const gradedAttempts = userAttempts.filter((attempt) => attempt.status === ExamAttemptStatus.GRADED)
            const passedAttempts = gradedAttempts.filter((attempt) => attempt.passed === true)
            const failedAttempts = gradedAttempts.filter((attempt) => attempt.passed === false)
            const attemptedExamIds = new Set(userAttempts.map((attempt) => attempt.examId))
            const attemptsByExam = new Map<string, number>()

            userAttempts.forEach((attempt) => {
                attemptsByExam.set(attempt.examId, (attemptsByExam.get(attempt.examId) ?? 0) + 1)
            })

            const overdueExams = userInvitations.filter((invitation) => {
                const dueAt = invitation.exam.deadline ?? invitation.expiresAt
                if (!dueAt || dueAt >= now) return false
                return !attemptedExamIds.has(invitation.examId)
            }).length

            const retakeNeeded = failedAttempts.filter((attempt) => {
                const dueAt = attempt.exam.deadline
                const attemptsUsed = attemptsByExam.get(attempt.examId) ?? 0
                return attemptsUsed < attempt.exam.maxAttempts && (!dueAt || dueAt >= now)
            }).length

            const lastEnrollmentActivity = userEnrollments
                .map((entry) => entry.lastAccessedAt ?? entry.completedAt)
                .filter((value): value is Date => value instanceof Date)
            const lastAttemptActivity = userAttempts
                .map((entry) => entry.submittedAt ?? entry.updatedAt)
                .filter((value): value is Date => value instanceof Date)
            const lastCertificateActivity = userCertificates.map((entry) => entry.issueDate)
            const lastActivityAt = [
                learner.lastLoginAt,
                ...lastEnrollmentActivity,
                ...lastAttemptActivity,
                ...lastCertificateActivity,
            ]
                .filter((value): value is Date => value instanceof Date)
                .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

            const courseAssigned = userEnrollments.length
            const courseCompleted = userEnrollments.filter((entry) => entry.status === 'COMPLETED' || entry.progress >= 100).length
            const averageCourseProgress = averageNumber(userEnrollments.map((entry) => entry.progress))
            const passRate = percentage(passedAttempts.length, gradedAttempts.length)
            const averageScore = averageNumber(gradedAttempts.map((entry) => entry.percentageScore))
            const bestScore = Math.round(Math.max(0, ...gradedAttempts.map((entry) => entry.percentageScore ?? 0)))

            let riskStatus: TrainingOpsLearnerRiskStatus = 'ON_TRACK'
            if (courseAssigned === 0 && userInvitations.length === 0) {
                riskStatus = 'NO_ASSIGNMENT'
            } else if (overdueExams > 0 || retakeNeeded > 0 || (gradedAttempts.length > 0 && passRate < 60)) {
                riskStatus = 'AT_RISK'
            } else if (
                (courseAssigned > 0 && averageCourseProgress < 60) ||
                (userInvitations.length > 0 && userAttempts.length === 0) ||
                (gradedAttempts.length > 0 && passRate < 80)
            ) {
                riskStatus = 'WATCH'
            }

            return {
                userId: learner.id,
                name: learner.name,
                email: learner.email,
                department: learner.department,
                title: learner.title,
                lastActivityAt,
                courseAssigned,
                courseCompleted,
                averageCourseProgress,
                examInvitations: userInvitations.length,
                examAttempts: userAttempts.length,
                gradedAttempts: gradedAttempts.length,
                passedAttempts: passedAttempts.length,
                failedAttempts: failedAttempts.length,
                passRate,
                averageScore,
                bestScore,
                certificates: userCertificates.length,
                stars: starsByUser.get(learner.id) ?? 0,
                badges: badgesByUser.get(learner.id) ?? 0,
                overdueExams,
                retakeNeeded,
                riskStatus,
            }
        })

        const learnersWithCertificates = learnerPerformance.filter((learner) => learner.certificates > 0)
        const allGradedAttempts = attempts.filter((attempt) => attempt.status === ExamAttemptStatus.GRADED)
        const passedGradedAttempts = allGradedAttempts.filter((attempt) => attempt.passed === true)
        const performanceInvitations = invitations.filter((invitation) => invitation.exam.countsTowardPerformance)
        const performanceEvidence = selectLatestEvidenceAttempts(
            allGradedAttempts.filter((attempt) => attempt.exam.countsTowardPerformance)
        )
        const passedPerformanceEvidence = performanceEvidence.filter((attempt) => attempt.passed === true)
        const atRiskLearners = learnerPerformance.filter((learner) => learner.riskStatus === 'AT_RISK').length
        const watchLearners = learnerPerformance.filter((learner) => learner.riskStatus === 'WATCH').length
        const retakeNeeded = learnerPerformance.reduce((sum, learner) => sum + learner.retakeNeeded, 0)
        const overdueLearners = learnerPerformance.filter((learner) => learner.overdueExams > 0).length
        const courseAssignments = learnerPerformance.reduce((sum, learner) => sum + learner.courseAssigned, 0)
        const courseStarted = enrollments.filter((enrollment) => enrollment.progress > 0).length
        const courseCompleted = learnerPerformance.reduce((sum, learner) => sum + learner.courseCompleted, 0)
        const activeLearnerIds = new Set([
            ...enrollments.map((enrollment) => enrollment.userId),
            ...attempts.map((attempt) => attempt.userId),
            ...certificates.map((certificate) => certificate.userId),
            ...learners
                .filter((learner) => learner.lastLoginAt && learner.lastLoginAt >= startDate && learner.lastLoginAt <= endDate)
                .map((learner) => learner.id),
        ])
        const invitedLearnerIds = new Set(invitations.map((invitation) => invitation.userId))
        const participatingLearnerIds = new Set(attempts.map((attempt) => attempt.userId))
        const invitationKeys = new Set(invitations.map((invitation) => `${invitation.userId}:${invitation.examId}`))
        const invitationParticipatingLearnerIds = new Set(
            attempts
                .filter((attempt) => invitationKeys.has(`${attempt.userId}:${attempt.examId}`))
                .map((attempt) => attempt.userId)
        )
        const assessmentLearnerIds = new Set([...invitedLearnerIds, ...participatingLearnerIds])
        const performanceInvitedLearnerIds = new Set(performanceInvitations.map((invitation) => invitation.userId))
        const performanceParticipatingLearnerIds = new Set(performanceEvidence.map((attempt) => attempt.userId))
        const measuredDomains = domainEffectiveness.filter((domain) => domain.gradedAttempts > 0).length

        const summary = {
            teamMembers: learners.length,
            activeLearners: activeLearnerIds.size,
            courseAssignments,
            courseStarted,
            courseCompleted,
            courseCompletionRate: percentage(courseCompleted, courseAssignments),
            examInvitations: invitations.length,
            assessmentLearners: assessmentLearnerIds.size,
            invitedLearners: invitedLearnerIds.size,
            invitationParticipatingLearners: invitationParticipatingLearnerIds.size,
            participatingLearners: participatingLearnerIds.size,
            gradedAttempts: allGradedAttempts.length,
            examParticipationRate: percentage(
                invitationParticipatingLearnerIds.size,
                invitedLearnerIds.size
            ),
            examPassRate: percentage(passedGradedAttempts.length, allGradedAttempts.length),
            averageExamScore: averageNumber(allGradedAttempts.map((attempt) => attempt.percentageScore)),
            performanceInvitedLearners: performanceInvitedLearnerIds.size,
            performanceParticipatingLearners: performanceParticipatingLearnerIds.size,
            performanceEvidenceRecords: performanceEvidence.length,
            performancePassRate: percentage(passedPerformanceEvidence.length, performanceEvidence.length),
            performanceAverageScore: averageNumber(performanceEvidence.map((attempt) => attempt.percentageScore)),
            trackedDomains: domainEffectiveness.length,
            measuredDomains,
            certificationRate: percentage(learnersWithCertificates.length, learners.length),
            atRiskLearners,
            watchLearners,
            retakeNeeded,
            overdueLearners,
        }

        const reportHighlights = [
            `${summary.courseCompletionRate}% course completion across assigned learner-course records.`,
            `${summary.examParticipationRate}% exam participation among learners with published exam invitations.`,
            `${summary.examPassRate}% pass rate from ${allGradedAttempts.length} graded exam attempts.`,
            `${summary.atRiskLearners} learners need immediate follow-up; ${summary.retakeNeeded} retakes are still actionable.`,
        ]

        const riskQueue = learnerPerformance
            .filter((learner) => learner.riskStatus === 'AT_RISK' || learner.riskStatus === 'WATCH')
            .sort((a, b) => {
                const priority = (value: TrainingOpsLearnerRiskStatus) => value === 'AT_RISK' ? 0 : value === 'WATCH' ? 1 : 2
                return priority(a.riskStatus) - priority(b.riskStatus) ||
                    b.overdueExams - a.overdueExams ||
                    b.retakeNeeded - a.retakeNeeded ||
                    a.averageCourseProgress - b.averageCourseProgress
            })
            .slice(0, 12)
            .map((learner) => {
                const reasons = []
                if (learner.overdueExams > 0) reasons.push(`${learner.overdueExams} overdue exam${learner.overdueExams === 1 ? '' : 's'}`)
                if (learner.retakeNeeded > 0) reasons.push(`${learner.retakeNeeded} retake${learner.retakeNeeded === 1 ? '' : 's'} needed`)
                if (learner.examInvitations > 0 && learner.examAttempts === 0) reasons.push('no exam attempt yet')
                if (learner.courseAssigned > 0 && learner.averageCourseProgress < 60) reasons.push('course progress below 60%')
                if (reasons.length === 0) reasons.push('performance below target')

                return {
                    userId: learner.userId,
                    name: learner.name,
                    email: learner.email,
                    reason: reasons.join(' · '),
                    overdueExams: learner.overdueExams,
                    retakeNeeded: learner.retakeNeeded,
                    averageCourseProgress: learner.averageCourseProgress,
                    passRate: learner.passRate,
                    lastActivityAt: learner.lastActivityAt,
                }
            })

        const data: TrainingOpsAdminReport = {
            generatedAt: endDate,
            period: {
                range,
                label: formatRange(startDate, endDate),
                startDate,
                endDate,
            },
            filters: {
                includeAdmins,
                excludedUserIds,
            },
            availableUsers: availableUsers.map((user) => ({
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            })),
            summary,
            reportHighlights,
            domainProgress: domainEffectiveness
                .sort((a, b) => {
                    const statusOrder = { AT_RISK: 0, MONITOR: 1, INSUFFICIENT_DATA: 2, ON_TRACK: 3 }
                    return statusOrder[a.status] - statusOrder[b.status] ||
                        (b.targetGap ?? 0) - (a.targetGap ?? 0) ||
                        b.gradedAttempts - a.gradedAttempts
                })
                .slice(0, 8)
                .map((domain) => ({
                    id: domain.id,
                    name: domain.name,
                    track: domain.track,
                    ownerName: domain.primarySme?.name ?? null,
                    currentPassRate: domain.currentPassRate,
                    targetPassRate: domain.targetPassRate ?? null,
                    targetGap: domain.targetGap,
                    gradedAttempts: domain.gradedAttempts,
                    scheduledEventCount: domain.scheduledEventCount,
                    status: domain.status,
                })),
            learnerPerformance: learnerPerformance
                .sort((a, b) => {
                    const statusOrder = { AT_RISK: 0, WATCH: 1, ON_TRACK: 2, NO_ASSIGNMENT: 3 }
                    return statusOrder[a.riskStatus] - statusOrder[b.riskStatus] ||
                        b.overdueExams - a.overdueExams ||
                        b.retakeNeeded - a.retakeNeeded ||
                        a.name.localeCompare(b.name)
                }),
            riskQueue,
        }

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get training ops admin report error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load training operations report',
                },
            },
            { status: 500 }
        )
    }
})
