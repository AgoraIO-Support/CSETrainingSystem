# XML-Based Knowledge Context System

## Overview

This document describes the new XML-based full context injection system that replaces the previous RAG (Retrieval-Augmented Generation) pipeline. The new system leverages OpenAI's context caching for better performance and cost efficiency.

### Why Replace RAG?

The previous RAG system had several limitations:

1. **Latency**: Vector similarity search added ~200-500ms per query
2. **Context fragmentation**: Retrieved chunks often lacked coherence
3. **Embedding costs**: Generating and storing embeddings for every transcript
4. **Threshold tuning**: Similarity thresholds required constant adjustment
5. **Cache inefficiency**: Dynamic context prevented OpenAI prompt caching

### New Approach: Full Context Injection

Instead of embedding + vector search, we now:

1. Convert VTT transcripts to structured XML (one-time processing)
2. Inject the full XML as a static prefix in the system prompt
3. Let the LLM search the full context directly
4. Leverage OpenAI's context caching (50% cost reduction on cache hits)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VTT Upload Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  VTT File ──► VTTToXMLService ──► XML + Anchors                │
│                    │                    │                       │
│                    ▼                    ▼                       │
│              GPT-4o-mini          KnowledgeContext              │
│           (section titles)         (stored in S3)               │
│                                         │                       │
│                                         ▼                       │
│                                  KnowledgeAnchors               │
│                                   (stored in DB)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        AI Chat Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Query ──► AIService.sendMessage()                        │
│                       │                                         │
│                       ▼                                         │
│              Check KnowledgeContext                             │
│                       │                                         │
│           ┌──────────┴──────────┐                              │
│           ▼                     ▼                               │
│     Full Context           RAG Fallback                         │
│     (XML first)            (legacy)                             │
│           │                     │                               │
│           └──────────┬──────────┘                              │
│                      ▼                                          │
│               OpenAI API                                        │
│          (with caching benefit)                                 │
│                      │                                          │
│                      ▼                                          │
│         Response with timestamps                                │
│    [Click to jump to video HH:MM:SS]                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### KnowledgeContext Model

Stores the generated XML knowledge base for each lesson.

```prisma
model KnowledgeContext {
  id        String @id @default(uuid())
  lessonId  String @unique
  lesson    Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  s3Key       String                   // S3 location of XML file
  contentHash String                   // SHA-256 for cache invalidation
  tokenCount  Int                      // Estimated token count
  sectionCount Int                     // Number of transcript sections
  anchorCount Int                      // Number of knowledge anchors

  status       KnowledgeContextStatus @default(PENDING)
  errorMessage String?                @db.Text

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  processedAt DateTime?

  @@map("knowledge_contexts")
}

enum KnowledgeContextStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}
```

### KnowledgeAnchor Model

Stores key moments for frontend video navigation.

```prisma
model KnowledgeAnchor {
  id        String @id @default(uuid())
  lessonId  String
  lesson    Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  timestamp    Decimal @db.Decimal(10, 3)  // Seconds
  timestampStr String                       // "HH:MM:SS"
  title        String                       // Section title
  summary      String  @db.Text             // Brief summary
  keyTerms     String[]                     // Key concepts
  anchorType   KnowledgeAnchorType @default(CONCEPT)
  sequenceIndex Int                         // Order in video

  @@map("knowledge_anchors")
}

enum KnowledgeAnchorType {
  CONCEPT      // Core concept explanation
  EXAMPLE      // Practical example
  DEMO         // Live demonstration
  KEY_TAKEAWAY // Summary/conclusion moment
}
```

---

## Services

### VTTToXMLService

**Location**: `lib/services/vtt-to-xml.service.ts`

Converts VTT transcripts to structured XML knowledge bases.

#### Processing Pipeline

1. **Parse VTT**: Extract cues with timestamps
2. **Denoise**: Remove filler words (um, uh, like, you know, etc.)
3. **Aggregate**: Combine into 45-90 second semantic paragraphs
4. **Enrich**: Use GPT-4o-mini to generate section titles and extract concepts
5. **Extract Anchors**: Identify key moments for navigation
6. **Generate XML**: Create deterministic, cache-friendly output

