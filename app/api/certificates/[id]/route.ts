/**
 * Certificate Detail Route
 * GET /api/certificates/[id] - Get certificate details
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { CertificateService } from '@/lib/services/certificate.service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/certificates/[id] - Get certificate details
export const GET = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { id } = await context.params;

    const certificate = await CertificateService.getCertificateById(id);

    if (!certificate) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CERT_NOT_FOUND',
            message: 'Certificate not found',
          },
        },
        { status: 404 }
      );
    }

    // Check if user owns this certificate
    const allowedUserIds = new Set([user.id, user.supabaseId].filter((value): value is string => Boolean(value)));
    if (!allowedUserIds.has(certificate.userId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You are not authorized to view this certificate',
          },
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    console.error('Get certificate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CERT_001',
          message: 'Failed to get certificate',
        },
      },
      { status: 500 }
    );
  }
});
