import { Course, Instructor, User, Quiz, Achievement } from '@/types'

export const mockInstructors: Instructor[] = [
    {
        id: '1',
        name: 'Sarah Johnson',
        title: 'Senior Solutions Engineer',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
        bio: '10+ years of experience in real-time communications and SDK development.',
    },
    {
        id: '2',
        name: 'Michael Chen',
        title: 'Lead Technical Instructor',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
        bio: 'Expert in video streaming technologies and developer education.',
    },
    {
        id: '3',
        name: 'Emily Rodriguez',
        title: 'Principal Engineer',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily',
        bio: 'Specializes in WebRTC and real-time video solutions.',
    },
]

export const mockCourses: Course[] = [
    {
        id: '1',
        title: 'Agora SDK Fundamentals',
        description: 'Learn the basics of Agora SDK integration for real-time video and audio communication.',
        instructor: mockInstructors[0],
        thumbnail: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400',
        duration: 7200, // 2 hours
        level: 'BEGINNER',
        category: 'SDK Integration',
        rating: 4.8,
        reviewCount: 245,
        enrolledCount: 1250,
        tags: ['SDK', 'Video', 'Audio', 'WebRTC'],
        chapters: [
            {
                id: 'ch1',
                title: 'Getting Started',
                lessons: [
                    { id: 'l1', title: 'Introduction to Agora', duration: 600, videoUrl: '/videos/intro.mp4', subtitleUrl: '/subtitles/intro.vtt' },
                    { id: 'l2', title: 'Setting Up Your Environment', duration: 900, videoUrl: '/videos/setup.mp4' },
                    { id: 'l3', title: 'Creating Your First Project', duration: 1200, videoUrl: '/videos/first-project.mp4' },
                ],
            },
            {
                id: 'ch2',
                title: 'Core Concepts',
                lessons: [
                    { id: 'l4', title: 'Understanding Channels', duration: 800, videoUrl: '/videos/channels.mp4' },
                    { id: 'l5', title: 'User Roles and Permissions', duration: 700, videoUrl: '/videos/roles.mp4' },
                    { id: 'l6', title: 'Token Authentication', duration: 1000, videoUrl: '/videos/auth.mp4' },
                ],
            },
        ],
    },
    {
        id: '2',
        title: 'Advanced Video Calling Features',
        description: 'Master advanced features like screen sharing, recording, and custom video layouts.',
        instructor: mockInstructors[1],
        thumbnail: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400',
        duration: 10800, // 3 hours
        level: 'ADVANCED',
        category: 'Video Solutions',
        rating: 4.9,
        reviewCount: 189,
        enrolledCount: 850,
        tags: ['Video', 'Screen Share', 'Recording'],
        chapters: [
            {
                id: 'ch1',
                title: 'Screen Sharing',
                lessons: [
                    { id: 'l1', title: 'Screen Share Basics', duration: 900, videoUrl: '/videos/screen-share.mp4' },
                    { id: 'l2', title: 'Advanced Screen Share Controls', duration: 1100, videoUrl: '/videos/advanced-screen.mp4' },
                ],
            },
        ],
    },
    {
        id: '3',
        title: 'Cloud Recording with Agora',
        description: 'Learn how to implement cloud recording for your video calls and live streams.',
        instructor: mockInstructors[2],
        thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400',
        duration: 5400, // 1.5 hours
        level: 'INTERMEDIATE',
        category: 'Recording',
        rating: 4.7,
        reviewCount: 156,
        enrolledCount: 620,
        tags: ['Recording', 'Cloud', 'Storage'],
        chapters: [
            {
                id: 'ch1',
                title: 'Recording Basics',
                lessons: [
                    { id: 'l1', title: 'Introduction to Cloud Recording', duration: 600, videoUrl: '/videos/cloud-intro.mp4' },
                    { id: 'l2', title: 'Configuring Recording', duration: 900, videoUrl: '/videos/config-recording.mp4' },
                ],
            },
        ],
    },
    {
        id: '4',
        title: 'Real-Time Messaging Integration',
        description: 'Integrate real-time messaging and signaling into your applications.',
        instructor: mockInstructors[0],
        thumbnail: 'https://images.unsplash.com/photo-1611746872915-64382b5c76da?w=400',
        duration: 6000,
        level: 'INTERMEDIATE',
        category: 'Messaging',
        rating: 4.6,
        reviewCount: 203,
        enrolledCount: 980,
        tags: ['Messaging', 'Signaling', 'RTM'],
        chapters: [
            {
                id: 'ch1',
                title: 'RTM Basics',
                lessons: [
                    { id: 'l1', title: 'Understanding RTM', duration: 700, videoUrl: '/videos/rtm-intro.mp4' },
                    { id: 'l2', title: 'Message Types', duration: 800, videoUrl: '/videos/message-types.mp4' },
                ],
            },
        ],
    },
]

export const mockCurrentUser: User = {
    id: 'user1',
    name: 'John Doe',
    email: 'john.doe@agora.io',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
    role: 'user',
    enrolledCourses: ['1', '2', '3'],
    completedCourses: ['3'],
    progress: {
        '1': 45,
        '2': 20,
        '3': 100,
    },
}

export const mockQuizzes: Quiz[] = [
    {
        id: 'quiz1',
        courseId: '1',
        title: 'Agora SDK Fundamentals - Final Quiz',
        passingScore: 70,
        timeLimit: 1800, // 30 minutes
        questions: [
            {
                id: 'q1',
                type: 'multiple-choice',
                question: 'What is the primary purpose of the Agora SDK?',
                options: [
                    'File storage',
                    'Real-time video and audio communication',
                    'Database management',
                    'Email services',
                ],
                correctAnswer: 1,
                explanation: 'Agora SDK is designed for real-time video and audio communication.',
            },
            {
                id: 'q2',
                type: 'true-false',
                question: 'Token authentication is optional and not recommended for production.',
                options: ['True', 'False'],
                correctAnswer: 1,
                explanation: 'Token authentication is highly recommended for production environments to ensure security.',
            },
            {
                id: 'q3',
                type: 'multiple-choice',
                question: 'Which of the following is a valid user role in Agora?',
                options: ['Host', 'Guest', 'Administrator', 'All of the above'],
                correctAnswer: 0,
                explanation: 'Host is a valid user role in Agora SDK.',
            },
        ],
    },
]

export const mockAchievements: Achievement[] = [
    {
        id: 'a1',
        title: 'First Course Completed',
        description: 'Completed your first training course',
        icon: '🎓',
        earnedAt: new Date('2024-11-15'),
    },
    {
        id: 'a2',
        title: 'Quick Learner',
        description: 'Completed 3 courses in one month',
        icon: '⚡',
        earnedAt: new Date('2024-11-20'),
    },
    {
        id: 'a3',
        title: 'Quiz Master',
        description: 'Scored 100% on a quiz',
        icon: '🏆',
        earnedAt: new Date('2024-11-25'),
    },
]
