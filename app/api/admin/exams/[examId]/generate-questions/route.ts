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

      // Check exam is in draft status
      if (exam.status !== 'DRAFT') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_008',
              message: 'Can only generate questions for exams in DRAFT status',
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
        if (error.message.startsWith('LESSONS_NOT_FOUND:')) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_010',
                message: 'The selected lesson source no longer exists. Re-open the generator and choose a valid lesson.',
              },
            },
            { status: 400 }
          );
        }

        if (error.message.startsWith('NO_CONTENT_AVAILABLE')) {
          const detail = error.message.split(':').slice(1).join(':');
          const detailText = detail.toUpperCase();
          let message = 'No XML knowledge context is currently usable for question generation. Ensure the selected lesson has either a READY XML context or a transcript (VTT) that can be rebuilt.';

          if (detailText.includes('TRANSCRIPT_MISSING')) {
            message = 'The selected lesson has no usable XML context and no transcript (VTT) to rebuild from. Upload a transcript or choose another lesson.'
          } else if (detailText.includes('TRANSCRIPT_REBUILD_FAILED') || detailText.includes('XML_UNAVAILABLE_AFTER_REBUILD')) {
            message = 'The selected lesson XML context could not be loaded or regenerated from its transcript. Re-upload/regenerate that lesson transcript context, or choose another lesson.'
          }

          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_009',
                message,
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
