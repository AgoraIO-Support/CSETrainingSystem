import prisma from '@/lib/prisma'
import { CourseLevel, CourseStatus, Prisma } from '@prisma/client'
import { FileService } from './file.service'
import { getActiveTranscriptTracks, getDefaultSubtitleTrack, getTranscriptLabel } from '@/lib/transcript-tracks'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i
const isAbsoluteUrl = (value?: string | null) => typeof value === 'string' && ABSOLUTE_URL_REGEX.test(value)

export class CourseService {
    /**
     * Get paginated course list
     */
    static async getCourses(params: {
        page?: number
        limit?: number
        category?: string
        level?: CourseLevel
        search?: string
        status?: CourseStatus | 'ALL'
    }) {
        const page = params.page || 1
        const limit = params.limit || 10
        const skip = (page - 1) * limit

        const where: Prisma.CourseWhereInput = {}

        const statusFilter = params.status
        if (statusFilter && statusFilter !== 'ALL') {
            where.status = statusFilter
        } else if (!statusFilter) {
            where.status = 'PUBLISHED' // Default to published courses for public requests
        }

        if (params.category) {
            where.category = params.category
        }

        if (params.level) {
            where.level = params.level
        }

        if (params.search) {
            const query = params.search.trim()
            if (query) {
                where.OR = [
                    { title: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } },
                    { category: { contains: query, mode: 'insensitive' } },
                    { instructor: { name: { contains: query, mode: 'insensitive' } } },
                ]
            }
        }

