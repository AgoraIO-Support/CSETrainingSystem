#!/usr/bin/env node

const { PrismaClient } = require('/app/node_modules/@prisma/client')

const prisma = new PrismaClient()

async function main() {
    const courseId = (process.argv[2] || '').trim()

    if (!courseId) {
        throw new Error('COURSE_ID_REQUIRED')
    }

    const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
            id: true,
            chapters: {
                orderBy: [{ order: 'desc' }, { createdAt: 'desc' }],
                take: 1,
                select: {
                    order: true,
                },
            },
        },
    })

    if (!course) {
        throw new Error('COURSE_NOT_FOUND')
    }

    const nextChapterOrder = (course.chapters[0]?.order ?? 0) + 1

    const chapter = await prisma.chapter.create({
        data: {
            courseId,
            title: 'MCP Transcript Smoke Chapter',
            description: 'Auto-generated transcript smoke fixture',
            order: nextChapterOrder,
        },
    })

    const lesson = await prisma.lesson.create({
        data: {
            chapterId: chapter.id,
            title: 'MCP Transcript Smoke Lesson',
            description: 'Auto-generated transcript smoke fixture',
            order: 1,
            duration: 300,
            durationMinutes: 5,
            lessonType: 'VIDEO',
            completionRule: 'VIEW_ASSETS',
            content: 'Transcript smoke test fixture created by scripts/mcp/test-sme-mcp.sh',
        },
    })

    const videoAsset = await prisma.courseAsset.create({
        data: {
            courseId,
            title: 'MCP Transcript Smoke Video',
            description: 'Synthetic video asset for transcript smoke',
            type: 'VIDEO',
            url: 'https://example.com/mcp-transcript-smoke.mp4',
            s3Key: `videos/${lesson.id}.mp4`,
            contentType: 'video/mp4',
            mimeType: 'video/mp4',
        },
    })

    await prisma.lessonAsset.create({
        data: {
            lessonId: lesson.id,
            courseAssetId: videoAsset.id,
        },
    })

    process.stdout.write(
        JSON.stringify(
            {
                chapterId: chapter.id,
                lessonId: lesson.id,
                videoAssetId: videoAsset.id,
            },
            null,
            2
        )
    )
}

main()
    .catch(async (error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
