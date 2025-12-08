const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting database seed...')

    // Hash password for all seed users
    const passwordHash = await bcrypt.hash('password123', 10)

    // Create admin user
    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@agora.io' },
        update: {
            password: passwordHash,
        },
        create: {
            email: 'admin@agora.io',
            name: 'Admin User',
            password: passwordHash,
            role: 'ADMIN',
            status: 'ACTIVE',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
            title: 'System Administrator',
            department: 'IT',
        },
    })

    console.log('✅ Created admin user:', adminUser.email)

    // Create instructor users
    const instructor1 = await prisma.user.upsert({
        where: { email: 'john.smith@agora.io' },
        update: {
            password: passwordHash,
        },
        create: {
            email: 'john.smith@agora.io',
            name: 'John Smith',
            password: passwordHash,
            role: 'ADMIN',
            status: 'ACTIVE',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
            title: 'Senior Solutions Architect',
            department: 'Engineering',
            bio: '10+ years of experience in real-time communication solutions.',
        },
    })

    const instructor2 = await prisma.user.upsert({
        where: { email: 'sarah.chen@agora.io' },
        update: {
            password: passwordHash,
        },
        create: {
            email: 'sarah.chen@agora.io',
            name: 'Sarah Chen',
            password: passwordHash,
            role: 'ADMIN',
            status: 'ACTIVE',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
            title: 'Lead Developer Advocate',
            department: 'Developer Relations',
            bio: 'Passionate about helping developers build amazing real-time experiences.',
        },
    })

    console.log('✅ Created instructor users')

    // Create sample regular user
    const regularUser = await prisma.user.upsert({
        where: { email: 'user@agora.io' },
        update: {
            password: passwordHash,
        },
        create: {
            email: 'user@agora.io',
            name: 'Test User',
            password: passwordHash,
            role: 'USER',
            status: 'ACTIVE',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User',
            department: 'CSE',
        },
    })

    console.log('✅ Created regular user')

    // Create courses
    const course1 = await prisma.course.upsert({
        where: { slug: 'agora-sdk-fundamentals' },
        update: {},
        create: {
            title: 'Agora SDK Fundamentals',
            slug: 'agora-sdk-fundamentals',
            description: 'Learn the basics of integrating Agora SDK into your applications. This comprehensive course covers video calling, voice calling, and live streaming fundamentals.',
            thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
            level: 'BEGINNER',
            status: 'PUBLISHED',
            category: 'SDK Integration',
            tags: ['SDK', 'Getting Started', 'Video', 'Audio'],
            duration: 7200,
            instructorId: instructor1.id,
            rating: 4.8,
            reviewCount: 124,
            enrolledCount: 456,
        },
    })

    const course2 = await prisma.course.upsert({
        where: { slug: 'advanced-rtc-optimization' },
        update: {},
        create: {
            title: 'Advanced RTC Optimization',
            slug: 'advanced-rtc-optimization',
            description: 'Master advanced techniques for optimizing real-time communication applications. Learn about bandwidth management, quality optimization, and performance tuning.',
            thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
            level: 'ADVANCED',
            status: 'PUBLISHED',
            category: 'Performance',
            tags: ['RTC', 'Optimization', 'Performance', 'Advanced'],
            duration: 10800,
            instructorId: instructor1.id,
            rating: 4.9,
            reviewCount: 87,
            enrolledCount: 203,
        },
    })

    const course3 = await prisma.course.upsert({
        where: { slug: 'live-streaming-essentials' },
        update: {},
        create: {
            title: 'Live Streaming Essentials',
            slug: 'live-streaming-essentials',
            description: 'Build professional live streaming applications. Covers CDN integration, adaptive bitrate streaming, and audience engagement features.',
            thumbnail: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800',
            level: 'INTERMEDIATE',
            status: 'PUBLISHED',
            category: 'Live Streaming',
            tags: ['LiveStreaming', 'CDN', 'Engagement'],
            duration: 9000,
            instructorId: instructor2.id,
            rating: 4.7,
            reviewCount: 95,
            enrolledCount: 312,
        },
    })

    console.log('✅ Created courses')

    // Create chapters and lessons for course 1
    const chapter1 = await prisma.chapter.create({
        data: {
            courseId: course1.id,
            title: 'Getting Started with Agora',
            description: 'Introduction to Agora platform and SDK setup',
            order: 1,
        },
    })

    await prisma.lesson.createMany({
        data: [
            {
                chapterId: chapter1.id,
                title: 'What is Agora?',
                description: 'Overview of Agora platform and its capabilities',
                order: 1,
                duration: 600,
                transcript: 'Welcome to Agora SDK Fundamentals. Agora is a leading real-time engagement platform...',
            },
            {
                chapterId: chapter1.id,
                title: 'SDK Installation',
                description: 'How to install and configure Agora SDK',
                order: 2,
                duration: 900,
                transcript: 'In this lesson, we will walk through the process of installing the Agora SDK...',
            },
        ],
    })

    const chapter2 = await prisma.chapter.create({
        data: {
            courseId: course1.id,
            title: 'Building Your First Video Call',
            description: 'Create a basic video calling application',
            order: 2,
        },
    })

    await prisma.lesson.createMany({
        data: [
            {
                chapterId: chapter2.id,
                title: 'Initialize the SDK',
                description: 'Setting up the Agora SDK in your application',
                order: 1,
                duration: 1200,
            },
            {
                chapterId: chapter2.id,
                title: 'Join a Channel',
                description: 'Implementing channel joining logic',
                order: 2,
                duration: 1500,
            },
        ],
    })

    console.log('✅ Created chapters and lessons')

    // Create achievements
    const achievements = await prisma.achievement.createMany({
        data: [
            {
                title: 'First Steps',
                description: 'Complete your first course',
                icon: '🎯',
                criteria: JSON.stringify({ type: 'complete_course', count: 1 }),
            },
            {
                title: 'Quick Learner',
                description: 'Complete a course with 90%+ score',
                icon: '⚡',
                criteria: JSON.stringify({ type: 'course_score', score: 90 }),
            },
            {
                title: 'Knowledge Seeker',
                description: 'Complete 5 courses',
                icon: '📚',
                criteria: JSON.stringify({ type: 'complete_course', count: 5 }),
            },
            {
                title: 'Perfect Score',
                description: 'Get 100% on a quiz',
                icon: '💯',
                criteria: JSON.stringify({ type: 'quiz_score', score: 100 }),
            },
        ],
    })

    console.log('✅ Created achievements')

    // Create AI prompt templates
    await prisma.aIPromptTemplate.createMany({
        data: [
            {
                name: 'lesson_assistant',
                description: 'General lesson assistance prompt',
                template: 'You are a helpful AI assistant for the Agora training platform. Help the user understand the lesson content about {{lessonTitle}}. Context: {{context}}',
                variables: ['lessonTitle', 'context'],
                isActive: true,
            },
            {
                name: 'code_helper',
                description: 'Help with code examples',
                template: 'You are a coding assistant. Help the user understand and debug code related to Agora SDK. Course: {{courseTitle}}, Current topic: {{topic}}',
                variables: ['courseTitle', 'topic'],
                isActive: true,
            },
        ],
    })

    console.log('✅ Created AI prompt templates')

    // Enroll regular user in a course
    await prisma.enrollment.create({
        data: {
            userId: regularUser.id,
            courseId: course1.id,
            status: 'ACTIVE',
            progress: 25,
        },
    })

    console.log('✅ Created sample enrollment')

    console.log('🎉 Database seeding completed successfully!')
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
