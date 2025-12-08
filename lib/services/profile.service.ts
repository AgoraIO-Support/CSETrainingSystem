import prisma from '@/lib/prisma'

const PROFILE_SELECT = {
    id: true,
    email: true,
    name: true,
    role: true,
    avatar: true,
    bio: true,
    title: true,
    department: true,
    createdAt: true,
    lastLoginAt: true,
} as const

const normalizeOptional = (value?: string | null) => {
    if (value === undefined) return undefined
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

export class ProfileService {
    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: PROFILE_SELECT,
        })

        if (!user) {
            throw new Error('USER_NOT_FOUND')
        }

        return user
    }

    static async updateProfile(
        userId: string,
        data: {
            name: string
            title?: string | null
            department?: string | null
            bio?: string | null
            avatar?: string | null
        }
    ) {
        const updated = await prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name,
                title: normalizeOptional(data.title ?? undefined),
                department: normalizeOptional(data.department ?? undefined),
                bio: normalizeOptional(data.bio ?? undefined),
                avatar: normalizeOptional(data.avatar ?? undefined),
            },
            select: PROFILE_SELECT,
        })

        return updated
    }
}
