/**
 * Certificate Service
 * Generates and manages completion certificates
 */

import prisma from '@/lib/prisma';
import { EmailService } from './email.service';
import s3Client, { S3_BUCKET_NAME, CLOUDFRONT_DOMAIN } from '@/lib/aws-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export interface CertificateData {
  id: string;
  certificateNumber: string;
  userId: string;
  userName: string;
  examId: string | null;
  examTitle: string;
  score: number;
  totalScore: number;
  percentageScore: number;
  issueDate: Date;
  pdfUrl: string | null;
}

export interface GenerateCertificateResult {
  certificate: CertificateData;
  pdfUrl: string;
  emailSent: boolean;
}

/**
 * Upload buffer to S3
 */
async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  });

  await s3Client.send(command);

  // Return CloudFront URL if available, otherwise S3 URL
  if (CLOUDFRONT_DOMAIN) {
    return `${CLOUDFRONT_DOMAIN}/${key}`;
  }
  return `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

export class CertificateService {
  /**
   * Generate a certificate for a passed exam attempt
   */
  static async generateCertificate(
    userId: string,
    attemptId: string,
    sendEmail = true
  ): Promise<GenerateCertificateResult> {
    // Get attempt details
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: true,
        exam: true,
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    if (attempt.userId !== userId) {
      throw new Error('UNAUTHORIZED');
    }

    if (!attempt.passed) {
      throw new Error('EXAM_NOT_PASSED');
    }

    // Check if certificate already exists for this attempt
    const existingCert = await prisma.certificate.findFirst({
      where: {
        userId,
        examId: attempt.examId,
      },
    });

    if (existingCert) {
      return {
        certificate: {
          id: existingCert.id,
          certificateNumber: existingCert.certificateNumber,
          userId: existingCert.userId,
          userName: existingCert.recipientName || attempt.user.name || attempt.user.email,
          examId: attempt.examId,
          examTitle: existingCert.examTitle || attempt.exam.title,
          score: existingCert.score || 0,
          totalScore: attempt.exam.totalScore,
          percentageScore: attempt.percentageScore || 0,
          issueDate: existingCert.issueDate,
          pdfUrl: existingCert.pdfUrl,
        },
        pdfUrl: existingCert.pdfUrl || '',
        emailSent: false, // Already issued
      };
    }

    // Generate unique certificate number
    const certificateNumber = this.generateCertificateNumber();

    // Generate PDF
    const pdfBuffer = await this.generateCertificatePDF({
      userName: attempt.user.name || attempt.user.email,
      examTitle: attempt.exam.title,
      score: attempt.rawScore || 0,
      totalScore: attempt.exam.totalScore,
      percentageScore: attempt.percentageScore || 0,
      certificateNumber,
      issueDate: new Date(),
    });

    // Upload to S3
    const s3Key = `certificates/${userId}/${certificateNumber}.pdf`;
    const pdfUrl = await uploadBufferToS3(
      pdfBuffer,
      s3Key,
      'application/pdf'
    );

    // Create certificate record
    const certificate = await prisma.certificate.create({
      data: {
        userId,
        examId: attempt.examId,
        certificateNumber,
        pdfUrl,
        issueDate: new Date(),
        recipientName: attempt.user.name || attempt.user.email,
        examTitle: attempt.exam.title,
        score: attempt.rawScore || 0,
      },
    });

    // Send email if requested
    let emailSent = false;
    if (sendEmail) {
      const emailResult = await EmailService.sendCertificate(userId, certificate.id);
      emailSent = emailResult.success;
    }

    return {
      certificate: {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        userId: certificate.userId,
        userName: certificate.recipientName || attempt.user.name || attempt.user.email,
        examId: attempt.examId,
        examTitle: certificate.examTitle || attempt.exam.title,
        score: certificate.score || 0,
        totalScore: attempt.exam.totalScore,
        percentageScore: attempt.percentageScore || 0,
        issueDate: certificate.issueDate,
        pdfUrl: certificate.pdfUrl,
      },
      pdfUrl: pdfUrl,
      emailSent,
    };
  }

  /**
   * Generate unique certificate number
   * Format: CSE-YYYY-XXXXX (e.g., CSE-2025-A3B4C)
   */
  private static generateCertificateNumber(): string {
    const year = new Date().getFullYear();
    const randomPart = uuidv4().substring(0, 5).toUpperCase();
    return `CSE-${year}-${randomPart}`;
  }

  /**
   * Generate certificate PDF using jsPDF (browser-compatible library)
   */
  private static async generateCertificatePDF(data: {
    userName: string;
    examTitle: string;
    score: number;
    totalScore: number;
    percentageScore: number;
    certificateNumber: string;
    issueDate: Date;
  }): Promise<Buffer> {
    // Use jspdf for reliable PDF generation without external font dependencies
    const { jsPDF } = await import('jspdf');

    // Create A4 landscape document
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    // Draw decorative borders
    doc.setDrawColor(30, 64, 175); // #1e40af
    doc.setLineWidth(3);
    doc.rect(20, 20, width - 40, height - 40);

    doc.setDrawColor(59, 130, 246); // #3b82f6
    doc.setLineWidth(1);
    doc.rect(25, 25, width - 50, height - 50);

    // Title
    doc.setFontSize(36);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICATE', width / 2, 70, { align: 'center' });

    doc.setFontSize(16);
    doc.setTextColor(107, 114, 128); // #6b7280
    doc.setFont('helvetica', 'normal');
    doc.text('OF COMPLETION', width / 2, 100, { align: 'center' });

    // Body
    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99); // #4b5563
    doc.text('This is to certify that', width / 2, 160, { align: 'center' });

    doc.setFontSize(32);
    doc.setTextColor(17, 24, 39); // #111827
    doc.setFont('helvetica', 'bold');
    doc.text(data.userName, width / 2, 200, { align: 'center' });

    // Underline for name
    const nameWidth = doc.getTextWidth(data.userName);
    doc.setDrawColor(209, 213, 219); // #d1d5db
    doc.setLineWidth(2);
    doc.line((width - nameWidth) / 2, 210, (width + nameWidth) / 2, 210);

    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99);
    doc.setFont('helvetica', 'normal');
    doc.text('has successfully completed the examination', width / 2, 250, { align: 'center' });

    doc.setFontSize(22);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text(data.examTitle, width / 2, 290, { align: 'center' });

    // Score boxes
    const boxY = 320;
    const boxWidth = 120;
    const boxHeight = 60;
    const gap = 30;
    const startX = (width - (boxWidth * 2 + gap)) / 2;

    // Score box background
    doc.setFillColor(239, 246, 255); // #eff6ff
    doc.rect(startX, boxY, boxWidth, boxHeight, 'F');

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.text('SCORE', startX + boxWidth / 2, boxY + 20, { align: 'center' });

    doc.setFontSize(18);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.score}/${data.totalScore}`, startX + boxWidth / 2, boxY + 45, { align: 'center' });

    // Percentage box background
    doc.setFillColor(239, 246, 255);
    doc.rect(startX + boxWidth + gap, boxY, boxWidth, boxHeight, 'F');

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.text('PERCENTAGE', startX + boxWidth + gap + boxWidth / 2, boxY + 20, { align: 'center' });

    doc.setFontSize(18);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.percentageScore.toFixed(1)}%`, startX + boxWidth + gap + boxWidth / 2, boxY + 45, { align: 'center' });

    // Footer
    const footerY = 430;
    const footerWidth = 200;
    const leftFooterX = 130;
    const rightFooterX = width - 330;

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'normal');
    doc.text('DATE ISSUED', leftFooterX + footerWidth / 2, footerY, { align: 'center' });

    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(1);
    doc.line(leftFooterX, footerY + 5, leftFooterX + footerWidth, footerY + 5);

    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text(
      data.issueDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      leftFooterX + footerWidth / 2,
      footerY + 25,
      { align: 'center' }
    );

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text('AUTHORIZED BY', rightFooterX + footerWidth / 2, footerY, { align: 'center' });

    doc.line(rightFooterX, footerY + 5, rightFooterX + footerWidth, footerY + 5);

    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text('CSE Training System', rightFooterX + footerWidth / 2, footerY + 25, { align: 'center' });

    // Certificate number at bottom
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175); // #9ca3af
    doc.text(`Certificate No: ${data.certificateNumber}`, width / 2, height - 40, { align: 'center' });

    // Get PDF as array buffer and convert to Buffer
    const pdfOutput = doc.output('arraybuffer');
    return Buffer.from(pdfOutput);
  }

  /**
   * Get certificate by ID
   */
  static async getCertificateById(certificateId: string): Promise<CertificateData | null> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      return null;
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: certificate.userId },
      select: { name: true, email: true },
    });

    // Get exam info if linked
    let examTotalScore = 100;
    if (certificate.examId) {
      const exam = await prisma.exam.findUnique({
        where: { id: certificate.examId },
        select: { totalScore: true },
      });
      if (exam) {
        examTotalScore = exam.totalScore;
      }
    }

    const percentageScore = examTotalScore > 0
      ? ((certificate.score || 0) / examTotalScore) * 100
      : 0;

    return {
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      userId: certificate.userId,
      userName: certificate.recipientName || user?.name || user?.email || 'Unknown',
      examId: certificate.examId,
      examTitle: certificate.examTitle || 'Completed Exam',
      score: certificate.score || 0,
      totalScore: examTotalScore,
      percentageScore,
      issueDate: certificate.issueDate,
      pdfUrl: certificate.pdfUrl,
    };
  }

  /**
   * Verify certificate by number
   */
  static async verifyCertificate(certificateNumber: string): Promise<{
    valid: boolean;
    certificate?: CertificateData;
  }> {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
    });

    if (!certificate) {
      return { valid: false };
    }

    const certData = await this.getCertificateById(certificate.id);
    if (!certData) {
      return { valid: false };
    }

    return {
      valid: true,
      certificate: certData,
    };
  }

  /**
   * Get user's certificates
   */
  static async getUserCertificates(userId: string): Promise<CertificateData[]> {
    const certificates = await prisma.certificate.findMany({
      where: { userId },
      orderBy: { issueDate: 'desc' },
    });

    // Get user info once
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // Get all exam IDs and fetch their total scores
    const examIds = certificates
      .map(c => c.examId)
      .filter((id): id is string => id !== null);

    const exams = examIds.length > 0
      ? await prisma.exam.findMany({
          where: { id: { in: examIds } },
          select: { id: true, totalScore: true },
        })
      : [];

    const examScoreMap = new Map(exams.map(e => [e.id, e.totalScore]));

    return certificates.map(cert => {
      const totalScore = cert.examId
        ? examScoreMap.get(cert.examId) || 100
        : 100;
      const percentageScore = totalScore > 0
        ? ((cert.score || 0) / totalScore) * 100
        : 0;

      return {
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        userId: cert.userId,
        userName: cert.recipientName || user?.name || user?.email || 'Unknown',
        examId: cert.examId,
        examTitle: cert.examTitle || 'Completed Exam',
        score: cert.score || 0,
        totalScore,
        percentageScore,
        issueDate: cert.issueDate,
        pdfUrl: cert.pdfUrl,
      };
    });
  }
}
