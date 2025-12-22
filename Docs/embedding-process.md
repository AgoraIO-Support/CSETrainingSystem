# Transcript Embedding Process - Detailed Steps

## Overview

The embedding process transforms raw VTT (Video Text Track) transcripts into searchable vector embeddings for the RAG (Retrieval-Augmented Generation) system. This document details each step of the pipeline.

**Process Type**: Asynchronous background job
**Total Steps**: 5 major stages
**Typical Duration**: 1-5 minutes depending on transcript length
**Status Tracking**: Real-time progress updates via WebSocket/polling

---

## Architecture Overview

```
VTT Upload
    ↓
[VALIDATING] → Validate VTT format and encoding
    ↓
[CHUNKING] → Parse VTT and split into semantic chunks
    ↓
[EMBEDDING] → Generate vector embeddings via OpenAI API
    ↓
[INDEXING] → Store embeddings in pgvector database
    ↓
[READY] → Embeddings available for RAG queries
```

---

## Step 1: VTT Upload & Initialization

### Endpoint
```
POST /api/admin/lessons/[lessonId]/transcript
```

### What Happens
1. **Validation Request**: Admin submits VTT file metadata
   - Filename (required)
   - Content type (must be `text/vtt`)
   - Video asset ID (links to video)
   - Language (optional, default: `en`)

2. **Database Record Creation**: Creates `TranscriptAsset` record
   - Status: `PENDING`
   - S3 key: Generated for storage
   - Associated with lesson + video

3. **S3 Upload URL Generation**: Returns presigned URL for client
   - Expiration: 1 hour
   - Client uploads VTT file directly to S3
   - No server-side file handling

### Database Impact
```sql
INSERT INTO transcript_assets (
  lessonId, videoAssetId, filename, s3Key,
  language, status
) VALUES (...)
```

### Response Example
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/...",
    "transcriptAsset": {
      "id": "uuid",
      "status": "PENDING"
    }
  }
}
```

---

## Step 2: Validation (Status: VALIDATING → 0%)

### Service: `VTTValidationService`
**File**: `lib/services/vtt.service.ts`

### Validation Checks (Can be Skipped)

#### 2.1 Format Validation
```typescript
// Requirement: File must start with "WEBVTT"
WEBVTT
```
- ✅ Checks first line content
- ❌ Fails if missing WEBVTT header
- Returns specific error message with location

#### 2.2 Encoding Validation
```typescript
// Requirement: UTF-8 encoding
```
- Uses TextEncoder/TextDecoder with UTF-8 validation
- Catches invalid character sequences
- Prevents parsing errors from malformed input

#### 2.3 Timestamp Format Validation
```
Valid formats:
- HH:MM:SS.mmm --> HH:MM:SS.mmm (full format)
- MM:SS.mmm --> MM:SS.mmm (short format)

Invalid:
- MM:SS --> MM:SS (missing milliseconds)
- HH:MM:SS -> HH:MM:SS (wrong separator)
```

**Regex Pattern**:
```regex
^(\d{2}:)?\d{2}:\d{2}\.\d{3}\s-->\s(\d{2}:)?\d{2}:\d{2}\.\d{3}
```

#### 2.4 Timestamp Continuity
- ✅ Warns on overlapping cues (start before previous end)
- ✅ Detects gaps between cues (informational)
- ❌ Does NOT fail - only warnings generated

#### 2.5 Duration Alignment
```typescript
tolerance = max(videoDuration * 0.05, 30 seconds)

if (maxTimestamp > videoDuration + tolerance) {
  // Warning: transcript exceeds video
}
```
- 5% tolerance or 30 seconds (whichever is greater)
- Prevents extremely misaligned transcripts

### Current Configuration
```typescript
{
  skipValidation: true  // VTT validation disabled
}
```

**Reason for Skipping**: Auto-generated VTT files may have non-standard formatting but are still processable. Manual validation happens during parsing.

### Example Error Response
```json
{
  "status": "FAILED",
  "error": {
    "code": "VTT_SYNTAX_ERROR",
    "message": "Invalid timestamp format",
    "line": 42,
    "context": "00:12:30.200 -> 00:12:45.100"
  }
}
```

---

## Step 3: Parsing (Status: CHUNKING → 20%)

### Service: `VTTParserService`
**File**: `lib/services/vtt-parser.service.ts`

### Parsing Process

#### 3.1 Input Handling
```typescript
// Raw VTT file content
const vttContent: string = (downloaded from S3)

