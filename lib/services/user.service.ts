import prisma from '@/lib/prisma'
import { Prisma, UserRole, UserStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

interface GetUserParams {
    page?: number
    limit?: number
    search?: string
    role?: UserRole
    status?: UserStatus
}

const adminUserSelect = {
    id: true,
    name: true,
    email: true,
    wecomUserId: true,
    avatar: true,
    role: true,
    status: true,
    department: true,
    title: true,
    createdAt: true,
    lastLoginAt: true,
    enrollments: {
        select: {
            status: true,
        },
    },
    primaryOwnedDomains: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
    backupOwnedDomains: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
} satisfies Prisma.UserSelect

type AdminUserRecord = Prisma.UserGetPayload<{
    select: typeof adminUserSelect
}>

export class UserService {
    private static async safeCountSmeUsers() {
        try {
            return await prisma.user.count({ where: { role: 'SME' } })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (message.includes('Expected UserRole')) {
                return 0
            }
            throw error
        }
    }

    private static mapAdminUser(user: AdminUserRecord) {
        const enrollmentCount = user.enrollments.length
        const completedCourses = user.enrollments.filter(enrollment => enrollment.status === 'COMPLETED').length
        const domainAssignments = [
            ...user.primaryOwnedDomains.map((domain) => ({
                domainId: domain.id,
                domainName: domain.name,
                domainSlug: domain.slug,
                slot: 'PRIMARY' as const,
            })),
            ...user.backupOwnedDomains.map((domain) => ({
                domainId: domain.id,
                domainName: domain.name,
                domainSlug: domain.slug,
                slot: 'BACKUP' as const,
            })),
        ].sort((a, b) => a.domainName.localeCompare(b.domainName))

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            wecomUserId: user.wecomUserId,
            avatar: user.avatar,
            role: user.role,
            status: user.status,
            department: user.department,
            title: user.title,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            enrollmentCount,
            completedCourses,
            domainAssignments,
        }
    }

    private static async syncSmeDomainAssignments(
        tx: Prisma.TransactionClient,
        userId: string,
        domainIds: string[]
    ) {
        const uniqueDomainIds = [...new Set(domainIds.filter(Boolean))]

        if (uniqueDomainIds.length === 0) {
            throw new Error('SME_DOMAIN_REQUIRED')
        }

        const domains = await tx.productDomain.findMany({
            where: {
                OR: [
                    { id: { in: uniqueDomainIds } },
                    { primarySmeId: userId },
                    { backupSmeId: userId },
                ],
            },
            select: {
                id: true,
                name: true,
                slug: true,
                primarySmeId: true,
                backupSmeId: true,
            },
        })

        const domainMap = new Map(domains.map((domain) => [domain.id, domain]))

        if (uniqueDomainIds.some((domainId) => !domainMap.has(domainId))) {
            throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
        }

        for (const domain of domains) {
            if (uniqueDomainIds.includes(domain.id)) {
                continue
            }

            const updateData: { primarySmeId?: null; backupSmeId?: null } = {}

            if (domain.primarySmeId === userId) {
                updateData.primarySmeId = null
            }

            if (domain.backupSmeId === userId) {
                updateData.backupSmeId = null
            }

            if (Object.keys(updateData).length > 0) {
                await tx.productDomain.update({
                    where: { id: domain.id },
                    data: updateData,
                })
            }
        }

        const assignments: Array<{
            domainId: string
            domainName: string
            domainSlug: string
            slot: 'PRIMARY' | 'BACKUP'
        }> = []
        const conflictingDomains: string[] = []

        for (const domainId of uniqueDomainIds) {
            const domain = domainMap.get(domainId)

            if (!domain) {
                throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
            }

            if (domain.primarySmeId === userId) {
                assignments.push({
                    domainId,
                    domainName: domain.name,
                    domainSlug: domain.slug,
                    slot: 'PRIMARY',
                })
                continue
            }

            if (domain.backupSmeId === userId) {
                assignments.push({
                    domainId,
                    domainName: domain.name,
                    domainSlug: domain.slug,
                    slot: 'BACKUP',
                })
                continue
            }

            if (!domain.primarySmeId) {
                await tx.productDomain.update({
                    where: { id: domainId },
                    data: { primarySmeId: userId },
                })
                assignments.push({
                    domainId,
                    domainName: domain.name,
                    domainSlug: domain.slug,
                    slot: 'PRIMARY',
                })
                continue
            }

            if (!domain.backupSmeId) {
                await tx.productDomain.update({
                    where: { id: domainId },
                    data: { backupSmeId: userId },
                })
                assignments.push({
                    domainId,
                    domainName: domain.name,
                    domainSlug: domain.slug,
                    slot: 'BACKUP',
                })
                continue
            }

            conflictingDomains.push(domain.name)
        }

        if (conflictingDomains.length > 0) {
            throw new Error(`DOMAIN_ASSIGNMENT_CONFLICT:${conflictingDomains.join(', ')}`)
        }

        return assignments.sort((a, b) => a.domainName.localeCompare(b.domainName))
    }

    private static async clearSmeDomainAssignments(tx: Prisma.TransactionClient, userId: string) {
        await Promise.all([
            tx.productDomain.updateMany({
                where: { primarySmeId: userId },
                data: { primarySmeId: null },
            }),
            tx.productDomain.updateMany({
                where: { backupSmeId: userId },
                data: { backupSmeId: null },
            }),
        ])
    }

    static async createUser(data: {
        email: string
        password: string
        name: string
        wecomUserId: string
        department?: string
        title?: string
    }) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
            select: { id: true },
        })

        if (existingUser) {
            throw new Error('EMAIL_EXISTS')
        }

        const existingWecomUser = await prisma.user.findUnique({
            where: { wecomUserId: data.wecomUserId },
            select: { id: true },
        })

        if (existingWecomUser) {
            throw new Error('WECOM_USER_ID_EXISTS')
        }

        const hashedPassword = await bcrypt.hash(data.password, 10)

        const created = await prisma.user.create({
            data: {
                email: data.email,
                name: data.name,
                password: hashedPassword,
                wecomUserId: data.wecomUserId,
                department: data.department?.trim() || null,
                title: data.title?.trim() || null,
                role: 'USER',
                status: 'ACTIVE',
            },
            select: adminUserSelect,
        })

        return this.mapAdminUser(created)
    }

    static async getUsers(params: GetUserParams) {
        const page = params.page && params.page > 0 ? params.page : 1
        const limit = params.limit && params.limit > 0 ? params.limit : 20
        const skip = (page - 1) * limit

        const where: Prisma.UserWhereInput = {}

        if (params.role) {
            where.role = params.role
        }

        if (params.status) {
            where.status = params.status
        }

        if (params.search) {
            const searchTerm = params.search.trim()
            if (searchTerm) {
                where.OR = [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                    { department: { contains: searchTerm, mode: 'insensitive' } },
                ]
            }
        }

        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

        const [users, totalFiltered, totalUsers, activeUsers, adminUsers, smeUsers, newThisMonth] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                select: adminUserSelect,
                orderBy: {
                    createdAt: 'desc',
                },
            }),
            prisma.user.count({ where }),
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.user.count({ where: { role: 'ADMIN' } }),
            this.safeCountSmeUsers(),
            prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
        ])

        const formattedUsers = users.map(user => this.mapAdminUser(user))

        return {
            users: formattedUsers,
            stats: {
                totalUsers,
                activeUsers,
                adminUsers,
                smeUsers,
                newThisMonth,
            },
            pagination: {
                page,
                limit,
                total: totalFiltered,
                totalPages: Math.max(1, Math.ceil(totalFiltered / limit)),
            },
        }
    }

    static async getSmeScopeAudit() {
        const smeUsers = await prisma.user.findMany({
            where: { role: 'SME' },
            select: adminUserSelect,
            orderBy: {
                createdAt: 'desc',
            },
        })

        const formattedUsers = smeUsers.map(user => this.mapAdminUser(user))
        const orphans = formattedUsers.filter(user => user.domainAssignments.length === 0)
        const multiDomainSmes = formattedUsers.filter(user => user.domainAssignments.length > 1).length

        return {
            summary: {
                totalSmes: formattedUsers.length,
                boundSmes: formattedUsers.length - orphans.length,
                orphanSmes: orphans.length,
                multiDomainSmes,
            },
            orphans,
        }
    }

    static async updateUser(
        id: string,
        data: {
            role?: UserRole
            status?: UserStatus
            name?: string
            email?: string
            wecomUserId?: string
            department?: string | null
            title?: string | null
            domainIds?: string[]
        }
    ) {
        const payload: Partial<{
            role: UserRole
            status: UserStatus
            name: string
            email: string
            wecomUserId: string | null
            department: string | null
            title: string | null
        }> = {}
        const uniqueDomainIds = data.domainIds ? [...new Set(data.domainIds.filter(Boolean))] : undefined

        if (data.role) {
            payload.role = data.role
        }

        if (data.status) {
            payload.status = data.status
        }

        if (data.name !== undefined) {
            payload.name = data.name.trim()
        }

        if (data.email !== undefined) {
            payload.email = data.email.trim()
        }

        if (data.wecomUserId !== undefined) {
            payload.wecomUserId = data.wecomUserId.trim()
        }

        if (data.department !== undefined) {
            const trimmed = data.department?.trim()
            payload.department = trimmed ? trimmed : null
        }

        if (data.title !== undefined) {
            const trimmed = data.title?.trim()
            payload.title = trimmed ? trimmed : null
        }

        if (!Object.keys(payload).length && uniqueDomainIds === undefined) {
            throw new Error('NO_UPDATES')
        }

        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                role: true,
                primaryOwnedDomains: {
                    select: { id: true },
                },
                backupOwnedDomains: {
                    select: { id: true },
                },
            },
        })

        if (!existingUser) {
            throw new Error('USER_NOT_FOUND')
        }

        const nextRole = payload.role ?? existingUser.role

        if (payload.role === 'SME' && existingUser.role !== 'SME' && uniqueDomainIds === undefined) {
            throw new Error('SME_ROLE_REQUIRES_DOMAIN_ASSIGNMENT')
        }

        if (uniqueDomainIds !== undefined && nextRole !== 'SME' && uniqueDomainIds.length > 0) {
            throw new Error('DOMAIN_ASSIGNMENT_REQUIRES_SME_ROLE')
        }

        if (nextRole === 'SME' && uniqueDomainIds !== undefined && uniqueDomainIds.length === 0) {
            throw new Error('SME_DOMAIN_REQUIRED')
        }

        try {
            const updatedUser = await prisma.$transaction(async (tx) => {
                if (nextRole !== 'SME' && (existingUser.primaryOwnedDomains.length > 0 || existingUser.backupOwnedDomains.length > 0)) {
                    await this.clearSmeDomainAssignments(tx, id)
                }

                await tx.user.update({
                    where: { id },
                    data: payload,
                })

                if (nextRole === 'SME' && uniqueDomainIds !== undefined) {
                    await this.syncSmeDomainAssignments(tx, id, uniqueDomainIds)
                }

                const user = await tx.user.findUnique({
                    where: { id },
                    select: adminUserSelect,
                })

                if (!user) {
                    throw new Error('USER_NOT_FOUND')
                }

                return user
            })

            return this.mapAdminUser(updatedUser)
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2025') {
                    throw new Error('USER_NOT_FOUND')
                }
                if (error.code === 'P2002') {
                    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '')
                    if (target.includes('email')) {
                        throw new Error('EMAIL_EXISTS')
                    }
                    if (target.includes('wecomUserId')) {
                        throw new Error('WECOM_USER_ID_EXISTS')
                    }
                }
            }
            throw error
        }
    }

    static async promoteUserToSme(id: string, domainIds: string[]) {
        const uniqueDomainIds = [...new Set(domainIds.filter(Boolean))]

        if (uniqueDomainIds.length === 0) {
            throw new Error('SME_DOMAIN_REQUIRED')
        }

        return prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({
                where: { id },
                select: adminUserSelect,
            })

            if (!user) {
                throw new Error('USER_NOT_FOUND')
            }

            if (user.role === 'ADMIN') {
                throw new Error('USER_ROLE_LOCKED')
            }

            if (user.role !== 'SME') {
                await tx.user.update({
                    where: { id },
                    data: { role: 'SME' },
                })
            }

            const assignments = await this.syncSmeDomainAssignments(tx, id, uniqueDomainIds)
            const updatedUser = await tx.user.findUnique({
                where: { id },
                select: adminUserSelect,
            })

            if (!updatedUser) {
                throw new Error('USER_NOT_FOUND')
            }

            return {
                user: this.mapAdminUser(updatedUser),
                assignments: assignments.map((assignment) => ({
                    domainId: assignment.domainId,
                    domainName: assignment.domainName,
                    slot: assignment.slot,
                })),
            }
        })
    }
}