#### Filler Word Removal

```typescript
const FILLER_PATTERNS = [
  /\b(um|uh|er|ah)\b/gi,
  /\b(you know|like|I mean|so basically|kind of|sort of)\b/gi,
  /\b(right\?|okay\?|yeah\?)\s*$/gi,
];
```

#### XML Output Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<knowledge_base course_id="..." lesson_id="..." version="1.0">
  <course_overview>
    <title>Course Title</title>
    <chapter>Chapter Name</chapter>
    <lesson>Lesson Name</lesson>
  </course_overview>
  <transcript_sections>
    <section timestamp="00:00:00" end_timestamp="00:01:30"
             title="Introduction to Topic" anchor_type="CONCEPT">
      <content>Cleaned transcript text...</content>
      <key_concepts>
        <concept>API Design</concept>
        <concept>RESTful Services</concept>
      </key_concepts>
    </section>
    <!-- More sections... -->
  </transcript_sections>
</knowledge_base>
```

### KnowledgeContextService

**Location**: `lib/services/knowledge-context.service.ts`

Manages storage, retrieval, and caching of XML knowledge contexts.

#### Key Methods

| Method | Description |
|--------|-------------|
| `generateAndStoreContext()` | Main entry point - generates XML and stores to S3 |
| `getKnowledgeContext()` | Retrieves XML (memory cache → S3) |
| `getAnchors()` | Gets anchors for frontend display |
| `invalidateContext()` | Clears cache when VTT is re-uploaded |

#### Caching Strategy

1. **Memory Cache**: 30-minute TTL for frequently accessed lessons
2. **S3 Storage**: Persistent storage with 1-year cache headers
3. **Hash-based Invalidation**: SHA-256 content hash for change detection

### AIService Modifications

**Location**: `lib/services/ai.service.ts`

#### Context Priority

```
1. Full Context (XML-based) - Preferred
2. RAG (embedding + vector search) - Fallback
3. Legacy Transcript - Last resort
```

#### Prompt Structure (Cache-Optimized)

```
┌─────────────────────────────────────────┐
│ XML Knowledge Base (STATIC PREFIX)      │  ← Cached by OpenAI
│ - Full transcript with sections         │
│ - Key concepts                          │
│ - Timestamps                            │
├─────────────────────────────────────────┤
│ System Instructions                     │
│ - Response rules                        │
│ - Citation format                       │
│ - Quiz generation                       │
├─────────────────────────────────────────┤
│ Conversation History                    │  ← Dynamic
├─────────────────────────────────────────┤
│ User Message                            │  ← Dynamic
└─────────────────────────────────────────┘
```

**Critical**: XML must be FIRST in the prompt for cache efficiency.

#### Response Format

```json
{
  "answer": "Explanation with [Click to jump to video 00:02:30 for details]...",
  "suggestions": ["Follow-up question 1", "Follow-up question 2"],
  "quiz": {
    "question": "What is the main purpose of...?",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0
  }
}
```

---

## API Endpoints

### Admin Routes

#### GET `/api/admin/lessons/[lessonId]/knowledge`

Get knowledge context status and metadata.

**Response**:
```json
{
  "success": true,
  "data": {
    "exists": true,
    "status": "READY",
    "tokenCount": 15000,
    "sectionCount": 25,
    "anchorCount": 8,
    "processedAt": "2025-01-15T10:30:00Z",
    "anchors": [
      { "id": "...", "timestamp": 0, "title": "Introduction", "anchorType": "CONCEPT" }
    ]
  }
}
```

#### POST `/api/admin/lessons/[lessonId]/knowledge/generate`

Trigger XML knowledge base generation.

**Prerequisites**: Lesson must have a processed VTT transcript (status: READY)

**Response**:
```json
{
  "success": true,
  "message": "Knowledge context generated successfully",
  "data": {
    "lessonId": "...",
    "status": "READY",
    "tokenCount": 15000,
    "sectionCount": 25,
    "anchorCount": 8
  }
}
```

### User Routes

#### GET `/api/lessons/[lessonId]/anchors`

Get knowledge anchors for video navigation.

**Response**:
```json
{
  "success": true,
  "data": {
    "anchors": [
      {
        "id": "uuid",
        "timestamp": 150.5,
        "timestampStr": "00:02:30",
        "title": "API Authentication",
        "summary": "Explains token-based authentication...",
        "keyTerms": ["JWT", "OAuth", "Bearer Token"],
        "anchorType": "CONCEPT",
        "sequenceIndex": 3
      }
    ]
  }
}
```

---

## Frontend Components

### Timestamp Link Parsing

**Location**: `components/ai/ai-chat-panel.tsx`

AI responses containing timestamp references are automatically converted to clickable buttons:

```
Input:  "As shown [Click to jump to video 00:02:30 for details], the API..."
Output: "As shown [▶ 00:02:30], the API..."  (clickable button)
```

Supported formats:
- `[Click to jump to video HH:MM:SS for details]`
- `[HH:MM:SS]`

### Knowledge Anchors Component

**Location**: `components/ai/knowledge-anchors.tsx`

Displays "Key Moments" panel with:
- Clickable timestamps for video navigation
- Anchor type badges (Concept, Example, Demo, Key Takeaway)
- Current position indicator
- Key terms/concepts

---

## Migration & Compatibility

### Legacy Services

The following services have been renamed with `_legacy_` prefix but are still functional:

| Original | Renamed |
|----------|---------|
| `rag.service.ts` | `_legacy_rag.service.ts` |
| `chunking.service.ts` | `_legacy_chunking.service.ts` |
| `embedding.service.ts` | `_legacy_embedding.service.ts` |
| `vector-store.service.ts` | `_legacy_vector-store.service.ts` |

### Fallback Behavior

The AI service automatically falls back to RAG when:
- Knowledge context doesn't exist for a lesson
- Knowledge context status is not READY
- XML retrieval fails

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Required for AI enrichment | - |
| `OPENAI_MODEL` | Model for chat responses | `gpt-4o-mini` |

### Processing Parameters

```typescript
const DEFAULT_CONFIG = {
  minParagraphDuration: 45,    // seconds
  maxParagraphDuration: 90,    // seconds
  targetParagraphTokens: 500,  // tokens per paragraph
  maxAnchorsPerLesson: 15,     // max key moments
};
```

---

## Performance Characteristics

| Metric | RAG (Previous) | Full Context (New) |
|--------|----------------|-------------------|
| Query latency | 500-800ms | 200-400ms |
| Cache hit rate | 0% | ~70% (estimated) |
| Storage per lesson | ~2MB (vectors) | ~200KB (XML) |
| Processing time | 30-60s | 3-8s |
| Cost per query | Full prompt | 50% on cache hit |

---

## Usage Guide

### Generating Knowledge Context

1. Upload and process a VTT transcript for the lesson
2. Call the generation endpoint:
   ```bash
   curl -X POST /api/admin/lessons/{lessonId}/knowledge/generate \
     -H "Authorization: Bearer {token}"
   ```
3. The system will:
   - Fetch VTT from S3
   - Generate XML with AI-enriched sections
   - Extract knowledge anchors
   - Store XML to S3
   - Save anchors to database

### Integrating Knowledge Anchors

```tsx
import { KnowledgeAnchors } from '@/components/ai/knowledge-anchors'

<KnowledgeAnchors
  lessonId={lessonId}
  currentTime={videoCurrentTime}
  onSeekToTimestamp={(ts) => videoRef.current?.seekTo(ts)}
/>
```

---

## Future Improvements

1. **Automatic Generation**: Trigger XML generation automatically after VTT processing
2. **Incremental Updates**: Update only changed sections on VTT re-upload
3. **Multi-language Support**: Generate XML in multiple languages
4. **Analytics**: Track which anchors are most clicked
5. **Quiz Generation**: Pre-generate quizzes during XML creation