// Parse into structured cues
const { cues } = VTTParserService.parse(vttContent)
```

#### 3.2 Cue Extraction
```typescript
interface ParsedCue {
  id?: string                    // Optional cue identifier
  startTime: number              // Start timestamp in seconds
  endTime: number                // End timestamp in seconds
  text: string                   // Cue text content
}
```

**Parsing Rules**:
1. Skip WEBVTT header line
2. Skip NOTE lines (comments)
3. Extract timestamp lines: `00:00:00.000 --> 00:00:05.000`
4. Collect text lines following timestamps
5. Empty line signals end of cue

#### 3.3 HTML Tag Stripping
```typescript
// Input: "Hello <b>world</b> <i>today</i>"
// Output: "Hello world today"

const text = cueText.replace(/<[^>]*>/g, '');
```

- Removes WebVTT styling tags (bold, italic, etc.)
- Preserves plain text content
- Prevents embedding noise from formatting

#### 3.4 Timestamp Conversion
```typescript
// Input string: "00:12:34.567"
// Process:
const [hours, minutes, secondsMs] = timestamp.split(':')
const [seconds, millis] = secondsMs.split('.')

// Output: 754.567 (seconds)
const totalSeconds = hours * 3600 + minutes * 60 + seconds + millis / 1000
```

#### 3.5 Validation During Parsing
- Ensures all cues have valid timestamps
- Skips malformed cues with warning
- Requires at least one valid cue
- Fails if zero cues found

### Example Parsed Output
```typescript
[
  {
    startTime: 0,
    endTime: 5.5,
    text: "Introduction to machine learning"
  },
  {
    startTime: 5.5,
    endTime: 12.3,
    text: "What is machine learning and why does it matter?"
  },
  // ... more cues
]
```

---

## Step 4: Chunking (Status: CHUNKING → 20%)

### Service: `ChunkingService`
**File**: `lib/services/chunking.service.ts`

### Why Chunking?
- Cues are too small (1-3 tokens average)
- Need larger context windows (150-500 tokens)
- Preserve temporal information for citations
- Optimal chunk size for embeddings

### Chunking Algorithm

#### 4.1 Configuration
```typescript
interface ChunkConfig {
  minTokens: number           // Minimum 150 tokens
  targetTokens: number        // Aim for 300 tokens
  maxTokens: number           // Hard limit 500 tokens
  minTimeWindow: number       // Minimum 10 seconds
  maxTimeWindow: number       // Maximum 60 seconds
  overlapSentences: number    // 2 sentences overlap
}

// Default (from transcript-processing.service.ts)
const defaultConfig = {
  minTokens: 150,
  targetTokens: 300,
  maxTokens: 500,
  minTimeWindow: 10,
  maxTimeWindow: 60,
  overlapSentences: 2
}
```

#### 4.2 Token Counting
```typescript
// Simple word-based token estimation
const tokenCount = Math.ceil(text.split(/\s+/).length / 1.3)

// Rationale: Average 1.3 words per token for English
// More accurate than simple word count, less expensive than API call
```

#### 4.3 Chunk Building Strategy

**Algorithm**:
```
current_chunk = []
current_tokens = 0

for each cue in transcript:
  cue_tokens = estimateTokens(cue.text)

  if current_tokens + cue_tokens <= maxTokens:
    // Add to current chunk
    current_chunk.push(cue)
    current_tokens += cue_tokens
  else:
    // Current chunk is full
    if current_tokens >= minTokens:
      save_chunk(current_chunk)
      // Keep overlap sentences
      current_chunk = keep_last_2_sentences(current_chunk)
      current_tokens = count_remaining_tokens()

    // Start new chunk with this cue
    current_chunk.push(cue)
    current_tokens = cue_tokens

// Don't forget last chunk
if current_tokens > 0:
  save_chunk(current_chunk)
```

#### 4.4 Temporal Information Preservation
```typescript
interface Chunk {
  id: string                  // UUID for each chunk
  sequenceIndex: number       // 0, 1, 2, ... (order in transcript)
  startTime: number           // Earliest cue start in seconds
  endTime: number             // Latest cue end in seconds
  text: string                // Concatenated cue texts
  tokenCount: number          // Total tokens in chunk
  cues: ParsedCue[]          // Source cues (for reference)
}
```

### Example Chunking Output

**Input Cues**:
```
00:00:00.000 --> 00:00:04.500
Introduction to machine learning.

00:00:04.500 --> 00:00:09.200
Machine learning is a subset of AI.

