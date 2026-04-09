/**
 * Knowledge Context Status API
 * GET - Get knowledge context status for a lesson
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import prisma from '@/lib/prisma';
import { TrainingOpsService } from '@/lib/services/training-ops.service';

/**
 * GET /api/admin/lessons/[lessonId]/knowledge
 * Get knowledge context status and metadata
 */
export const GET = withSmeOrAdminAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    const params = await context.params;
    const { lessonId } = params;
    if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId);

    const latestJob = await prisma.knowledgeContextJob.findFirst({
      where: { lessonId },
      orderBy: { createdAt: 'desc' },
    });

    const knowledgeService = new KnowledgeContextService();
    const contextInfo = await knowledgeService.getContextInfo(lessonId);

    if (!contextInfo) {
      return NextResponse.json({
        success: true,
        data: {
          exists: false,
          status: null,
          message: 'No knowledge context generated yet',
          job: latestJob
            ? {
                id: latestJob.id,
                state: latestJob.state,
                stage: latestJob.stage,
                attempt: latestJob.attempt,
                maxAttempts: latestJob.maxAttempts,
                progress: latestJob.progress,
                scheduledAt: latestJob.scheduledAt.toISOString(),
                startedAt: latestJob.startedAt?.toISOString() || null,
                finishedAt: latestJob.finishedAt?.toISOString() || null,
                lastHeartbeatAt: latestJob.lastHeartbeatAt?.toISOString() || null,
                workerId: latestJob.workerId || null,
                errorMessage: latestJob.errorMessage || null,
              }
            : null,
        },
      });
    }

    const anchors = await knowledgeService.getAnchors(lessonId);

    return NextResponse.json({
      success: true,
      data: {
        exists: true,
        status: contextInfo.status,
        tokenCount: contextInfo.tokenCount,
        sectionCount: contextInfo.sectionCount,
        anchorCount: contextInfo.anchorCount,
        contentHash: contextInfo.contentHash,
        processedAt: contextInfo.processedAt?.toISOString() || null,
        errorMessage: contextInfo.errorMessage,
        job: latestJob
          ? {
              id: latestJob.id,
              state: latestJob.state,
              stage: latestJob.stage,
              attempt: latestJob.attempt,
              maxAttempts: latestJob.maxAttempts,
              progress: latestJob.progress,
              scheduledAt: latestJob.scheduledAt.toISOString(),
              startedAt: latestJob.startedAt?.toISOString() || null,
              finishedAt: latestJob.finishedAt?.toISOString() || null,
              lastHeartbeatAt: latestJob.lastHeartbeatAt?.toISOString() || null,
              workerId: latestJob.workerId || null,
              errorMessage: latestJob.errorMessage || null,
            }
          : null,
        anchors: anchors.map(a => ({
          id: a.id,
          timestamp: a.timestamp,
          timestampStr: a.timestampStr,
          title: a.title,
          anchorType: a.anchorType,
        })),
      },
    });
  } catch (error) {
    console.error('Get knowledge context error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
