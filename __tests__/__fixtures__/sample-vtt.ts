/**
 * Test Fixtures: Sample VTT Content
 * Used across unit and integration tests
 */

// VTT with filler words that should be removed
export const VTT_WITH_FILLERS = `WEBVTT

00:00:00.000 --> 00:00:05.000
Um, so basically, you know, today we're going to talk about API design.

00:00:05.000 --> 00:00:10.000
Like, the first thing you need to understand is, uh, RESTful principles.

00:00:10.000 --> 00:00:15.000
I mean, REST stands for Representational State Transfer, right?

00:00:15.000 --> 00:00:20.000
So basically, kind of, it's about using HTTP methods correctly.

00:00:20.000 --> 00:00:25.000
GET is for reading, POST is for creating, okay?

00:00:25.000 --> 00:00:30.000
PUT is for updating and DELETE is for, you know, deleting resources.
`;

// Clean VTT without fillers (expected output reference)
export const VTT_CLEAN = `WEBVTT

00:00:00.000 --> 00:00:05.000
Today we're going to talk about API design.

00:00:05.000 --> 00:00:10.000
The first thing you need to understand is RESTful principles.

00:00:10.000 --> 00:00:15.000
REST stands for Representational State Transfer.

00:00:15.000 --> 00:00:20.000
It's about using HTTP methods correctly.

00:00:20.000 --> 00:00:25.000
GET is for reading, POST is for creating.

00:00:25.000 --> 00:00:30.000
PUT is for updating and DELETE is for deleting resources.
`;

// VTT with topic changes (for semantic segmentation tests)
export const VTT_WITH_TOPIC_CHANGES = `WEBVTT

00:00:00.000 --> 00:00:30.000
Welcome to this lesson on authentication. Authentication is the process of verifying identity.

00:00:30.000 --> 00:01:00.000
There are several authentication methods including passwords, tokens, and biometrics.

00:01:00.000 --> 00:01:30.000
Now let's move on to authorization. Authorization determines what actions a user can perform.

00:01:30.000 --> 00:02:00.000
Role-based access control is a common authorization pattern.

00:02:00.000 --> 00:02:30.000
Finally, let's discuss encryption. Encryption protects data in transit and at rest.

00:02:30.000 --> 00:03:00.000
AES and RSA are two common encryption algorithms used today.
`;

// Long VTT for token size control tests (~60k estimated tokens when processed)
export const VTT_LONG = generateLongVTT(500); // 500 cues = ~60k tokens

// VTT with precise timestamps for aggregation tests
export const VTT_SHORT_TIMESTAMPS = `WEBVTT

00:00:00.000 --> 00:00:02.000
First sentence.

00:00:02.000 --> 00:00:04.000
Second sentence.

00:00:04.000 --> 00:00:06.000
Third sentence.

00:00:06.000 --> 00:00:08.000
Fourth sentence.

00:00:08.000 --> 00:00:10.000
Fifth sentence.
`;

// Minimal valid VTT for basic tests
export const VTT_MINIMAL = `WEBVTT

00:00:00.000 --> 00:00:10.000
This is a simple test transcript about API development.

00:00:10.000 --> 00:00:20.000
APIs allow different software systems to communicate with each other.

00:00:20.000 --> 00:00:30.000
RESTful APIs use HTTP methods like GET, POST, PUT, and DELETE.
`;

// Helper to generate long VTT content
function generateLongVTT(cueCount: number): string {
  const topics = [
    'API design principles and best practices for building scalable systems',
    'Authentication mechanisms including OAuth, JWT, and session-based auth',
    'Database optimization techniques for high-performance applications',
    'Microservices architecture patterns and communication strategies',
    'Error handling and logging best practices in distributed systems',
    'Security considerations for web applications and APIs',
    'Performance testing and monitoring strategies',
    'CI/CD pipeline configuration and deployment automation',
  ];

  let vtt = 'WEBVTT\n\n';

  for (let i = 0; i < cueCount; i++) {
    const startSeconds = i * 5;
    const endSeconds = startSeconds + 5;
    const startTime = formatVTTTime(startSeconds);
    const endTime = formatVTTTime(endSeconds);
    const topic = topics[i % topics.length];

    vtt += `${startTime} --> ${endTime}\n`;
    vtt += `${topic} - segment ${i + 1}. This provides detailed information about the topic.\n\n`;
  }

  return vtt;
}

function formatVTTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.000`;
}

// Expected course context for tests
export const TEST_COURSE_CONTEXT = {
  courseId: 'test-course-001',
  courseTitle: 'API Development Masterclass',
  lessonId: 'test-lesson-001',
  lessonTitle: 'Introduction to REST APIs',
  chapterTitle: 'Fundamentals',
  lessonDescription: 'Learn the basics of RESTful API design',
};

// Expected XML structure patterns (for validation)
export const XML_STRUCTURE_PATTERNS = {
  rootElement: /<knowledge_base[^>]*>/,
  courseOverview: /<course_overview>[\s\S]*<\/course_overview>/,
  transcriptSections: /<transcript_sections>[\s\S]*<\/transcript_sections>/,
  sectionElement: /<section[^>]*timestamp="[^"]*"[^>]*>/,
  contentElement: /<content>[\s\S]*?<\/content>/,
  keyConcepts: /<key_concepts>[\s\S]*?<\/key_concepts>/,
};
