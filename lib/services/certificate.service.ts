/**
 * Certificate Service
 * Generates and manages completion certificates
 */

import prisma from '@/lib/prisma';
import { EmailService } from './email.service';
import { v4 as uuidv4 } from 'uuid';
import { CertificateBadgeMode, CertificateStatus } from '@prisma/client';
import { FileService } from '@/lib/services/file.service';

export interface CertificateData {
  id: string;
  certificateNumber: string;
  userId: string;
  userName: string;
  courseId: string | null;
  courseTitle: string | null;
  examId: string | null;
  examTitle: string;
  score: number;
  totalScore: number;
  percentageScore: number;
  issueDate: Date;
  pdfUrl: string | null;
  status: 'ISSUED' | 'REVOKED';
  revokedAt?: Date | null;
  certificateTitle?: string | null;
  badgeMode?: 'AUTO' | 'UPLOADED' | null;
  badgeUrl?: string | null;
  badgeStyle?: any | null;
}

export interface GenerateCertificateResult {
  certificate: CertificateData;
  pdfUrl: string | null;
  emailSent: boolean;
}

async function getBadgeAccessUrl(key: string): Promise<string | null> {
  try {
    return await FileService.getAssetAccessUrl(key);
  } catch {
    return null;
  }
}

export class CertificateService {
  private static normalizeBadgeTemplate(template: { badgeMode: CertificateBadgeMode; badgeS3Key: string | null; badgeMimeType: string | null; badgeStyle: any | null }) {
    const badgeMode = template.badgeMode;
    if (badgeMode === CertificateBadgeMode.UPLOADED) {
      if (template.badgeS3Key && template.badgeMimeType) {
        return {
          badgeMode,
          badgeS3Key: template.badgeS3Key,
          badgeMimeType: template.badgeMimeType,
          badgeStyle: null,
        };
      }

      // If template says uploaded but keys are missing, fall back to AUTO for resilience.
      return {
        badgeMode: CertificateBadgeMode.AUTO,
        badgeS3Key: null,
        badgeMimeType: null,
        badgeStyle: template.badgeStyle ?? { theme: 'blue', variant: 'default' },
      };
    }

    return {
      badgeMode: CertificateBadgeMode.AUTO,
      badgeS3Key: null,
      badgeMimeType: null,
      badgeStyle: template.badgeStyle ?? { theme: 'blue', variant: 'default' },
    };
  }

