/**
 * Certificate Download Route
 * GET /api/certificates/[id]/download - Download certificate PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { CertificateService } from '@/lib/services/certificate.service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/certificates/[id]/download - Download certificate PDF
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
    if (certificate.userId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You are not authorized to download this certificate',
          },
        },
        { status: 403 }
      );
    }

    if (!certificate.pdfUrl) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PDF_NOT_AVAILABLE',
            message: 'Certificate PDF is not available',
          },
        },
        { status: 404 }
      );
    }

    // Redirect to the S3 URL (or CloudFront if configured)
    return NextResponse.redirect(certificate.pdfUrl);
  } catch (error) {
    console.error('Download certificate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CERT_001',
          message: 'Failed to download certificate',
        },
      },
      { status: 500 }
    );
  }
});
