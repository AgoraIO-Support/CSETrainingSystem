# VTT → Knowledge Context (XML) Pipeline

This document explains how a WebVTT (`.vtt`) transcript is converted into the **Knowledge Context** used by the AI “full-context injection” features (anchors, exam generation, etc.).

## What “Knowledge Context” Is

For each `Lesson`, the system can generate:

- A deterministic **XML knowledge base** (`context.xml`) stored in S3
- A set of **Knowledge Anchors** stored in Postgres for UI navigation (“Key Moments”)
- A `knowledge_contexts` DB record that tracks status, metadata, and the S3 key where the XML is stored

In Prisma, the relevant tables are:

- `transcript_assets` (uploaded VTT metadata + S3 key)
- `knowledge_contexts` (generated XML metadata + S3 key)
- `knowledge_anchors` (anchor rows derived from the XML generation step)

See schema: `prisma/schema.prisma` (`KnowledgeContext`, `KnowledgeAnchor`, `TranscriptAsset`).

## Storage Layout (S3)

### Transcript (VTT)

When Admin uploads a VTT, it is saved under the asset prefix:

`<AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/<transcriptId>.vtt`

The presigned upload is created by:

- API: `app/api/admin/lessons/[lessonId]/transcript/route.ts` (`POST`)

### Knowledge Context (XML)

The generated XML is stored alongside the transcript, under:

`<AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/context.xml`

This is done by:

- `lib/services/knowledge-context.service.ts` → `storeXMLToS3()`

## How Generation Is Triggered

There are multiple entry points that can trigger knowledge generation:

1. **Admin manual generation**
   - API: `app/api/admin/lessons/[lessonId]/knowledge/generate/route.ts`
   - Fetches the latest transcript from S3, then calls `KnowledgeContextService.generateAndStoreContext()`.

2. **Learner “anchors” API (on-demand fallback)**
   - API: `app/api/lessons/[lessonId]/anchors/route.ts`
   - If `knowledge_anchors` is empty and not currently processing, it fetches the transcript from S3 and generates context on-demand.

3. **Exam generation (ensures contexts exist)**
   - `lib/services/exam-generation.service.ts` checks each lesson’s context status and generates it from the latest transcript if missing.

> Note: There is also a separate "RAG embedding" pipeline (`TranscriptProcessingService`) used for chunking/embeddings, but **Knowledge Context (XML)** generation is handled by `KnowledgeContextService` + `VTTToXMLService`.

4. **Async Worker (recommended for production)**
   - API: `POST /api/admin/lessons/[lessonId]/knowledge/process`
   - Creates a `KnowledgeContextJob` in the database with state `QUEUED`
   - A background worker container (`transcript-worker.ts`) polls for and processes jobs
   - Returns immediately with `jobId` for status tracking

## Worker Architecture

For production deployments, knowledge context generation runs in a background **worker container** that processes jobs asynchronously. This prevents request timeouts and allows for retry logic.

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     transcript-worker.ts                         │
├─────────────────────────────────────────────────────────────────┤
│  Main Loop:                                                      │
│    1. Run stale job recovery (every 60s)                        │
│    2. Claim next knowledge_context_job (priority)               │
│    3. Claim next transcript_processing_job (secondary)          │
│    4. Sleep 2s if no jobs                                       │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────┐
│ knowledge_context_  │    │ transcript_processing_  │
│ jobs                │    │ jobs                    │
├─────────────────────┤    ├─────────────────────────┤
│ VTT → XML + Anchors │    │ VTT → Chunks + Vectors  │
│ (Full-context AI)   │    │ (RAG embeddings)        │
└─────────────────────┘    └─────────────────────────┘
```

### Job States

Jobs follow this state machine:

```
QUEUED ──────────────────────────────────────► RUNNING
   │                                               │
   │ (stale recovery if lease expires)             │
   │                                               ▼
   │                                      ┌───────────────┐
   │                                      │   Success?    │
   │                                      └───────────────┘
   │                                         │         │
   │                                        Yes        No
   │                                         │         │
   │                                         ▼         ▼
   │                                    SUCCEEDED  (retry?)
   │                                               │    │
   │                                              Yes   No
   │                                               │    │
   └──────────────────── RETRY_WAIT ◄──────────────┘    │
                                                        ▼
                                                     FAILED