  private static async backfillCertificatesForUser(userId: string) {
    const eligibleAttempts = await prisma.examAttempt.findMany({
      where: {
        userId,
        passed: true,
        status: 'GRADED',
        exam: {
          certificateTemplate: {
            isEnabled: true,
          },
        },
      },
      include: {
        user: { select: { name: true, email: true } },
        exam: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: { select: { title: true } },
            totalScore: true,
            certificateTemplate: true,
          },
        },
      },
      // Prefer the most recently graded attempt for each exam.
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    if (!eligibleAttempts.length) return 0;

    // Backfill should create at most one certificate per (user, exam).
    const attemptByExamId = new Map<string, (typeof eligibleAttempts)[number]>();
    for (const attempt of eligibleAttempts) {
      if (!attemptByExamId.has(attempt.examId)) {
        attemptByExamId.set(attempt.examId, attempt);
      }
    }

    const examIds = [...attemptByExamId.keys()];

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, supabaseId: true },
    });

    const userIds = [userId, user?.supabaseId, user?.email].filter(
      (value): value is string => Boolean(value)
    );

    const existingByExam = await prisma.certificate.findMany({
      where: {
        examId: { in: examIds },
        OR: [
          { userId: { in: userIds } },
          ...(user?.email
            ? [{ userId: { equals: user.email, mode: 'insensitive' as const } }]
            : []),
          // If certificate.userId is inconsistent, fall back to the attempt relation.
          { attempt: { is: { userId } } },
        ],
      },
      select: { examId: true },
    });

    const existingExamIds = new Set(existingByExam.map(row => row.examId).filter(Boolean) as string[]);

    let createdCount = 0;
    for (const attempt of attemptByExamId.values()) {
      if (existingExamIds.has(attempt.examId)) continue;

      const template = attempt.exam.certificateTemplate;
      if (!template || !template.isEnabled) continue;

      const badge = this.normalizeBadgeTemplate(template as any);

      // Best-effort "record-only" backfill: do not generate/upload PDF here.
      await prisma.certificate.create({
        data: {
          userId: attempt.userId,
          courseId: attempt.exam.courseId ?? null,
          examId: attempt.examId,
          attemptId: attempt.id,
          certificateNumber: this.generateCertificateNumber(),
          issueDate: new Date(),
          status: CertificateStatus.ISSUED,
          recipientName: attempt.user?.name || attempt.user?.email || null,
          examTitle: attempt.exam.title,
          courseTitle: attempt.exam.course?.title ?? null,
          score: attempt.rawScore || 0,
          certificateTitle: (template as any).title,
          badgeMode: badge.badgeMode,
          badgeS3Key: badge.badgeS3Key,
          badgeMimeType: badge.badgeMimeType,
          badgeStyle: badge.badgeStyle,
          pdfUrl: null,
          pdfS3Key: null,
        },
      });

      createdCount += 1;
    }

    return createdCount;
  }

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

    const result = await this.issueCertificateForAttempt(attemptId, {
      requestUserId: userId,
      sendEmail,
      allowReissue: false,
      silentIfNotEnabled: false,
    });

    if (!result) {
      throw new Error('CERTIFICATE_NOT_ENABLED');
    }

    // Send email if requested
    return result;
  }

  static async autoIssueForAttempt(attemptId: string): Promise<GenerateCertificateResult | null> {
    return await this.issueCertificateForAttempt(attemptId, {
      sendEmail: false,
      allowReissue: false,
      silentIfNotEnabled: true,
    });
  }

  private static async issueCertificateForAttempt(
    attemptId: string,
    opts: {
      requestUserId?: string;
      sendEmail?: boolean;
      allowReissue?: boolean;
      silentIfNotEnabled?: boolean;
    }
  ): Promise<GenerateCertificateResult | null> {
    const sendEmail = opts.sendEmail ?? true;

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

    if (opts.requestUserId && attempt.userId !== opts.requestUserId) {
      throw new Error('UNAUTHORIZED');
    }

    if (!attempt.passed) {
      throw new Error('EXAM_NOT_PASSED');
    }

    const template = await prisma.examCertificateTemplate.findUnique({
      where: { examId: attempt.examId },
    });

    if (!template || !template.isEnabled) {
      if (opts.silentIfNotEnabled) return null;
      throw new Error('CERTIFICATE_NOT_ENABLED');
    }

    const existingCert = await prisma.certificate.findFirst({
      where: {
        userId: attempt.userId,
        examId: attempt.examId,
      },
      orderBy: { issueDate: 'desc' },
    });

    // If a certificate already exists and is complete, return it.
    // Record-only backfilled certificates may have status=ISSUED but no PDF yet; allow regeneration.
    if (existingCert?.status === CertificateStatus.ISSUED && existingCert.pdfUrl) {
      const badgeUrl = existingCert.badgeS3Key ? await getBadgeAccessUrl(existingCert.badgeS3Key) : null;
      return {
        certificate: {
          id: existingCert.id,
          certificateNumber: existingCert.certificateNumber,
          userId: existingCert.userId,
          userName: existingCert.recipientName || attempt.user.name || attempt.user.email,
          courseId: existingCert.courseId ?? null,
          courseTitle: existingCert.courseTitle ?? null,
          examId: attempt.examId,
          examTitle: existingCert.examTitle || attempt.exam.title,
          score: existingCert.score || 0,
          totalScore: attempt.exam.totalScore,
          percentageScore: attempt.percentageScore || 0,
          issueDate: existingCert.issueDate,
          pdfUrl: existingCert.pdfUrl,
          status: existingCert.status,
          revokedAt: existingCert.revokedAt,
          certificateTitle: existingCert.certificateTitle,
          badgeMode: existingCert.badgeMode as any,
          badgeUrl,
          badgeStyle: existingCert.badgeStyle as any,
        },
        pdfUrl: existingCert.pdfUrl ?? null,
        emailSent: false,
      };
    }

    if (existingCert?.status === CertificateStatus.REVOKED && !opts.allowReissue) {
      throw new Error('CERTIFICATE_REVOKED');
    }

    const certificateNumber = existingCert?.certificateNumber || this.generateCertificateNumber();
    const issueDate = new Date();

    let badgeMode: CertificateBadgeMode = template.badgeMode;
    let badgeS3Key: string | null = template.badgeS3Key ?? null;
    let badgeMimeType: string | null = template.badgeMimeType ?? null;
    let badgeStyle: any | null = template.badgeStyle ?? null;

    if (badgeMode === CertificateBadgeMode.UPLOADED) {
      if (!badgeS3Key || !badgeMimeType) {
        throw new Error('BADGE_NOT_CONFIGURED');
      }
    } else {
      badgeS3Key = null;
      badgeMimeType = null;
      badgeStyle = badgeStyle ?? { theme: 'blue', variant: 'default' };
    }

    const pdfUrl: string | null = null;
    const pdfS3Key: string | null = null;

    const certificate = existingCert
      ? await prisma.certificate.update({
          where: { id: existingCert.id },
          data: {
            status: CertificateStatus.ISSUED,
            revokedAt: null,
            revokedById: null,
            issueDate,
            pdfUrl: null,
            pdfS3Key: null,
            attemptId,
            recipientName: attempt.user.name || attempt.user.email,
            examTitle: attempt.exam.title,
            score: attempt.rawScore || 0,
            certificateTitle: template.title,
            badgeMode,
            badgeS3Key: badgeMode === CertificateBadgeMode.UPLOADED ? badgeS3Key : null,
            badgeMimeType: badgeMode === CertificateBadgeMode.UPLOADED ? badgeMimeType : null,
            badgeStyle: badgeMode === CertificateBadgeMode.AUTO ? badgeStyle : null,
          },
        })
      : await prisma.certificate.create({
          data: {
            userId: attempt.userId,
            examId: attempt.examId,
            attemptId,
            certificateNumber,
            pdfUrl: null,
            pdfS3Key: null,
            issueDate,
            status: CertificateStatus.ISSUED,
            recipientName: attempt.user.name || attempt.user.email,
            examTitle: attempt.exam.title,
            score: attempt.rawScore || 0,
            certificateTitle: template.title,
            badgeMode,
            badgeS3Key: badgeMode === CertificateBadgeMode.UPLOADED ? badgeS3Key : null,
            badgeMimeType: badgeMode === CertificateBadgeMode.UPLOADED ? badgeMimeType : null,
            badgeStyle: badgeMode === CertificateBadgeMode.AUTO ? badgeStyle : null,
          },
        });

    let emailSent = false;
    if (sendEmail) {
      const emailResult = await EmailService.sendCertificate(attempt.userId, certificate.id);
      emailSent = emailResult.success;
    }

    const badgeUrl = certificate.badgeS3Key ? await getBadgeAccessUrl(certificate.badgeS3Key) : null;

    return {
      certificate: {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        userId: certificate.userId,
        userName: certificate.recipientName || attempt.user.name || attempt.user.email,
        courseId: certificate.courseId ?? null,
        courseTitle: certificate.courseTitle ?? null,
        examId: attempt.examId,
        examTitle: certificate.examTitle || attempt.exam.title,
        score: certificate.score || 0,
        totalScore: attempt.exam.totalScore,
        percentageScore: attempt.percentageScore || 0,
        issueDate: certificate.issueDate,
        pdfUrl: certificate.pdfUrl,
        status: certificate.status,
        revokedAt: certificate.revokedAt,
        certificateTitle: certificate.certificateTitle,
        badgeMode: certificate.badgeMode as any,
        badgeUrl,
        badgeStyle: certificate.badgeStyle as any,
      },
      pdfUrl,
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
    certificateTitle: string;
    score: number;
    totalScore: number;
    percentageScore: number;
    certificateNumber: string;
    issueDate: Date;
    badge?: {
      mode: CertificateBadgeMode;
      style: any | null;
      imageDataUrl: string | null;
      mimeType: string | null;
    };
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

    // Optional badge (top-left)
    if (data.badge?.mode === CertificateBadgeMode.UPLOADED && data.badge.imageDataUrl) {
      const imageType = data.badge.mimeType === 'image/png' ? 'PNG' : 'JPEG';
      doc.addImage(data.badge.imageDataUrl, imageType, 50, 50, 80, 80);
    }

    if (data.badge?.mode === CertificateBadgeMode.AUTO) {
      const cx = 90;
      const cy = 90;
      const r = 36;
      doc.setFillColor(30, 64, 175);
      doc.circle(cx, cy, r, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PASS', cx, cy + 6, { align: 'center' });
    }

    // Title
    doc.setFontSize(36);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICATE', width / 2, 70, { align: 'center' });

    doc.setFontSize(16);
    doc.setTextColor(107, 114, 128); // #6b7280
    doc.setFont('helvetica', 'normal');
    doc.text((data.certificateTitle || 'OF COMPLETION').toUpperCase(), width / 2, 100, { align: 'center' });

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

  static async revokeCertificate(certificateId: string, adminId: string) {
    const existing = await prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!existing) {
      throw new Error('CERT_NOT_FOUND');
    }

    const updated = await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revokedById: adminId,
      },
      select: {
        id: true,
        status: true,
        revokedAt: true,
        certificateNumber: true,
      },
    });

    return updated;
  }

  static async reissueCertificate(certificateId: string, adminId: string) {
    const existing = await prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!existing) {
      throw new Error('CERT_NOT_FOUND');
    }

    if (!existing.userId) {
      throw new Error('CERT_INVALID');
    }

    const template = existing.examId
      ? await prisma.examCertificateTemplate.findUnique({ where: { examId: existing.examId } })
      : null;

    const certificateTitle = template?.title || existing.certificateTitle || 'OF COMPLETION';

    const badgeMode: CertificateBadgeMode =
      template?.badgeMode ||
      (existing.badgeMode as CertificateBadgeMode) ||
      CertificateBadgeMode.AUTO;

    const badgeS3Key = template?.badgeS3Key ?? existing.badgeS3Key ?? null;
    const badgeMimeType = template?.badgeMimeType ?? existing.badgeMimeType ?? null;
    const badgeStyle = template?.badgeStyle ?? (existing.badgeStyle as any) ?? { theme: 'blue', variant: 'default' };

    const issueDate = new Date();

    const updated = await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.ISSUED,
        revokedAt: null,
        revokedById: null,
        issueDate,
        pdfUrl: null,
        pdfS3Key: null,
        certificateTitle,
        badgeMode,
        badgeS3Key: badgeMode === CertificateBadgeMode.UPLOADED ? badgeS3Key : null,
        badgeMimeType: badgeMode === CertificateBadgeMode.UPLOADED ? badgeMimeType : null,
        badgeStyle: badgeMode === CertificateBadgeMode.AUTO ? badgeStyle : null,
      },
      select: {
        id: true,
        status: true,
        issueDate: true,
        pdfUrl: true,
        certificateNumber: true,
      },
    });

    // Audit info (best-effort): track who reissued by setting `revokedById`? Not available; keep as-is.
    void adminId;

    return updated;
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
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: certificate.userId },
          { supabaseId: certificate.userId },
          { email: certificate.userId },
        ],
      },
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

    const badgeUrl = certificate.badgeS3Key ? await getBadgeAccessUrl(certificate.badgeS3Key) : null;

    return {
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      userId: certificate.userId,
      userName: certificate.recipientName || user?.name || user?.email || 'Unknown',
      courseId: certificate.courseId,
      courseTitle: certificate.courseTitle ?? null,
      examId: certificate.examId,
      examTitle: certificate.examTitle || certificate.courseTitle || 'Certificate',
      score: certificate.score || 0,
      totalScore: examTotalScore,
      percentageScore,
      issueDate: certificate.issueDate,
      pdfUrl: certificate.pdfUrl,
      status: certificate.status,
      revokedAt: certificate.revokedAt,
      certificateTitle: certificate.certificateTitle,
      badgeMode: certificate.badgeMode as any,
      badgeUrl,
      badgeStyle: certificate.badgeStyle as any,
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

    if (certificate.status === CertificateStatus.REVOKED) {
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
    // Get user info once
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, supabaseId: true },
    });

    const userIds = [userId, user?.supabaseId, user?.email].filter((value): value is string => Boolean(value));

    const loadCertificates = async () =>
      prisma.certificate.findMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            ...(user?.email
              ? [{ userId: { equals: user.email, mode: 'insensitive' as const } }]
              : []),
            // Backward/forward compatibility: if certificate.userId is inconsistent, fall back to attempt.userId.
            { attempt: { is: { userId } } },
          ],
        },
        orderBy: { issueDate: 'desc' },
      });

    let certificates = await loadCertificates();

    // If auto-issuance failed historically (e.g. older deployments, or S3 perms), users see
    // missing certificates even after passing. Backfill record-only certificates for eligible
    // passed attempts (idempotent and creates at most one per exam).
    const backfilled = await this.backfillCertificatesForUser(userId);
    if (backfilled > 0) {
      certificates = await loadCertificates();
    }

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

    return await Promise.all(
      certificates.map(async (cert) => {
        const totalScore = cert.examId
          ? examScoreMap.get(cert.examId) || 100
          : 100;
        const percentageScore = totalScore > 0
          ? ((cert.score || 0) / totalScore) * 100
          : 0;

        const badgeUrl = cert.badgeS3Key ? await getBadgeAccessUrl(cert.badgeS3Key) : null;

        return {
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          userId: cert.userId,
          userName: cert.recipientName || user?.name || user?.email || 'Unknown',
          courseId: cert.courseId,
          courseTitle: cert.courseTitle ?? null,
          examId: cert.examId,
          examTitle: cert.examTitle || cert.courseTitle || 'Certificate',
          score: cert.score || 0,
          totalScore,
          percentageScore,
          issueDate: cert.issueDate,
          pdfUrl: cert.pdfUrl,
          status: cert.status,
          revokedAt: cert.revokedAt,
          certificateTitle: cert.certificateTitle,
          badgeMode: cert.badgeMode as any,
          badgeUrl,
          badgeStyle: cert.badgeStyle as any,
        };
      })
    );
  }
}
