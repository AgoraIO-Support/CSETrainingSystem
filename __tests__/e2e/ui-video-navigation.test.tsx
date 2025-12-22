/** @jest-environment jsdom */

/**
 * Frontend Integration (Video + Anchors) "E2E" Tests (JSDOM)
 * Tests: UI-01 through UI-04 (P0–P2)
 *
 * Why JSDOM (not Playwright) here:
 * - Existing suite uses Jest-style "E2E" tests that validate integration logic without
 *   a real browser/video element. We follow the same conventions to keep CI deterministic.
 * - We validate the critical contract: timestamp parsing + anchor clicks call the provided
 *   `onSeekToTimestamp()` callback with the correct `HH:MM:SS` string.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIChatPanel } from '@/components/ai/ai-chat-panel';
import { KnowledgeAnchors } from '@/components/ai/knowledge-anchors';
import { ApiClient } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  ApiClient: {
    createConversation: jest.fn(),
    getConversationMessages: jest.fn(),
    sendAIMessage: jest.fn(),
    request: jest.fn(),
  },
}));

const mockedApiClient = ApiClient as unknown as {
  createConversation: jest.Mock;
  getConversationMessages: jest.Mock;
  sendAIMessage: jest.Mock;
  request: jest.Mock;
};

describe('Frontend Integration (Video + Anchors)', () => {
  beforeEach(() => {
    mockedApiClient.createConversation.mockReset();
    mockedApiClient.getConversationMessages.mockReset();
    mockedApiClient.sendAIMessage.mockReset();
    mockedApiClient.request.mockReset();
  });

  /**
   * UI-01: Timestamp link parsing (P0)
   *
   * Critical because the assistant must produce clickable timestamps and the UI must
   * convert them into "seek" actions (callback invocation).
   */
  describe('UI-01: Timestamp link parsing', () => {
    it('should convert timestamp references into clickable buttons and call onSeekToTimestamp', async () => {
      const onSeekToTimestamp = jest.fn();

      mockedApiClient.createConversation.mockResolvedValue({
        data: { conversation: { id: 'conv-ui-01' } },
      });
      mockedApiClient.getConversationMessages.mockResolvedValue({
        data: [
          {
            id: 'msg-a1',
            role: 'assistant',
            // Include both supported formats:
            // - [Click to jump to video HH:MM:SS for details]
            // - [HH:MM:SS]
            content:
              'See this moment [Click to jump to video 00:02:30 for details] and also [00:03:00].',
            createdAt: new Date().toISOString(),
          },
        ],
      });
      // Knowledge readiness gate: at least 1 anchor means READY.
      mockedApiClient.request.mockResolvedValue({
        success: true,
        data: {
          anchors: [
            {
              id: 'a-ready',
              timestamp: 0,
              timestampStr: '00:00:00',
              title: 'Ready',
              summary: 'Ready',
              keyTerms: [],
              anchorType: 'CONCEPT',
              sequenceIndex: 0,
            },
          ],
        },
      });

      render(
        <AIChatPanel
          courseId="course-ui"
          lessonId="lesson-ui"
          lessonTitle="UI Lesson"
          currentTime={0}
          onSeekToTimestamp={onSeekToTimestamp}
        />
      );

      const user = userEvent.setup();

      // Buttons are rendered by parsing the assistant message content.
      const ts1 = await screen.findByRole('button', { name: /00:02:30/ });
      const ts2 = await screen.findByRole('button', { name: /00:03:00/ });

      await user.click(ts1);
      await user.click(ts2);

      expect(onSeekToTimestamp).toHaveBeenCalledWith('00:02:30');
      expect(onSeekToTimestamp).toHaveBeenCalledWith('00:03:00');
    });
  });

  /**
   * UI-02: Anchor navigation (P0)
   *
   * Critical because learners rely on "Key Moments" to jump around the video.
   */
  describe('UI-02: Anchor navigation', () => {
    it('should call onSeekToTimestamp when an anchor is clicked', async () => {
      const onSeekToTimestamp = jest.fn();

      mockedApiClient.request.mockResolvedValue({
        success: true,
        data: {
          anchors: [
            {
              id: 'a1',
              timestamp: 30,
              timestampStr: '00:00:30',
              title: 'Introduction',
              summary: 'Intro summary',
              keyTerms: ['REST'],
              anchorType: 'CONCEPT',
              sequenceIndex: 0,
            },
            {
              id: 'a2',
              timestamp: 90,
              timestampStr: '00:01:30',
              title: 'HTTP Methods',
              summary: 'Methods summary',
              keyTerms: ['GET', 'POST'],
              anchorType: 'EXAMPLE',
              sequenceIndex: 1,
            },
          ],
        },
      });

      render(
        <KnowledgeAnchors
          lessonId="lesson-ui"
          currentTime={0}
          onSeekToTimestamp={onSeekToTimestamp}
        />
      );

      const user = userEvent.setup();

      // Wait for anchors to load + render.
      const introTitle = await screen.findByText('Introduction');
      await user.click(introTitle.closest('button')!);

      expect(onSeekToTimestamp).toHaveBeenCalledWith('00:00:30');
    });
  });

  /**
   * UI-03: Active anchor highlight (P1)
   *
   * Important UX: the sidebar should show which segment is currently playing.
   */
  describe('UI-03: Active anchor highlight', () => {
    it('should highlight the correct anchor based on currentTime', async () => {
      mockedApiClient.request.mockResolvedValue({
        success: true,
        data: {
          anchors: [
            {
              id: 'a1',
              timestamp: 10,
              timestampStr: '00:00:10',
              title: 'Part 1',
              summary: 'S1',
              keyTerms: [],
              anchorType: 'CONCEPT',
              sequenceIndex: 0,
            },
            {
              id: 'a2',
              timestamp: 40,
              timestampStr: '00:00:40',
              title: 'Part 2',
              summary: 'S2',
              keyTerms: [],
              anchorType: 'CONCEPT',
              sequenceIndex: 1,
            },
          ],
        },
      });

      render(<KnowledgeAnchors lessonId="lesson-ui" currentTime={25} />);

      // Wait for anchors to render.
      await screen.findByText('Part 1');

      // The "Now" badge should be associated with Part 1 because 25s is between 10s and 40s.
      const now = await screen.findByText('Now');
      const nowButton = now.closest('button');
      expect(nowButton).not.toBeNull();
      expect(nowButton).toHaveTextContent('Part 1');
    });
  });

  /**
   * UI-04: Scroll sync (P2)
   *
   * The current implementation doesn’t perform true scroll sync; this is a CI-safe
   * smoke test to ensure large anchor lists and frequent `currentTime` updates do not
   * crash or hang (basic responsiveness guard).
   */
  describe('UI-04: Scroll sync (smoke)', () => {
    it('should remain stable with a long anchor list and rapid currentTime updates', async () => {
      const anchors = Array.from({ length: 120 }, (_, i) => ({
        id: `a-${i}`,
        timestamp: i * 10,
        timestampStr: `00:${String(Math.floor((i * 10) / 60)).padStart(2, '0')}:${String(
          (i * 10) % 60
        ).padStart(2, '0')}`,
        title: `Anchor ${i}`,
        summary: 'S',
        keyTerms: [],
        anchorType: 'CONCEPT',
        sequenceIndex: i,
      }));

      mockedApiClient.request.mockResolvedValue({
        success: true,
        data: { anchors },
      });

      const { rerender } = render(
        <KnowledgeAnchors lessonId="lesson-ui" currentTime={0} />
      );

      await screen.findByText('Key Moments');

      // Simulate the player advancing and the component re-rendering.
      for (const t of [5, 15, 25, 35, 45, 55]) {
        rerender(<KnowledgeAnchors lessonId="lesson-ui" currentTime={t} />);
      }

      // Still renders the panel and does not crash.
      expect(screen.getByText('Key Moments')).toBeInTheDocument();
    });
  });
});
