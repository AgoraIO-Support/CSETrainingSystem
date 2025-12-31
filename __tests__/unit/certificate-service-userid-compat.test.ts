import { CertificateService } from '@/lib/services/certificate.service'

jest.mock('@/lib/services/file.service', () => ({
    FileService: {
        getAssetAccessUrl: jest.fn(async (key: string) => `https://assets.example/${key}`),
    },
}))

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        certificate: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
        },
        exam: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
    },
}))

const prisma = (jest.requireMock('@/lib/prisma') as any).default as {
    certificate: { findMany: jest.Mock; findUnique: jest.Mock }
    user: { findUnique: jest.Mock; findFirst: jest.Mock }
    exam: { findMany: jest.Mock; findUnique: jest.Mock }
}

describe('CertificateService userId compatibility', () => {
    beforeEach(() => {
        prisma.certificate.findMany.mockReset()
        prisma.certificate.findUnique.mockReset()
        prisma.user.findUnique.mockReset()
        prisma.user.findFirst.mockReset()
        prisma.exam.findMany.mockReset()
        prisma.exam.findUnique.mockReset()
    })

    it('lists certificates when they are keyed by legacy supabase user id', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 'db-user-id',
            name: 'Alice',
            email: 'alice@agora.io',
            supabaseId: 'sb-user-id',
        })

        prisma.certificate.findMany.mockImplementation(async (args: any) => {
            expect(args.where.OR[0].userId.in).toEqual(['db-user-id', 'sb-user-id', 'alice@agora.io'])
            expect(args.where.OR[1].attempt.is.userId).toEqual('db-user-id')
            return [
                {
                    id: 'cert-1',
                    certificateNumber: 'CERT-001',
                    userId: 'sb-user-id',
                    courseId: null,
                    examId: 'exam-1',
                    issueDate: new Date('2025-01-01T00:00:00Z'),
                    pdfUrl: 'https://example/cert.pdf',
                    pdfS3Key: 'certificates/sb-user-id/CERT-001.pdf',
                    status: 'ISSUED',
                    revokedAt: null,
                    recipientName: 'Alice',
                    examTitle: 'Exam 1',
                    courseTitle: null,
                    score: 80,
                    certificateTitle: 'Completion',
                    badgeMode: 'UPLOADED',
                    badgeS3Key: 'badges/b1.png',
                    badgeMimeType: 'image/png',
                    badgeStyle: null,
                },
            ]
        })

        prisma.exam.findMany.mockResolvedValue([{ id: 'exam-1', totalScore: 100 }])

        const result = await CertificateService.getUserCertificates('db-user-id')
        expect(result).toHaveLength(1)
        expect(result[0]?.userId).toBe('sb-user-id')
        expect(result[0]?.badgeUrl).toBe('https://assets.example/badges/b1.png')
    })

    it('allows certificate detail lookup to resolve user by supabaseId when certificate.userId is supabase id', async () => {
        prisma.certificate.findUnique.mockResolvedValue({
            id: 'cert-1',
            certificateNumber: 'CERT-001',
            userId: 'sb-user-id',
            courseId: null,
            examId: 'exam-1',
            issueDate: new Date('2025-01-01T00:00:00Z'),
            pdfUrl: null,
            pdfS3Key: null,
            status: 'ISSUED',
            revokedAt: null,
            recipientName: null,
            examTitle: 'Exam 1',
            courseTitle: null,
            score: 80,
            certificateTitle: 'Completion',
            badgeMode: null,
            badgeS3Key: null,
            badgeMimeType: null,
            badgeStyle: null,
        })

        prisma.user.findFirst.mockImplementation(async (args: any) => {
            expect(args.where.OR).toEqual([{ id: 'sb-user-id' }, { supabaseId: 'sb-user-id' }, { email: 'sb-user-id' }])
            return { name: 'Alice', email: 'alice@agora.io' }
        })

        prisma.exam.findUnique.mockResolvedValue({ totalScore: 100 })

        const certificate = await CertificateService.getCertificateById('cert-1')
        expect(certificate?.userName).toBe('Alice')
    })

    it('lists certificates when they are keyed by user email', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 'db-user-id',
            name: 'Alice',
            email: 'alice@agora.io',
            supabaseId: null,
        })

        prisma.certificate.findMany.mockImplementation(async (args: any) => {
            expect(args.where.OR[0].userId.in).toEqual(['db-user-id', 'alice@agora.io'])
            expect(args.where.OR[1].attempt.is.userId).toEqual('db-user-id')
            return [
                {
                    id: 'cert-1',
                    certificateNumber: 'CERT-001',
                    userId: 'alice@agora.io',
                    courseId: null,
                    examId: null,
                    issueDate: new Date('2025-01-01T00:00:00Z'),
                    pdfUrl: null,
                    pdfS3Key: null,
                    status: 'ISSUED',
                    revokedAt: null,
                    recipientName: 'Alice',
                    examTitle: 'Exam 1',
                    courseTitle: null,
                    score: 80,
                    certificateTitle: 'Completion',
                    badgeMode: null,
                    badgeS3Key: null,
                    badgeMimeType: null,
                    badgeStyle: null,
                },
            ]
        })

        prisma.exam.findMany.mockResolvedValue([])

        const result = await CertificateService.getUserCertificates('db-user-id')
        expect(result).toHaveLength(1)
        expect(result[0]?.userId).toBe('alice@agora.io')
    })
})
