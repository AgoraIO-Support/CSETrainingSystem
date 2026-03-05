/**
 * Admin Exam Invitations Routes
 * GET /api/admin/exams/[examId]/invitations - Get invitations
 * POST /api/admin/exams/[examId]/invitations - Send invitations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service';
import prisma from '@/lib/prisma';
import { inviteUsersSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/invitations - Get invitations
export const GET = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;

      const invitations = await prisma.examInvitation.findMany({
        where: { examId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: invitations,
      });
    } catch (error) {
      console.error('Get invitations error:', error);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXAM_001',
            message: 'Failed to get invitations',
          },
        },
        { status: 500 }
      );
    }
  }
);

// POST /api/admin/exams/[examId]/invitations - Send invitations
export const POST = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      const body = await req.json();
      const parsed = inviteUsersSchema.parse(body);
      const { userIds } = parsed;
      const sendNotification = parsed.sendNotification ?? parsed.sendEmail ?? false;

      // Verify exam exists
      const exam = await ExamService.getExamById(examId);
      if (!exam) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_NOT_FOUND',
              message: 'Exam not found',
            },
          },
          { status: 404 }
        );
      }

      // Create invitations (skip duplicates)
      const results = {
        created: 0,
        skipped: 0,
        notificationsSent: 0,
        notificationsFailed: 0,
      };

      for (const userId of userIds) {
        // Check if invitation already exists
        const existing = await prisma.examInvitation.findUnique({
          where: {
            examId_userId: {
              examId,
              userId,
            },
          },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        // Create invitation
        await prisma.examInvitation.create({
          data: {
            examId,
            userId,
          },
        });
        results.created++;

        // Send WeCom notification if requested
        if (sendNotification) {
          const notifyResult = await WecomWebhookService.sendExamInvitation(userId, examId);
          if (notifyResult.success) {
            results.notificationsSent++;
          } else {
            results.notificationsFailed++;
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          invited: results.created,
          skipped: results.skipped,
          notificationsSent: results.notificationsSent,
          notificationsFailed: results.notificationsFailed,
          // backward compatibility for older clients
          emailsSent: results.notificationsSent,
          emailsFailed: results.notificationsFailed,
        },
      });
    } catch (error) {
      console.error('Send invitations error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid invitation data',
              details: error.errors,
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXAM_001',
            message: 'Failed to send invitations',
          },
        },
        { status: 500 }
      );
    }
  }
);
