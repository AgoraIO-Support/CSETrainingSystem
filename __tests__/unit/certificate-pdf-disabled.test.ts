import fs from 'fs'
import path from 'path'

import { CertificateService } from '@/lib/services/certificate.service'

jest.mock('@/lib/services/email.service', () => ({
    EmailService: {
        sendCertificate: jest.fn(async () => ({ success: true })),
    },
}))

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
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
        },
        exam: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        examAttempt: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        examCertificateTemplate: {
            findUnique: jest.fn(),
        },
    },
}))

const prisma = (jest.requireMock('@/lib/prisma') as any).default as {
    certificate: {
        findMany: jest.Mock
        findUnique: jest.Mock
        findFirst: jest.Mock
        create: jest.Mock
        update: jest.Mock
    }
    user: { findUnique: jest.Mock; findFirst: jest.Mock }
    exam: { findUnique: jest.Mock; findMany: jest.Mock }
    examAttempt: { findUnique: jest.Mock; findMany: jest.Mock }
    examCertificateTemplate: { findUnique: jest.Mock }
}

describe('Certificate PDF removal', () => {
    beforeEach(() => {
        prisma.certificate.findMany.mockReset()
        prisma.certificate.findUnique.mockReset()
        prisma.certificate.findFirst.mockReset()
        prisma.certificate.create.mockReset()
        prisma.certificate.update.mockReset()
        prisma.user.findUnique.mockReset()
        prisma.user.findFirst.mockReset()
        prisma.exam.findUnique.mockReset()
        prisma.exam.findMany.mockReset()
        prisma.examAttempt.findUnique.mockReset()
        prisma.examAttempt.findMany.mockReset()
        prisma.examCertificateTemplate.findUnique.mockReset()

        // Backfill runs on list calls; default to none.
        prisma.examAttempt.findMany.mockResolvedValue([])
    })

    it('removes the certificate download route file', () => {
        const tsPath = path.join(process.cwd(), 'app', 'api', 'certificates', '[id]', 'download', 'route.ts')
        const jsPath = path.join(process.cwd(), 'app', 'api', 'certificates', '[id]', 'download', 'route.js')
        expect(fs.existsSync(tsPath)).toBe(false)
        expect(fs.existsSync(jsPath)).toBe(false)
    })

    it('does not generate or store a PDF when generating a certificate', async () => {
        prisma.examAttempt.findUnique.mockResolvedValue({
            id: 'attempt-1',
            userId: 'user-1',
            examId: 'exam-1',
            passed: true,
            rawScore: 95,
            percentageScore: 95,
            user: { id: 'user-1', name: 'Admin User', email: 'admin@agora.io' },
            exam: { id: 'exam-1', title: 'ConvoAI Studio', totalScore: 100 },
        })

        prisma.examCertificateTemplate.findUnique.mockResolvedValue({
            examId: 'exam-1',
            isEnabled: true,
            title: 'ConvoAI Studio Certificate',
            badgeMode: 'AUTO',
            badgeS3Key: null,
            badgeMimeType: null,
            badgeStyle: { theme: 'blue', variant: 'default' },
        })

        prisma.certificate.findFirst.mockResolvedValue(null)

        prisma.certificate.create.mockImplementation(async ({ data }: any) => {
            expect(data.pdfUrl).toBeNull()
            expect(data.pdfS3Key).toBeNull()
            return {
                id: 'cert-1',
                ...data,
                status: 'ISSUED',
                revokedAt: null,
            }
        })

        const result = await CertificateService.generateCertificate('user-1', 'attempt-1', false)

        expect(result.pdfUrl).toBeNull()
        expect(result.certificate.pdfUrl).toBeNull()
        expect(prisma.certificate.create).toHaveBeenCalledTimes(1)
    })

    it('reissue does not create a PDF and clears any existing pdfUrl', async () => {
        prisma.certificate.findUnique.mockResolvedValue({
            id: 'cert-1',
            userId: 'user-1',
            examId: 'exam-1',
            attemptId: 'attempt-1',
            certificateNumber: 'CSE-2025-ABCDE',
            issueDate: new Date('2025-01-01T00:00:00Z'),
            status: 'ISSUED',
            revokedAt: null,
            revokedById: null,
            recipientName: 'Admin User',
            examTitle: 'ConvoAI Studio',
            courseTitle: null,
            courseId: null,
            score: 95,
            pdfUrl: 'https://example.invalid/old.pdf',
            pdfS3Key: 'certificates/user-1/CSE-2025-ABCDE.pdf',
            badgeMode: 'AUTO',
            badgeS3Key: null,
            badgeMimeType: null,
            badgeStyle: { theme: 'blue', variant: 'default' },
        })

        prisma.examCertificateTemplate.findUnique.mockResolvedValue({
            examId: 'exam-1',
            isEnabled: true,
            title: 'ConvoAI Studio Certificate',
            badgeMode: 'AUTO',
            badgeS3Key: null,
            badgeMimeType: null,
            badgeStyle: { theme: 'blue', variant: 'default' },
        })

        prisma.certificate.update.mockImplementation(async ({ data }: any) => {
            expect(data.pdfUrl).toBeNull()
            expect(data.pdfS3Key).toBeNull()
            return {
                id: 'cert-1',
                status: 'ISSUED',
                issueDate: new Date('2025-02-01T00:00:00Z'),
                pdfUrl: null,
                certificateNumber: 'CSE-2025-ABCDE',
            }
        })

        const result = await CertificateService.reissueCertificate('cert-1', 'admin-1')
        expect(result.pdfUrl).toBeNull()
    })
})

