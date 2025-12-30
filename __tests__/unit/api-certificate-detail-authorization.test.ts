import { GET } from '@/app/api/certificates/[id]/route'
import { CertificateService } from '@/lib/services/certificate.service'

jest.mock('@/lib/services/certificate.service', () => ({
    CertificateService: {
        getCertificateById: jest.fn(),
    },
}))

jest.mock('@/lib/auth-middleware', () => ({
    withAuth: (handler: any) => (req: any, context: any) =>
        handler(
            req,
            { id: 'db-user-id', email: 'u@agora.io', role: 'USER', supabaseId: 'sb-user-id' },
            context
        ),
}))

const mockedCertService = CertificateService as unknown as {
    getCertificateById: jest.Mock
}

describe('GET /api/certificates/[id] authorization', () => {
    beforeEach(() => {
        mockedCertService.getCertificateById.mockReset()
    })

    it('allows access when certificate.userId matches user.supabaseId', async () => {
        mockedCertService.getCertificateById.mockResolvedValue({
            id: 'cert-1',
            certificateNumber: 'CERT-001',
            userId: 'sb-user-id',
            userName: 'Alice',
            courseId: null,
            courseTitle: null,
            examId: null,
            examTitle: 'Exam 1',
            score: 0,
            totalScore: 100,
            percentageScore: 0,
            issueDate: new Date().toISOString(),
            pdfUrl: null,
            status: 'ISSUED',
        })

        const res = await GET({} as any, { params: Promise.resolve({ id: 'cert-1' }) } as any)
        expect(res.status).toBe(200)
    })

    it('rejects access when certificate.userId does not match user.id nor user.supabaseId', async () => {
        mockedCertService.getCertificateById.mockResolvedValue({
            id: 'cert-1',
            certificateNumber: 'CERT-001',
            userId: 'someone-else',
            userName: 'Alice',
            courseId: null,
            courseTitle: null,
            examId: null,
            examTitle: 'Exam 1',
            score: 0,
            totalScore: 100,
            percentageScore: 0,
            issueDate: new Date().toISOString(),
            pdfUrl: null,
            status: 'ISSUED',
        })

        const res = await GET({} as any, { params: Promise.resolve({ id: 'cert-1' }) } as any)
        expect(res.status).toBe(403)
    })
})

