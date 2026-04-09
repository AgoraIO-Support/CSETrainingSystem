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
            select: {
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
            },
        })

        return {
            ...created,
            enrollmentCount: 0,
            completedCourses: 0,
        }
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
                include: {
                    enrollments: {
                        select: {
                            status: true,
                        },
                    },
                },
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

        const formattedUsers = users.map(user => {
            const enrollmentCount = user.enrollments.length
            const completedCourses = user.enrollments.filter(enrollment => enrollment.status === 'COMPLETED').length

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
            }
        })

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

        if (!Object.keys(payload).length) {
            throw new Error('NO_UPDATES')
        }

        try {
            const updatedUser = await prisma.user.update({
                where: { id },
                data: payload,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    wecomUserId: true,
                    role: true,
                    status: true,
                    department: true,
                    title: true,
                    avatar: true,
                    createdAt: true,
                    lastLoginAt: true,
                },
            })

            return updatedUser
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
}
