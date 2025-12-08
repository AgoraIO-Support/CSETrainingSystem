import prisma from '@/lib/prisma'
import { Prisma, UserRole, UserStatus } from '@prisma/client'

interface GetUserParams {
    page?: number
    limit?: number
    search?: string
    role?: UserRole
    status?: UserStatus
}

export class UserService {
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

        const statsPromise = prisma.$transaction([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.user.count({ where: { role: 'ADMIN' } }),
            prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
        ])

        const [users, totalFiltered, statsCounts] = await Promise.all([
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
            statsPromise,
        ])

        const [totalUsers, activeUsers, adminUsers, newThisMonth] = statsCounts

        const formattedUsers = users.map(user => {
            const enrollmentCount = user.enrollments.length
            const completedCourses = user.enrollments.filter(enrollment => enrollment.status === 'COMPLETED').length

            return {
                id: user.id,
                name: user.name,
                email: user.email,
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
        }
    ) {
        const payload: Partial<{ role: UserRole; status: UserStatus }> = {}

        if (data.role) {
            payload.role = data.role
        }

        if (data.status) {
            payload.status = data.status
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
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new Error('USER_NOT_FOUND')
            }
            throw error
        }
    }
}