00:00:09.200 --> 00:00:14.800
It enables computers to learn from data.

00:00:14.800 --> 00:00:20.100
Without explicit programming instructions.
```

**Output Chunks** (targetTokens=300):
```typescript
Chunk 0:
{
  id: "uuid-1",
  sequenceIndex: 0,
  startTime: 0,
  endTime: 14.8,
  text: "Introduction to machine learning. Machine learning is a subset of AI. It enables computers to learn from data.",
  tokenCount: 28
}

Chunk 1:
{
  id: "uuid-2",
  sequenceIndex: 1,
  startTime: 9.2,
  endTime: 20.1,
  text: "It enables computers to learn from data. Without explicit programming instructions.",
  tokenCount: 16
}
```

### Chunk Validation
- ✅ Each chunk has valid start/end times
- ✅ Chunks are ordered sequentially
- ✅ No overlapping time ranges (except sentence overlap)
- ❌ Fails if no valid chunks can be created

---

## Step 5: Embedding Generation (Status: EMBEDDING → 40-80%)

### Service: `EmbeddingService`
**File**: `lib/services/embedding.service.ts`

### OpenAI API Integration

#### 5.1 Model Configuration
```typescript
{
  model: "text-embedding-3-small",
  dimensions: 1536,
  cost: $0.02 per million tokens,
  rateLimit: 3,000 requests per minute
}
```

#### 5.2 Batch Processing Strategy

**Why Batching?**
- OpenAI API accepts 2,048 texts per request
- Our batches: 100 texts per request
- Reduces latency, improves resilience

**Process**:
```typescript
// Configuration
const BATCH_SIZE = 100
const MAX_CONCURRENCY = 5

// Example: 350 chunks → 4 batches
// Batches: [100, 100, 100, 50]

// Execute with concurrency control
const activeBatches: Promise[] = []

for batch in batches:
  while activeBatches.length >= MAX_CONCURRENCY:
    wait for at least one to complete

  submit batch to OpenAI API
  track progress
```

#### 5.3 API Request Format
```typescript
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: [
    "Introduction to machine learning...",
    "Machine learning is a subset of AI...",
    // ... up to 100 texts per batch
  ],
  encoding_format: "float"  // Get float32 arrays
})
```

#### 5.4 Response Processing
```typescript
// Response from OpenAI:
{
  object: "list",
  data: [
    {
      object: "embedding",
      index: 0,
      embedding: [0.0017, 0.0364, 0.0055, ...] // 1536 floats
    },
    // ... one per input text
  ],
  model: "text-embedding-3-small",
  usage: {
    prompt_tokens: 4567,
    total_tokens: 4567
  }
}

// Map back to chunks:
chunks[0].embedding = [0.0017, 0.0364, 0.0055, ...]
chunks[1].embedding = [...]
// ...
```

#### 5.5 Error Handling & Retry Logic

```typescript
// Retryable errors:
- 429 (Rate limit)
- 500-599 (Server errors)
- ETIMEDOUT, ECONNRESET (Network issues)

// Exponential backoff:
retry_delay = base_delay * 2^(attempt - 1)
// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 4000ms

// Non-retryable errors (fail immediately):
- 400 (Invalid request)
- 401 (Auth failure)
- 403 (Forbidden)
```

#### 5.6 Progress Tracking

**Progress Calculation**:
```typescript
// Embedding phase: 40% to 80% of total progress
const embeddingPhase = 40 + (processedChunks / totalChunks) * 40

// Example:
// Total chunks: 100
// After batch 1 (100 chunks): 40 + (100/100)*40 = 80%
```

**Callback Updates**:
```typescript
onProgress?.({
  status: 'EMBEDDING',
  progress: 65,  // Current percentage
  currentStep: 'Generating embeddings: 150/350 chunks'
})
```

### Example Embedding Output

```typescript
{
  chunks: [
    {
      id: "uuid-1",
      text: "Introduction to machine learning...",
      embedding: [
        0.0017470914, 0.03642339, 0.0055507785,
        -0.008341389, 0.021458639, ...
        // ... 1536 values total
      ],
      metadata: { ... }
    },
    // ... more chunks
  ],
  totalTokens: 4567,
  model: "text-embedding-3-small"
}
```

### Cost Estimation
```typescript
totalCost = (totalTokens / 1_000_000) * pricePerMillionTokens
// Example: 4567 tokens * $0.02/M = $0.00009134
```

---

## Step 6: Storage & Indexing (Status: INDEXING → 80%)

### Service: `VectorStoreService`
**File**: `lib/services/vector-store.service.ts`

### Database Schema
```typescript
model TranscriptChunk {
  id           String          @id          // UUID
  transcriptId String                       // FK to TranscriptAsset

  sequenceIndex Int            @unique(composite)
  startTime     Decimal(10,3)               // HH:MM:SS format
  endTime       Decimal(10,3)               // HH:MM:SS format
  text          String         @db.Text
  tokenCount    Int

  embedding     Json                       // [1536 floats]
  metadata      Json                       // ChunkMetadata

  createdAt     DateTime

  @@unique([transcriptId, sequenceIndex])
  @@index([transcriptId])
}
```

### Storage Process

#### 6.1 Batch Upsert
```typescript
// Delete old chunks (if reprocessing)
await prisma.transcriptChunk.deleteMany({
  where: { transcriptId }
})

