import prisma from '@/lib/prisma';
import { log } from '@/lib/logger';
import { DEFAULT_EXAM_TIMEZONE, formatDateTimeInExamTimeZone } from '@/lib/exam-timezone';

export interface SendWecomResult {
  success: boolean;
  error?: string;
}

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'CSE Training System';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL || '';
const WECOM_LOG_CONTENT = process.env.CSE_WECOM_LOG_CONTENT === '1';

function formatDeadline(deadline: Date | null, timeZone: string): string {
  if (!deadline) return 'No deadline';
  return formatDateTimeInExamTimeZone(deadline, timeZone, { includeTimeZoneName: true });
}

function escapeMarkdown(value: string): string {
  return value.replace(/([`*_~])/g, '\\$1');
}

function redactWebhookUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const key = url.searchParams.get('key');
    if (key) {
      url.searchParams.set('key', '[REDACTED]');
    }
    return url.toString();
  } catch {
    return '[INVALID_WEBHOOK_URL]';
  }
}

export class WecomWebhookService {
  static isConfigured(): boolean {
    return Boolean(WECOM_WEBHOOK_URL);
  }

  static async sendExamInvitation(userId: string, examId: string): Promise<SendWecomResult> {
    try {
      if (!this.isConfigured()) {
        log('API', 'warn', 'wecom webhook is not configured', {
          examId,
          userId,
        });
        return { success: false, error: 'WECOM_WEBHOOK_URL is not configured' };
      }

      const [user, exam] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, wecomUserId: true },
        }),
        prisma.exam.findUnique({
          where: { id: examId },
          select: {
            id: true,
            title: true,
            description: true,
            deadline: true,
            timezone: true,
            timeLimit: true,
            maxAttempts: true,
            status: true,
          },
        }),
      ]);

      if (!user || !exam) {
        return { success: false, error: 'User or exam not found' };
      }

      const mentionTarget = (user.wecomUserId?.trim() || user.email || '').trim();
      const examUrl = `${APP_URL}/exams/${exam.id}`;
      const content = [
        `## ${escapeMarkdown(APP_NAME)} - Exam Invitation`,
        `> User selected by admin for this exam`,
        '',
        mentionTarget ? `<@${mentionTarget}>` : null,
        '',
        `**User**: ${escapeMarkdown(user.name || user.email)} (${escapeMarkdown(user.email)})`,
        `**Exam**: ${escapeMarkdown(exam.title)}`,
        `**Status**: ${escapeMarkdown(exam.status)}`,
        `**Deadline**: ${escapeMarkdown(formatDeadline(exam.deadline, exam.timezone || DEFAULT_EXAM_TIMEZONE))}`,
        `**Time Limit**: ${exam.timeLimit ? `${exam.timeLimit} minutes` : 'No limit'}`,
        `**Max Attempts**: ${exam.maxAttempts}`,
        exam.description ? `**Description**: ${escapeMarkdown(exam.description)}` : null,
        `[Open Exam](${examUrl})`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
      const payload = {
        msgtype: 'markdown',
        markdown: { content },
      };

      if (!user.wecomUserId) {
        log('API', 'warn', 'wecom user id missing for mention', {
          examId,
          userId,
          email: user.email,
          fallbackToEmailMention: Boolean(user.email),
        });
      }

      log('API', 'info', 'wecom webhook request', {
        examId,
        userId,
        url: redactWebhookUrl(WECOM_WEBHOOK_URL),
        ...(WECOM_LOG_CONTENT
          ? { requestBody: payload }
          : {
              requestSummary: {
                msgtype: payload.msgtype,
                contentLength: content.length,
                mentionTarget: mentionTarget || null,
              },
            }),
      });

      const response = await fetch(WECOM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);
      log('API', 'info', 'wecom webhook response', {
        examId,
        userId,
        status: response.status,
        ok: response.ok,
        ...(WECOM_LOG_CONTENT
          ? { responseBody: json }
          : { responseSummary: { errcode: json?.errcode, hasBody: Boolean(json) } }),
      });

      if (!response.ok) {
        log('API', 'warn', 'wecom webhook non-200 response', {
          examId,
          userId,
          status: response.status,
          errcode: json?.errcode,
          errmsg: json?.errmsg,
        });
        return { success: false, error: `WeCom webhook HTTP ${response.status}` };
      }
      if (!json || json.errcode !== 0) {
        log('API', 'warn', 'wecom webhook business error', {
          examId,
          userId,
          errcode: json?.errcode,
          errmsg: json?.errmsg,
        });
        return { success: false, error: `WeCom webhook errcode=${json?.errcode ?? 'unknown'}` };
      }

      const updateResult = await prisma.examInvitation.updateMany({
        where: { userId, examId },
        data: { emailSentAt: new Date() },
      });
      log('API', 'info', 'wecom notification marked as sent', {
        examId,
        userId,
        updatedRows: updateResult.count,
      });

      return { success: true };
    } catch (error) {
      log('API', 'error', 'wecom webhook send failed', {
        examId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async sendCoursePublished(userId: string, courseId: string): Promise<SendWecomResult> {
    try {
      if (!this.isConfigured()) {
        log('API', 'warn', 'wecom webhook is not configured', {
          courseId,
          userId,
        });
        return { success: false, error: 'WECOM_WEBHOOK_URL is not configured' };
      }

      const [user, course] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, wecomUserId: true },
        }),
        prisma.course.findUnique({
          where: { id: courseId },
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            status: true,
          },
        }),
      ]);

      if (!user || !course) {
        return { success: false, error: 'User or course not found' };
      }

      const mentionTarget = (user.wecomUserId?.trim() || user.email || '').trim();
      const courseUrl = `${APP_URL}/courses/${course.slug || course.id}`;
      const content = [
        `## ${escapeMarkdown(APP_NAME)} - Course Published`,
        `> Course is now available`,
        '',
        mentionTarget ? `<@${mentionTarget}>` : null,
        '',
        `**User**: ${escapeMarkdown(user.name || user.email)} (${escapeMarkdown(user.email)})`,
        `**Course**: ${escapeMarkdown(course.title)}`,
        `**Status**: ${escapeMarkdown(course.status)}`,
        course.description ? `**Description**: ${escapeMarkdown(course.description)}` : null,
        `[Open Course](${courseUrl})`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
      const payload = {
        msgtype: 'markdown',
        markdown: { content },
      };

      if (!user.wecomUserId) {
        log('API', 'warn', 'wecom user id missing for mention', {
          courseId,
          userId,
          email: user.email,
          fallbackToEmailMention: Boolean(user.email),
        });
      }

      log('API', 'info', 'wecom webhook request', {
        courseId,
        userId,
        url: redactWebhookUrl(WECOM_WEBHOOK_URL),
        ...(WECOM_LOG_CONTENT
          ? { requestBody: payload }
          : {
              requestSummary: {
                msgtype: payload.msgtype,
                contentLength: content.length,
                mentionTarget: mentionTarget || null,
              },
            }),
      });

      const response = await fetch(WECOM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);
      log('API', 'info', 'wecom webhook response', {
        courseId,
        userId,
        status: response.status,
        ok: response.ok,
        ...(WECOM_LOG_CONTENT
          ? { responseBody: json }
          : { responseSummary: { errcode: json?.errcode, hasBody: Boolean(json) } }),
      });

      if (!response.ok) {
        log('API', 'warn', 'wecom webhook non-200 response', {
          courseId,
          userId,
          status: response.status,
          errcode: json?.errcode,
          errmsg: json?.errmsg,
        });
        return { success: false, error: `WeCom webhook HTTP ${response.status}` };
      }
      if (!json || json.errcode !== 0) {
        log('API', 'warn', 'wecom webhook business error', {
          courseId,
          userId,
          errcode: json?.errcode,
          errmsg: json?.errmsg,
        });
        return { success: false, error: `WeCom webhook errcode=${json?.errcode ?? 'unknown'}` };
      }

      return { success: true };
    } catch (error) {
      log('API', 'error', 'wecom webhook send failed', {
        courseId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async sendCourseInvitation(userId: string, courseId: string): Promise<SendWecomResult> {
    try {
      if (!this.isConfigured()) {
        log('API', 'warn', 'wecom webhook is not configured', {
          courseId,
          userId,
        });
        return { success: false, error: 'WECOM_WEBHOOK_URL is not configured' };
      }

      const [user, course] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, wecomUserId: true },
        }),
        prisma.course.findUnique({
          where: { id: courseId },
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            status: true,
          },
        }),
      ]);

      if (!user || !course) {
        return { success: false, error: 'User or course not found' };
      }

      const mentionTarget = (user.wecomUserId?.trim() || user.email || '').trim();
      const courseUrl = `${APP_URL}/courses/${course.slug || course.id}`;
      const content = [
        `## ${escapeMarkdown(APP_NAME)} - Course Invitation`,
        `> User selected by admin for this course`,
        '',
        mentionTarget ? `<@${mentionTarget}>` : null,
        '',
        `**User**: ${escapeMarkdown(user.name || user.email)} (${escapeMarkdown(user.email)})`,
        `**Course**: ${escapeMarkdown(course.title)}`,
        `**Status**: ${escapeMarkdown(course.status)}`,
        course.description ? `**Description**: ${escapeMarkdown(course.description)}` : null,
        `[Open Course](${courseUrl})`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
      const payload = {
        msgtype: 'markdown',
        markdown: { content },
      };

      if (!user.wecomUserId) {
        log('API', 'warn', 'wecom user id missing for mention', {
          courseId,
          userId,
          email: user.email,
          fallbackToEmailMention: Boolean(user.email),
        });
      }

      log('API', 'info', 'wecom webhook request', {
        courseId,
        userId,
        url: redactWebhookUrl(WECOM_WEBHOOK_URL),
        ...(WECOM_LOG_CONTENT
          ? { requestBody: payload }
          : {
              requestSummary: {
                msgtype: payload.msgtype,
                contentLength: content.length,
                mentionTarget: mentionTarget || null,
              },
            }),
      });

      const response = await fetch(WECOM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);
      log('API', 'info', 'wecom webhook response', {
        courseId,
        userId,
        status: response.status,
        ok: response.ok,
        ...(WECOM_LOG_CONTENT
          ? { responseBody: json }
          : { responseSummary: { errcode: json?.errcode, hasBody: Boolean(json) } }),
      });

      if (!response.ok) {
        log('API', 'warn', 'wecom webhook non-200 response', {
          courseId,
          userId,
          status: response.status,
          errcode: json?.errcode,
          errmsg: json?.errmsg,
        });
        return { success: false, error: `WeCom webhook HTTP ${response.status}` };
      }
      if (!json || json.errcode !== 0) {
        log('API', 'warn', 'wecom webhook business error', {
          courseId,
          userId,
          errcode: json?.errcode,
          errmsg: json?.errmsg,
        });
        return { success: false, error: `WeCom webhook errcode=${json?.errcode ?? 'unknown'}` };
      }

      return { success: true };
    } catch (error) {
      log('API', 'error', 'wecom webhook send failed', {
        courseId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
