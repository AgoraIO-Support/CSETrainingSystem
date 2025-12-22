/**
 * Email Service
 * Handles email sending using Resend
 */

import { Resend } from 'resend';
import prisma from '@/lib/prisma';
import { EmailType } from '@prisma/client';
import {
  ExamInvitationEmail,
  ExamReminderEmail,
  ExamResultsEmail,
  CertificateDeliveryEmail,
} from '@/lib/email-templates';

// Lazy-initialize Resend client to avoid errors when API key is not set
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'exams@example.com';
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'CSE Training System';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export interface SendEmailResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

export class EmailService {
  /**
   * Send exam invitation email
   */
  static async sendExamInvitation(
    userId: string,
    examId: string
  ): Promise<SendEmailResult> {
    try {
      const [user, exam] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        }),
        prisma.exam.findUnique({
          where: { id: examId },
          select: {
            id: true,
            title: true,
            description: true,
            deadline: true,
            timeLimit: true,
            maxAttempts: true,
          },
        }),
      ]);

      if (!user || !exam) {
        throw new Error('User or exam not found');
      }

      const examUrl = `${APP_URL}/exams/${examId}`;

      const resend = getResendClient();
      if (!resend) {
        console.warn('Email service not configured - RESEND_API_KEY not set');
        return { success: false, error: 'Email service not configured' };
      }

      const { data, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: user.email,
        subject: `You're invited to take: ${exam.title}`,
        react: ExamInvitationEmail({
          userName: user.name || 'Student',
          examTitle: exam.title,
          examDescription: exam.description || undefined,
          deadline: exam.deadline || undefined,
          timeLimit: exam.timeLimit || undefined,
          maxAttempts: exam.maxAttempts,
          examUrl,
          appName: APP_NAME,
        }),
      });

      if (error) {
        throw new Error(error.message);
      }

      // Log the email
      await this.logEmail({
        recipientId: userId,
        recipientEmail: user.email,
        type: EmailType.EXAM_INVITATION,
        examId,
        subject: `You're invited to take: ${exam.title}`,
        resendId: data?.id,
        status: 'sent',
      });

      // Update invitation record
      await prisma.examInvitation.updateMany({
        where: { userId, examId },
        data: {
          emailSentAt: new Date(),
        },
      });

      return { success: true, emailId: data?.id };
    } catch (error) {
      console.error('Failed to send exam invitation:', error);

      // Get user email for error logging
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      await this.logEmail({
        recipientId: userId,
        recipientEmail: user?.email || 'unknown',
        type: EmailType.EXAM_INVITATION,
        examId,
        subject: 'Exam Invitation',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send exam reminder email
   */
  static async sendExamReminder(
    userId: string,
    examId: string
  ): Promise<SendEmailResult> {
    try {
      const [user, exam] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        }),
        prisma.exam.findUnique({
          where: { id: examId },
          select: {
            id: true,
            title: true,
            deadline: true,
          },
        }),
      ]);

      if (!user || !exam) {
        throw new Error('User or exam not found');
      }

      const examUrl = `${APP_URL}/exams/${examId}`;
      const subject = `Reminder: ${exam.title} deadline approaching`;

      const resend = getResendClient();
      if (!resend) {
        console.warn('Email service not configured - RESEND_API_KEY not set');
        return { success: false, error: 'Email service not configured' };
      }

      const { data, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: user.email,
        subject,
        react: ExamReminderEmail({
          userName: user.name || 'Student',
          examTitle: exam.title,
          deadline: exam.deadline || undefined,
          examUrl,
          appName: APP_NAME,
        }),
      });

      if (error) {
        throw new Error(error.message);
      }

      await this.logEmail({
        recipientId: userId,
        recipientEmail: user.email,
        type: EmailType.EXAM_REMINDER,
        examId,
        subject,
        resendId: data?.id,
        status: 'sent',
      });

      return { success: true, emailId: data?.id };
    } catch (error) {
      console.error('Failed to send exam reminder:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send exam results email
   */
  static async sendExamResults(
    userId: string,
    attemptId: string
  ): Promise<SendEmailResult> {
    try {
      const attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          exam: {
            select: {
              id: true,
              title: true,
              totalScore: true,
              passingScore: true,
            },
          },
        },
      });

      if (!attempt) {
        throw new Error('Attempt not found');
      }

      const user = attempt.user;
      const resultsUrl = `${APP_URL}/exams/${attempt.examId}/result?attemptId=${attemptId}`;
      const subject = `Your results for: ${attempt.exam.title}`;

      const resend = getResendClient();
      if (!resend) {
        console.warn('Email service not configured - RESEND_API_KEY not set');
        return { success: false, error: 'Email service not configured' };
      }

      const { data, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: user.email,
        subject,
        react: ExamResultsEmail({
          userName: user.name || 'Student',
          examTitle: attempt.exam.title,
          score: attempt.rawScore || 0,
          totalScore: attempt.exam.totalScore,
          percentageScore: attempt.percentageScore || 0,
          passed: attempt.passed || false,
          passingScore: attempt.exam.passingScore,
          resultsUrl,
          appName: APP_NAME,
        }),
      });

      if (error) {
        throw new Error(error.message);
      }

      await this.logEmail({
        recipientId: userId,
        recipientEmail: user.email,
        type: EmailType.EXAM_RESULTS,
        examId: attempt.examId,
        subject,
        resendId: data?.id,
        status: 'sent',
      });

      return { success: true, emailId: data?.id };
    } catch (error) {
      console.error('Failed to send exam results:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send certificate email
   */
  static async sendCertificate(
    userId: string,
    certificateId: string
  ): Promise<SendEmailResult> {
    try {
      // Get certificate
      const certificate = await prisma.certificate.findUnique({
        where: { id: certificateId },
      });

      if (!certificate) {
        throw new Error('Certificate not found');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: certificate.userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const certificateUrl = `${APP_URL}/certificates/${certificateId}`;
      const verifyUrl = `${APP_URL}/certificates/verify/${certificate.certificateNumber}`;
      const subject = `Your Certificate: ${certificate.examTitle || 'Completion Certificate'}`;

      const resend = getResendClient();
      if (!resend) {
        console.warn('Email service not configured - RESEND_API_KEY not set');
        return { success: false, error: 'Email service not configured' };
      }

      const { data, error } = await resend.emails.send({
        from: `${APP_NAME} <${FROM_EMAIL}>`,
        to: user.email,
        subject,
        react: CertificateDeliveryEmail({
          userName: user.name || 'Student',
          examTitle: certificate.examTitle || 'Exam',
          certificateNumber: certificate.certificateNumber,
          issuedAt: certificate.issueDate,
          certificateUrl,
          verifyUrl,
          appName: APP_NAME,
        }),
      });

      if (error) {
        throw new Error(error.message);
      }

      await this.logEmail({
        recipientId: userId,
        recipientEmail: user.email,
        type: EmailType.CERTIFICATE_DELIVERY,
        examId: certificate.examId || undefined,
        certificateId,
        subject,
        resendId: data?.id,
        status: 'sent',
      });

      return { success: true, emailId: data?.id };
    } catch (error) {
      console.error('Failed to send certificate:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send bulk exam invitations
   */
  static async sendBulkInvitations(
    examId: string,
    userIds: string[]
  ): Promise<{ sent: number; failed: number; errors: string[] }> {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const userId of userIds) {
      const result = await this.sendExamInvitation(userId, examId);
      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`User ${userId}: ${result.error}`);
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { sent, failed, errors };
  }

  /**
   * Log email to database
   */
  private static async logEmail(data: {
    recipientId: string;
    recipientEmail: string;
    type: EmailType;
    examId?: string;
    certificateId?: string;
    subject: string;
    resendId?: string;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await prisma.emailLog.create({
        data: {
          recipientId: data.recipientId,
          recipientEmail: data.recipientEmail,
          type: data.type,
          examId: data.examId,
          certificateId: data.certificateId,
          subject: data.subject,
          resendId: data.resendId,
          status: data.status,
          errorMessage: data.errorMessage,
          sentAt: data.status === 'sent' ? new Date() : undefined,
        },
      });
    } catch (logError) {
      console.error('Failed to log email:', logError);
    }
  }

  /**
   * Get email logs for a user
   */
  static async getUserEmailLogs(
    userId: string,
    limit = 20
  ): Promise<Array<{
    id: string;
    type: EmailType;
    status: string;
    sentAt: Date | null;
    errorMessage: string | null;
  }>> {
    const logs = await prisma.emailLog.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        sentAt: true,
        errorMessage: true,
      },
    });

    return logs;
  }
}
