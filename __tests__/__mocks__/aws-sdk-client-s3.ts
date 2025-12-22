/**
 * Global S3 SDK mock used by tests that don’t provide their own S3 mocks.
 *
 * Why this exists:
 * - Many services (KnowledgeContextService / AIService full-context path) fetch XML from S3.
 * - Test cases PR-* and AI-* build prompts from XML and must be deterministic + offline.
 * - Individual integration tests can still override this via `jest.mock('@aws-sdk/client-s3', ...)`.
 */

export const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<knowledge_base course_id="test-course" lesson_id="test-lesson" version="1.0">
  <course_overview>
    <title>Test Course</title>
    <chapter>Test Chapter</chapter>
    <lesson>Test Lesson</lesson>
  </course_overview>
  <transcript_sections>
    <section timestamp="00:00:00" end_timestamp="00:00:10" title="Intro" anchor_type="CONCEPT">
      <content>Test content</content>
    </section>
  </transcript_sections>
</knowledge_base>`;

export const mockS3Send = jest.fn(async (command: any) => {
  if (command?._type === 'PutObject') return {};
  if (command?._type === 'DeleteObject') return {};
  if (command?._type === 'GetObject') {
    return {
      Body: {
        transformToString: async () => DEFAULT_XML,
      },
    };
  }
  return {};
});

export class S3Client {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config?: any) {}
  send = mockS3Send;
}

export class PutObjectCommand {
  _type = 'PutObject';
  constructor(params: any) {
    Object.assign(this, params);
  }
}

export class GetObjectCommand {
  _type = 'GetObject';
  constructor(params: any) {
    Object.assign(this, params);
  }
}

export class DeleteObjectCommand {
  _type = 'DeleteObject';
  constructor(params: any) {
    Object.assign(this, params);
  }
}