        const [courses, total] = await Promise.all([
            prisma.course.findMany({
                where,
                skip,
                take: limit,
                include: {
                    instructor: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                            title: true,
                        },
                    },
                    _count: {
                        select: {
                            chapters: true,
                            enrollments: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.course.count({ where }),
        ])

        return {
            courses,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    /**
     * Get course by ID
     */
    static async getCourseById(idOrSlug: string, userId?: string) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            idOrSlug
        )

        const course = await prisma.course.findFirst({
            where: isUuid ? { id: idOrSlug } : { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
            include: {
                instructor: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true,
                        title: true,
                        bio: true,
                    },
                },
                chapters: {
                    include: {
                        lessons: {
                            include: {
                                assets: {
                                    include: { courseAsset: true },
                                    orderBy: { createdAt: 'asc' },
                                },
                                transcripts: {
                                    where: {
                                        isActive: true,
                                        archivedAt: null,
                                    },
                                    select: {
                                        id: true,
                                        s3Key: true,
                                        url: true,
                                        language: true,
                                        label: true,
                                        isDefaultSubtitle: true,
                                        isPrimaryForAI: true,
                                        createdAt: true,
                                    },
                                    orderBy: [{ isDefaultSubtitle: 'desc' }, { isPrimaryForAI: 'desc' }, { createdAt: 'asc' }],
                                },
                            },
                            orderBy: { order: 'asc' },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
                assets: {
                    orderBy: { createdAt: 'desc' },
                },
                aiConfig: {
                    select: { isEnabled: true },
                },
            },
        })

        if (!course) {
            throw new Error('COURSE_NOT_FOUND')
        }

        let isEnrolled = false
        let progress = 0

        if (userId) {
            const enrollment = await prisma.enrollment.findUnique({
                where: {
                    userId_courseId: {
                        userId,
                        courseId: course.id,
                    },
                },
            })

            if (enrollment) {
                isEnrolled = true
                progress = enrollment.progress
            }
        }

        const chapters = await Promise.all(
            course.chapters.map(async (ch) => {
                const lessons = await Promise.all(
                    ch.lessons.map(async (lesson) => {
                        const transcriptTracks = getActiveTranscriptTracks(lesson.transcripts ?? [])
                        const subtitleTracks = await Promise.all(
                            transcriptTracks.map(async (track) => ({
                                id: track.id,
                                src: track.s3Key
                                    ? await FileService.getAssetAccessUrl(track.s3Key)
                                    : track.url
                                        ? isAbsoluteUrl(track.url)
                                            ? track.url
                                            : await FileService.getAssetAccessUrl(track.url)
                                        : '',
                                srclang: track.language,
                                label: getTranscriptLabel(track),
                                default: track.isDefaultSubtitle,
                                isPrimaryForAI: track.isPrimaryForAI,
                            }))
                        )

                        const defaultSubtitleTrack = getDefaultSubtitleTrack(transcriptTracks)
                        const subtitleUrl = defaultSubtitleTrack?.s3Key
                            ? await FileService.getAssetAccessUrl(defaultSubtitleTrack.s3Key)
                            : lesson.subtitleKey
                                ? await FileService.getAssetAccessUrl(lesson.subtitleKey)
                                : lesson.subtitleUrl
                                    ? isAbsoluteUrl(lesson.subtitleUrl)
                                        ? lesson.subtitleUrl
                                        : await FileService.getAssetAccessUrl(lesson.subtitleUrl)
                                    : null

                        const videoUrl = lesson.videoKey
                            ? await FileService.getAssetAccessUrl(lesson.videoKey)
                            : lesson.videoUrl
                                ? isAbsoluteUrl(lesson.videoUrl)
                                    ? lesson.videoUrl
                                    : await FileService.getAssetAccessUrl(lesson.videoUrl)
                                : null

                        const assets = await Promise.all(
                            lesson.assets.map(async (binding) => {
                                const asset = binding.courseAsset
                                const url = asset?.s3Key
                                    ? await FileService.getAssetAccessUrl(asset.s3Key)
                                    : asset?.cloudfrontUrl || asset?.url || null

                                return {
                                    ...asset,
                                    id: asset.id,
                                    url,
                                    mimeType: asset.mimeType ?? asset.contentType,
                                }
                            })
                        )

                        return {
                            ...lesson,
                            videoUrl,
                            subtitleUrl,
                            subtitleTracks: subtitleTracks.filter((track) => Boolean(track.src)),
                            assets,
                        }
                    })
                )

                return {
                    ...ch,
                    lessons,
                }
            })
        )

        const { aiConfig, ...courseRest } = course as any
        const aiAssistantEnabled: boolean = aiConfig?.isEnabled ?? true

        return {
            ...courseRest,
            chapters,
            isEnrolled,
            progress,
            aiAssistantEnabled,
        }
    }

    /**
     * Create a new course (Admin only)
     */
    static async createCourse(data: {
        title: string
        slug: string
        description: string
        thumbnail?: string
        level: CourseLevel
        category: string
        tags: string[]
        learningOutcomes?: string[]
        requirements?: string[]
        instructorId: string
        status?: CourseStatus
    }) {
        // Check if slug already exists
        const existing = await prisma.course.findUnique({
            where: { slug: data.slug },
        })

        if (existing) {
            // Auto-resolve slug conflicts by appending an incremental suffix: slug-2, slug-3, ...
            const base = data.slug
            let suffix = 2
            let candidate = `${base}-${suffix}`
            // Cap attempts to avoid infinite loop in pathological cases
            while (suffix < 1000) {
                const conflict = await prisma.course.findUnique({ where: { slug: candidate } })
                if (!conflict) {
                    data.slug = candidate
                    break
                }
                suffix += 1
                candidate = `${base}-${suffix}`
            }
            if (suffix >= 1000) {
                throw new Error('SLUG_EXISTS')
            }
        }

        return await prisma.course.create({
            data: {
                ...data,
                learningOutcomes: data.learningOutcomes ?? [],
                requirements: data.requirements ?? [],
                status: data.status ?? 'DRAFT',
                duration: 0, // Will be calculated from lessons
            },
            include: {
                instructor: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true,
                    },
                },
            },
        })
    }

    /**
     * Update course
     */
    static async updateCourse(id: string, data: Partial<{
        title: string
        slug: string
        description: string
        thumbnail: string
        level: CourseLevel
        category: string
        tags: string[]
        status: CourseStatus
        instructorId: string
        learningOutcomes: string[]
        requirements: string[]
    }>) {
        if (data.slug) {
            const existing = await prisma.course.findFirst({
                where: {
                    slug: data.slug,
                    NOT: { id },
                },
            })

            if (existing) {
                throw new Error('SLUG_EXISTS')
            }
        }

        return await prisma.course.update({
            where: { id },
            data,
        })
    }

    /**
     * Delete course
     */
    static async deleteCourse(id: string) {
        return await prisma.course.delete({
            where: { id },
        })
    }

    /**
     * Enroll user in course
     */
    static async enrollUser(userId: string, courseId: string) {
        // Check if course exists and is published. Only PUBLISHED courses are enrollable.
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, status: true },
        })

        if (!course || course.status !== 'PUBLISHED') {
            throw new Error('COURSE_NOT_FOUND')
        }

        // Check if already enrolled
        const existing = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        })

        if (existing) {
            throw new Error('ALREADY_ENROLLED')
        }

        // Create enrollment
        const enrollment = await prisma.enrollment.create({
            data: {
                userId,
                courseId,
                status: 'ACTIVE',
            },
        })

        // Update enrolled count
        await prisma.course.update({
            where: { id: courseId },
            data: {
                enrolledCount: {
                    increment: 1,
                },
            },
        })

        return enrollment
    }
}
