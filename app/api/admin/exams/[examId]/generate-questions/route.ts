/**
 * Admin Exam Question Generation Route
 * POST /api/admin/exams/[examId]/generate-questions - Generate questions using AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { ExamGenerationService } from '@/lib/services/exam-generation.service';
import { generateQuestionsSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// POST /api/admin/exams/[examId]/generate-questions - Generate questions using AI
export const POST = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      const body = await req.json();
      const config = generateQuestionsSchema.parse(body);

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

      // Check exam is in draft or pending review status
      if (exam.status !== 'DRAFT' && exam.status !== 'PENDING_REVIEW') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_008',
              message: 'Can only generate questions for exams in DRAFT or PENDING_REVIEW status',
            },
          },
          { status: 400 }
        );
      }

      // Generate questions
      const generationService = new ExamGenerationService();
      const result = await generationService.generateQuestions(examId, config);

      return NextResponse.json({
        success: true,
        data: result.createdQuestions,
        meta: {
          questionsGenerated: result.totalGenerated,
          tokensUsed: result.tokensUsed,
          warnings: result.warnings,
        }
      });
    } catch (error) {
      console.error('Generate questions error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid generation config',
              details: error.errors,
            },
          },
          { status: 400 }
        );
      }

      if (error instanceof Error) {
        if (error.message === 'NO_CONTENT_AVAILABLE') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_009',
                message: 'No XML knowledge context available for question generation. Ensure lesson transcripts (VTT) are uploaded and the XML knowledge context is generated.',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'OPENAI_API_KEY_MISSING') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'OPENAI_001',
                message: 'OPENAI_API_KEY is not configured on the server',
              },
            },
            { status: 500 }
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXAM_001',
            message: 'Failed to generate questions',
          },
        },
        { status: 500 }
      );
    }
  }
);