```

States:
- `QUEUED` - Waiting to be claimed by worker
- `RUNNING` - Currently being processed
- `RETRY_WAIT` - Failed, scheduled for retry after backoff
- `SUCCEEDED` - Completed successfully
- `FAILED` - Failed after exhausting retries (or non-retryable error)
- `CANCELED` - Manually canceled via `force` flag

### Lease-Based Locking

The worker uses pessimistic locking to prevent duplicate processing:

1. Worker claims job with `FOR UPDATE SKIP LOCKED` SQL
2. Sets `leaseExpiresAt` = now + 5 minutes
3. Heartbeats every second to extend lease
4. If worker crashes, lease expires and job becomes claimable again

### Retry Logic

- **Max attempts**: 5 (configurable per job)
- **Exponential backoff**: 30s, 60s, 120s, 240s, 480s (capped at 10 minutes)
- **Non-retryable errors**: S3 `NOT_FOUND`, `ACCESS_DENIED` (file doesn't exist or permission issue)
- **Retryable errors**: Network timeouts, S3 throttling, OpenAI API errors

### Stale Job Recovery

The worker automatically recovers "stuck" jobs on startup and every 60 seconds:

1. Finds jobs with `state=RUNNING` AND `leaseExpiresAt < NOW()`
2. If retries remaining: sets `state=RETRY_WAIT` with backoff
3. If retries exhausted: sets `state=FAILED`

### Health Check Endpoint

When `TRANSCRIPT_WORKER_HEALTH_PORT` is set (e.g., `8081`), the worker exposes:

- `GET /health` - Returns 200 if healthy (polled recently), 503 if unhealthy
- `GET /status` - Returns full worker state (jobs processed, current job, uptime, etc.)

Example:
```bash
curl http://localhost:8081/health
# {"status":"healthy","workerId":"hostname:1234","uptime":3600000,"lastPollAgeMs":1500}

curl http://localhost:8081/status
# {"workerId":"...","startedAt":"...","currentJob":null,"stats":{"jobsProcessed":42,...}}
```

### Container Deployment

Build and run the worker:

```bash
# Build worker image
podman build --target worker -t cselearning-worker:latest -f Containerfile .

# Run worker
podman run -d --name cselearning-worker --network cselearning \
  --env-file tmp/podman/local.env \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=default \
  -e AWS_SDK_LOAD_CONFIG=1 \
  -e TRANSCRIPT_WORKER_HEALTH_PORT=8081 \
  -p 8081:8081 \
  localhost/cselearning-worker:latest
```

### Worker Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSCRIPT_WORKER_ID` | `hostname:pid` | Worker identifier for logs/leases |
| `TRANSCRIPT_WORKER_POLL_MS` | `2000` | Job polling interval |
| `TRANSCRIPT_WORKER_LEASE_MS` | `300000` | Job lease duration (5 min) |
| `TRANSCRIPT_WORKER_HEARTBEAT_THROTTLE_MS` | `1000` | Heartbeat frequency |
| `TRANSCRIPT_WORKER_RETRY_BASE_MS` | `30000` | Base exponential backoff (30s) |
| `TRANSCRIPT_WORKER_RETRY_MAX_MS` | `600000` | Max backoff cap (10 min) |
| `TRANSCRIPT_WORKER_STALE_RECOVERY_MS` | `60000` | Stale job recovery interval |
| `TRANSCRIPT_WORKER_HEALTH_PORT` | `0` (disabled) | Health check HTTP port |

## The Conversion Steps (VTT → XML)

The conversion happens inside:

- `lib/services/knowledge-context.service.ts` → `generateAndStoreContext()`
- `lib/services/vtt-to-xml.service.ts` → `processVTTToKnowledgeBase()`

### Step 1: Parse VTT cues

- `VTTParserService.parse(vttContent)` reads the `.vtt` and returns a list of cues (`startTime`, `endTime`, `text`).

Code: `lib/services/vtt-to-xml.service.ts`

### Step 2: Denoise and aggregate cues into paragraphs

Short cues are denoised (remove filler words / normalize whitespace) and concatenated into “paragraphs” by time/tokens:

- `minParagraphDuration` (default 45s)
- `maxParagraphDuration` (default 90s)
- `targetParagraphTokens` (default 500 tokens)

Result: `AggregatedParagraph[]` with `(startTime, endTime, text, tokenCount)`.

Code: `lib/services/vtt-to-xml.service.ts` → `denoiseAndAggregate()`

### Step 3: Enrich paragraphs (titles, key concepts)

If `OPENAI_API_KEY` is configured, paragraphs are enriched in batches:

- Generates a short section title
- Extracts key concepts

If no `OPENAI_API_KEY` exists, a deterministic fallback (“no-AI enrichment”) is used.

Code: `lib/services/vtt-to-xml.service.ts` → `enrichWithAI()` / `enrichWithoutAI()`

### Step 4: Extract Knowledge Anchors

From the enriched sections, the service selects up to `maxAnchorsPerLesson` (default 15) anchors:

