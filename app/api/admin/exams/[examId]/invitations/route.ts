/**
 * Admin Exam Invitations Routes
 * GET /api/admin/exams/[examId]/invitations - Get invitations
 * POST /api/admin/exams/[examId]/invitations - Send invitations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { EmailService } from '@/lib/services/email.service';
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
      const { userIds, sendEmail } = inviteUsersSchema.parse(body);

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
        emailsSent: 0,
        emailsFailed: 0,
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

        // Send email if requested
        if (sendEmail) {
          const emailResult = await EmailService.sendExamInvitation(userId, examId);
          if (emailResult.success) {
            results.emailsSent++;
          } else {
            results.emailsFailed++;
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          invited: results.created,
          skipped: results.skipped,
          emailsSent: results.emailsSent,
          emailsFailed: results.emailsFailed,
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
