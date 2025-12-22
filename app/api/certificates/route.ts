/**
 * User Certificates Routes
 * GET /api/certificates - Get user's certificates
 * POST /api/certificates - Generate certificate for an attempt
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { CertificateService } from '@/lib/services/certificate.service';
import { z } from 'zod';

const generateCertificateSchema = z.object({
  attemptId: z.string().min(1, 'Attempt ID is required'),
  sendEmail: z.boolean().optional().default(true),
});

// GET /api/certificates - Get user's certificates
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    const certificates = await CertificateService.getUserCertificates(user.id);

    return NextResponse.json({
      success: true,
      data: certificates,
    });
  } catch (error) {
    console.error('Get certificates error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CERT_001',
          message: 'Failed to get certificates',
        },
      },
      { status: 500 }
    );
  }
});

// POST /api/certificates - Generate certificate
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const { attemptId, sendEmail } = generateCertificateSchema.parse(body);

    const result = await CertificateService.generateCertificate(
      user.id,
      attemptId,
      sendEmail
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Generate certificate error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      const errorMap: Record<string, { code: string; message: string; status: number }> = {
        'ATTEMPT_NOT_FOUND': {
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Exam attempt not found',
          status: 404,
        },
        'UNAUTHORIZED': {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to generate this certificate',
          status: 403,
        },
        'EXAM_NOT_PASSED': {
          code: 'EXAM_NOT_PASSED',
          message: 'Certificate can only be generated for passed exams',
          status: 400,
        },
      };

      const errorInfo = errorMap[error.message];
      if (errorInfo) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: errorInfo.code,
              message: errorInfo.message,
            },
          },
          { status: errorInfo.status }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CERT_001',
          message: 'Failed to generate certificate',
        },
      },
      { status: 500 }
    );
  }
});