// Insert new chunks in transaction
await prisma.$transaction(
  chunks.map(chunk =>
    prisma.transcriptChunk.create({
      data: {
        transcriptId,
        sequenceIndex: chunk.sequenceIndex,
        startTime: new Decimal(chunk.startTime),
        endTime: new Decimal(chunk.endTime),
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding,  // Stored as JSON
        metadata: chunk.metadata
      }
    })
  )
)
```

#### 6.2 Embedding Storage Format
```sql
-- PostgreSQL JSONB column stores:
{
  [0.0017470914, 0.03642339, 0.0055507785, ...]
}

-- Can be cast to pgvector for similarity search:
SELECT id, embedding::vector <=> query_vector AS similarity
FROM transcript_chunks
ORDER BY embedding::vector <=> query_vector
LIMIT 5
```

#### 6.3 Index Creation
```sql
CREATE INDEX transcript_chunks_embedding_idx
  ON transcript_chunks
  USING ivfflat (embedding::vector vector_cosine_ops)
  WITH (lists = 100);
```

**Why IVFFlat Index?**
- Fast approximate nearest neighbor search
- Index builds 100 clusters (lists = 100)
- Trade-off: Speed vs. perfect recall
- Acceptable for RAG use case (needs top-K, not all matches)

#### 6.4 Metadata Storage
```typescript
interface ChunkMetadata {
  courseId: string
  courseName: string
  chapterId: string
  chapterTitle: string
  chapterIndex: number
  lessonId: string
  lessonTitle: string
  lessonIndex: number
  vttAssetId: string
  vttVersion: string              // SHA256 hash (first 16 chars)
  language: string
  createdAt: string               // ISO timestamp
}
```

**Purpose**: Enables filtering and metadata-enriched results

### Database Impact Summary
```sql
-- Records created:
INSERT INTO transcript_chunks VALUES (...)  -- N rows

-- Indexes updated:
-- transcript_chunks_embedding_idx (ivfflat)
-- transcript_chunks_transcriptId_idx
-- transcript_chunks_transcriptId_sequenceIndex_idx

-- Status updated:
UPDATE transcript_assets
SET status = 'READY', processedAt = NOW()
WHERE id = ?
```

---

## Step 7: Status Update & Completion (Status: READY → 100%)

### Final Database Update
```sql
UPDATE transcript_assets
SET
  status = 'READY',
  processedAt = NOW(),
  errorMessage = NULL