- Each anchor has: timestamp (seconds), title, summary, key terms, anchor type, sequence index.

Code: `lib/services/vtt-to-xml.service.ts` → `extractAnchors()`

### Step 5: Generate deterministic XML

The final output XML is generated from the enriched sections:

- Deterministic structure (same input → same XML, excluding AI variability in enrichment)
- Hashed with SHA-256 (`contentHash`) for idempotency/invalidation logic.

Code: `lib/services/vtt-to-xml.service.ts` → `generateXML()` / `calculateHash()`

## Persisting Outputs (S3 + DB)

After XML generation, `KnowledgeContextService.generateAndStoreContext()` persists:

1. **S3**: writes `context.xml`
   - `storeXMLToS3(courseId, lessonId, xml)`

2. **DB**: replaces anchors for that lesson
   - `knowledge_anchors`: `deleteMany` then `createMany`
   - Timestamps are normalized to prevent DB overflow (seconds vs milliseconds)
   - See: `normalizeKnowledgeAnchorTimestampSeconds()` in `lib/services/knowledge-context.service.ts`

3. **DB**: upserts `knowledge_contexts` record
   - `s3Key`, `contentHash`, token/section/anchor counts, `status=READY`, `processedAt`

4. **In-memory cache**: warms a 30-min cache for faster reads
   - `memoryCache.set(lessonId, { xml, loadedAt })`

## How the XML Is Used Later

- **Learner UI (anchors / key moments)**: reads `knowledge_anchors` via `/api/lessons/[lessonId]/anchors`
- **AI chat / full-context injection**: reads XML via `KnowledgeContextService.getKnowledgeContext()`
  - Cache → S3 fallback
- **Exam generation**: bundles lesson contexts into an XML “knowledge bundle”

## Status / Failure Model

`knowledge_contexts.status`:

- `PENDING` → created but not started
- `PROCESSING` → in-flight generation
- `READY` → `context.xml` + anchors exist
- `FAILED` → generation failed; `errorMessage` set

On failure, the service:

- logs `KnowledgeContext` category errors
- sets status to `FAILED`

## Troubleshooting Checklist

### No anchors in UI
- Ensure the lesson has a `TranscriptAsset` with a valid `s3Key` pointing to a `.vtt`
- Call `POST /api/admin/lessons/:lessonId/knowledge/generate` and check response
- Check `knowledge_contexts.status` and `knowledge_anchors` rows for that `lessonId`

### Timestamp overflow errors in Postgres
- The code now normalizes large timestamps (ms→s) before writing anchors.
- See `normalizeKnowledgeAnchorTimestampSeconds()` in `lib/services/knowledge-context.service.ts`.

### Jobs stuck in RUNNING state
If the worker crashed mid-job, the job may be stuck. Options:

1. **Wait for stale recovery**: Worker recovers stale jobs every 60 seconds on startup and periodically
2. **Manual recovery**: Run SQL to reset the job:
   ```sql
   UPDATE knowledge_context_jobs
   SET state = 'RETRY_WAIT',
       scheduled_at = NOW(),
       lease_expires_at = NULL
   WHERE id = '<job-id>' AND state = 'RUNNING';
   ```
3. **Force new job**: Call API with `force=true`:
   ```bash
   curl -X POST /api/admin/lessons/:lessonId/knowledge/process \
     -d '{"force": true}'
   ```

### Jobs stuck in QUEUED state (not being claimed)
- Ensure the worker container is running: `podman logs cselearning-worker`
- Check worker health: `curl http://localhost:8081/health`
- Verify database connectivity in worker logs
- Check `scheduled_at` is in the past (jobs scheduled for future won't be claimed)

### AI enrichment not working (fallback used)
- Check `OPENAI_API_KEY` is set in worker environment
- Review job events for warnings about fallback:
  ```sql
  SELECT * FROM knowledge_context_job_events
  WHERE job_id = '<job-id>'
  ORDER BY created_at;
  ```
- Look for `usedFallbackEnrichment: true` in job metadata

### Checking job status via API

```bash
# Get knowledge context status (includes latest job)
GET /api/admin/lessons/:lessonId/knowledge

# Get job event log
GET /api/admin/lessons/:lessonId/knowledge/events
```

### Checking job status via database

```sql
-- Latest job for a lesson
SELECT id, state, stage, progress, current_step, error_message, attempt,
       created_at, started_at, finished_at
FROM knowledge_context_jobs
WHERE lesson_id = '<lesson-id>'
ORDER BY created_at DESC
LIMIT 1;

-- Job events
SELECT level, stage, message, created_at
FROM knowledge_context_job_events
WHERE job_id = '<job-id>'
ORDER BY created_at;
```

