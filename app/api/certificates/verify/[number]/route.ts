/**
 * Certificate Verification Route
 * GET /api/certificates/verify/[number] - Verify certificate by number
 */

import { NextRequest, NextResponse } from 'next/server';
import { CertificateService } from '@/lib/services/certificate.service';

type RouteContext = {
  params: Promise<{ number: string }>;
};

// GET /api/certificates/verify/[number] - Verify certificate (public endpoint)
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { number } = await context.params;

    const result = await CertificateService.verifyCertificate(number);

    if (!result.valid) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          message: 'Certificate not found or invalid',
        },
      });
    }

    // Return limited info for public verification
    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        certificate: {
          certificateNumber: result.certificate!.certificateNumber,
          userName: result.certificate!.userName,
          examTitle: result.certificate!.examTitle,
          issueDate: result.certificate!.issueDate,
          percentageScore: result.certificate!.percentageScore,
        },
      },
    });
  } catch (error) {
    console.error('Verify certificate error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CERT_001',
          message: 'Failed to verify certificate',
        },
      },
      { status: 500 }
    );
  }
}