WHERE id = ?
```

### Response to Client
```json
{
  "success": true,
  "data": {
    "transcriptId": "uuid",
    "status": "READY",
    "message": "Transcript processing complete",
    "stats": {
      "totalChunks": 350,
      "totalTokens": 4567,
      "processingTimeSeconds": 145
    }
  }
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ VTT File (from S3)                                          │
│ Lines: ~500, Characters: ~50KB                              │
└────────────────┬────────────────────────────────────────────┘
                 │ Step 1-2: Validate & Parse
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Parsed Cues                                                 │
│ Count: ~450-500, Format: [startTime, endTime, text]        │
└────────────────┬────────────────────────────────────────────┘
                 │ Step 3: Chunk
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Chunks                                                      │
│ Count: ~350, Avg Tokens: 300, Time: 0-1200s                │
└────────────────┬────────────────────────────────────────────┘
                 │ Step 4: Embed
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Embedded Chunks                                             │
│ Count: 350, Each: [1536 floats], Total: ~2.2MB             │
└────────────────┬────────────────────────────────────────────┘
                 │ Step 5: Store
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ PostgreSQL transcript_chunks table                          │
│ Rows: 350, Indexed by: embedding::vector, transcriptId     │
└────────────────┬────────────────────────────────────────────┘
                 │ Ready for RAG Queries
                 ▼
```

---

## Error Handling & Recovery

### Common Errors & Recovery

#### 1. Invalid VTT Format
```
Error: "VTT validation failed: Invalid timestamp format"
Status: FAILED
Recovery:
- Re-upload corrected VTT file
- Delete failed transcript
- Reprocess
```

#### 2. OpenAI API Rate Limit (429)
```
Error: Rate limit exceeded
Status: EMBEDDING (retrying)
Recovery:
- Automatic retry with exponential backoff
- Up to 3 attempts
- Max 4 second wait
```

#### 3. Database Connection Error
```
Error: Connection timeout
Status: INDEXING
Recovery:
- Check database connectivity
- Retry processing from checkpoint
- Manual cleanup of orphaned records
```

#### 4. Large Transcript (>10,000 tokens)
```
Expected: ~50 min processing time
Status: EMBEDDING (slow)
Recovery:
- Process runs in background
- Poll status endpoint for updates
- No user action needed
```

### Status Transitions on Error
```
Any Status → FAILED
{
  status: 'FAILED',
  errorMessage: 'Specific error description',
  processedAt: null
}
```

---

## Performance Metrics

### Typical Benchmarks (350-chunk transcript)

| Stage | Duration | Notes |
|-------|----------|-------|
| Parse | 0.5s | Linear in VTT size |
| Chunk | 1s | Fixed complexity |
| Embed | 120s | OpenAI API: ~0.3s/chunk |
| Store | 5s | Batch DB insert |
| **Total** | **~125s** | ~2 minutes |

### Resource Usage
```
Network:
- S3 download: ~50KB
- OpenAI API: ~4.5K tokens
- Database: ~2.2MB storage

Computation:
- CPU: Minimal (mostly I/O wait)
- Memory: ~50-100MB
- Concurrent: 5 parallel batches
```

### Scalability Limits
```
Current Configuration:
- Max chunk size: 500 tokens
- Max concurrency: 5 batches
- Max batch size: 100 chunks
- Single transcript limit: ~50,000 tokens (133MB in DB)

Future Optimization:
- Increase batch concurrency to 10-20
- Use streaming embeddings API
- Implement incremental chunking
```

---

## Query Time: Using Embeddings

### Similarity Search
```typescript
// Generate query embedding
const queryEmbedding = await embeddingService.generateEmbedding(
  "What is machine learning?"
)

// Search in PostgreSQL with pgvector
const results = await vectorStore.searchLesson(
  lessonId,
  queryEmbedding,
  topK = 5,
  threshold = 0.65
)
```

### SQL Query Execution
```sql
SELECT
  id, transcriptId, text, startTime, endTime,
  1 - (embedding::vector <=> $1::vector) as similarity
FROM transcript_chunks
WHERE transcriptId = $2
  AND embedding IS NOT NULL
ORDER BY embedding::vector <=> $1::vector
LIMIT 5;

-- Execution: ~5-50ms (with IVFFlat index)
```

### Result Format
```typescript
[
  {
    chunkId: "uuid",
    text: "Machine learning is a subset of artificial intelligence...",
    similarity: 0.82,
    startTime: 4.5,
    endTime: 12.3,
    metadata: { courseId, lessonId, ... }
  },
  // ... up to 5 results
]
```

---

## Summary Checklist

- [x] VTT file uploaded and stored in S3
- [x] Validation performed (or skipped)
- [x] Cues parsed from VTT format
- [x] Semantic chunks created (150-500 tokens)
- [x] Embeddings generated via OpenAI API
- [x] Embeddings stored in PostgreSQL as JSON
- [x] IVFFlat index created for fast search
- [x] Status updated to READY
- [x] Metadata preserved for citation

**Result**: Transcript is now searchable via RAG queries with source citations.

---

## Related Files & Documentation

- **Main Processing Service**: `lib/services/transcript-processing.service.ts`
- **Chunking Logic**: `lib/services/chunking.service.ts`
- **Embedding Generation**: `lib/services/embedding.service.ts`
- **Vector Storage**: `lib/services/vector-store.service.ts`
- **Database Schema**: `prisma/schema.prisma` (TranscriptAsset, TranscriptChunk models)
- **API Routes**: `app/api/admin/lessons/[lessonId]/transcript/`
- **Migrations**: `prisma/migrations/20251212040154_add_rag_transcript_models/`
