# Agora CSE Training System - Architecture Document

## 1. System Architecture Overview

### 1.1 Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                       Tech Stack                             │
├─────────────────────────────────────────────────────────────┤
│ Frontend:   Next.js 15 + TypeScript + TailwindCSS           │
│ Backend:    Next.js API Routes (unified)                    │
│ Database:   PostgreSQL + pgvector (vector search)           │
│ ORM:        Prisma                                          │
│ Auth:       Custom JWT Authentication                       │
│ Storage:    AWS S3 + CloudFront (CDN)                       │
│ AI:         OpenAI GPT-5.2                                  │
│ Deploy:     Podman Containers                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 System Layer Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Layer                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React Components (Next.js App Router)                     │  │
│  │  - Pages (Dashboard, Courses, Video Player, Admin, Exams)  │  │
│  │  - UI Components (shadcn/ui + Radix)                       │  │
│  │  - State Management (React Hooks)                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                      API Layer (Unified Next.js)                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Next.js API Routes (:3000) - /app/api/*                   │  │
│  │  - Auth, Courses, Progress, AI Chat                        │  │
│  │  - Admin, Exams, Certificates                              │  │
│  │  - File Upload/Processing, S3 Signed URLs                  │  │
│  │  - CloudFront Cookies, Cascade Deletes                     │  │
│  │  - Request Validation (Zod)                                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Services (lib/services/*)                                 │  │
│  │  ┌──────────────┬──────────────┬──────────────────────┐    │  │
│  │  │ AuthService  │CourseService │ ExamService          │    │  │
│  │  ├──────────────┼──────────────┼──────────────────────┤    │  │
│  │  │ AIService    │ ProgressSvc  │ CertificateService   │    │  │
│  │  ├──────────────┼──────────────┼──────────────────────┤    │  │
│  │  │ FileService  │ VTT/XML Svc  │ KnowledgeContextSvc  │    │  │
│  │  ├──────────────┼──────────────┼──────────────────────┤    │  │
│  │  │CascadeDelete │MaterialSvc   │ CloudFrontCookieSvc  │    │  │
│  │  └──────────────┴──────────────┴──────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Background Workers (scripts/)                             │  │
│  │  - transcript-worker.ts (VTT processing, AI enrichment)    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    Data Access Layer                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Prisma Client (lib/prisma.ts)                             │  │
│  │  - Single schema with unified client                       │  │
│  │  - Transaction Management                                   │  │
│  │  - Query Optimization                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                         │
│ ┌───────────────┐  ┌───────────────┐  ┌────────────────┐         │
│ │  PostgreSQL   │  │   AWS S3 +    │  │  AI Services   │         │
│ │  + pgvector   │  │  CloudFront   │  │  - OpenAI      │         │
│ │               │  │  (Videos/VTT) │  │  - Anthropic   │         │
│ └───────────────┘  └───────────────┘  └────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Core Component Relationship

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐        │
│  │  Dashboard   │  │   Courses    │  │  Video Player   │        │
│  │    Pages     │  │    Pages     │  │   + AI Chat     │        │
│  ├──────────────┤  ├──────────────┤  ├─────────────────┤        │
│  │    Exams     │  │ Certificates │  │     Admin       │        │
│  │    Pages     │  │    Pages     │  │     Pages       │        │
│  └──────────────┘  └──────────────┘  └─────────────────┘        │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │ API Calls
                            ▼
              ┌────────────────────────────┐
              │  Next.js API Routes (:3000)│
              │  ┌──────────────────────┐  │
              │  │ /api/auth/*         │  │
              │  │ /api/courses/*      │  │
              │  │ /api/exams/*        │  │
              │  │ /api/ai/*           │  │
              │  │ /api/admin/*        │  │
              │  │ /api/certs/*        │  │
              │  │ /api/materials/*    │  │
              │  │ /api/profile/*      │  │
              │  └──────────────────────┘  │
              └─────────────┬──────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Prisma Client   │
                   │  (ORM Layer)    │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │   PostgreSQL    │
                   │   + pgvector    │
                   └─────────────────┘
```

## 2. Data Flow Architecture

### 2.1 Authentication Flow

```
┌──────────┐                ┌──────────┐              ┌───────────┐
│  Client  │                │   API    │              │ PostgreSQL│
│ (Browser)│                │  Routes  │              │           │
└────┬─────┘                └────┬─────┘              └─────┬─────┘
     │                           │                          │
     │  POST /api/auth/login     │                          │
     ├──────────────────────────>│                          │
     │  { email, password }      │                          │
     │                           │  Query user, verify pwd  │
     │                           ├─────────────────────────>│
     │                           │                          │
     │                           │  { user record }         │
     │                           │<─────────────────────────┤
     │                           │                          │
     │                           │  Sign JWT (HS256)        │
     │                           │                          │
     │  { accessToken }          │                          │
     │  Set-Cookie: token=...    │                          │
     │<──────────────────────────┤                          │
     │                           │                          │
     │  Subsequent API calls     │                          │
     │  Cookie: token=...        │                          │
     ├──────────────────────────>│                          │
     │                           │  Verify JWT locally      │
     │                           │                          │
     │  Response                 │                          │
     │<──────────────────────────┤                          │
```

### 2.2 Video Learning Flow

```
┌──────┐     ┌─────────┐     ┌──────────┐     ┌───────┐
│Client│     │Next API │     │PostgreSQL│     │AWS S3 │
└───┬──┘     └────┬────┘     └────┬─────┘     └───┬───┘
    │             │               │                │
    │ GET /api/courses/:slug      │                │
    ├────────────>│               │                │
    │             │ Check enrollment              │
    │             ├──────────────>│                │
    │             │ { enrolled, lesson data }     │
    │             │<──────────────┤                │
    │             │               │                │
    │ GET /api/materials/:id/cf-cookie            │
    ├────────────>│               │                │
    │             │ Check enrollment              │
    │             ├──────────────>│                │
    │             │ Sign CloudFront cookie         │
    │             ├───────────────────────────────>│
    │ Set-Cookie: CloudFront-*    │                │
    │<────────────┤               │                │
    │                                              │
    │ Stream video via CloudFront (with signed cookie)
    ├─────────────────────────────────────────────>│
```

### 2.3 AI Assistant Interaction Flow

```
┌──────┐      ┌─────────┐     ┌──────────┐     ┌────────┐
│Client│      │Next API │     │PostgreSQL│     │ OpenAI │
└───┬──┘      └────┬────┘     └────┬─────┘     └───┬────┘
    │              │               │               │
    │ POST /api/ai/chat            │               │
    │ { message, lessonId }        │               │
    ├─────────────>│               │               │
    │              │ Get knowledge context         │
    │              ├──────────────>│               │
    │              │ { transcript XML, metadata }  │
    │              │<──────────────┤               │
    │              │                               │
    │              │ Build prompt + context        │
    │              ├──────────────────────────────>│
    │              │ { completion, stream }        │
    │              │<──────────────────────────────┤
    │              │                               │
    │ { response } │                               │
    │<─────────────┤                               │
```

## 3. Security Architecture

### 3.1 Authentication & Authorization

```
┌────────────────────────────────────────────────────────┐
│                 Authentication Flow                     │
├────────────────────────────────────────────────────────┤
│  1. User Login → Verify credentials against DB         │
│  2. Generate JWT (Access Token) signed with secret     │
│  3. Store token in httpOnly cookie                     │
│  4. Each API call validates JWT locally                │
│  5. Role-based access control (RBAC)                   │
│     - USER: courses, progress, exams, certificates     │
│     - ADMIN: + course mgmt, user mgmt, AI config       │
└────────────────────────────────────────────────────────┘
```

### 3.2 Data Protection

- **Passwords**: bcrypt hashing with salt
- **JWT**: HS256 signed, configurable expiration
- **Input Validation**: All inputs validated with Zod schemas
- **S3 Access**: CloudFront signed cookies (configurable duration)
- **CORS**: Strict cross-origin policies
- **SQL Injection**: Prisma ORM parameterized queries

## 4. Services Overview

### 4.1 Application Services (lib/services/)

| Service | Description |
|---------|-------------|
| `auth.service.ts` | User authentication and session management |
| `course.service.ts` | Course CRUD and enrollment |
| `course-structure.service.ts` | Chapters and lessons management |
| `exam.service.ts` | Exam creation and management |
| `exam-attempt.service.ts` | Exam taking and submission |
| `exam-grading.service.ts` | AI-powered essay grading |
| `exam-generation.service.ts` | AI-powered exam generation |
| `certificate.service.ts` | Certificate generation and verification |
| `progress.service.ts` | Learning progress tracking |
| `ai.service.ts` | AI chat and completions |
| `vtt-to-xml.service.ts` | VTT transcript to knowledge XML |
| `knowledge-context.service.ts` | Knowledge context management |
| `file.service.ts` | S3 file operations and signed URLs |
| `cascade-delete.service.ts` | Cascading delete with S3 cleanup |
| `material.service.ts` | Course materials CRUD operations |
| `cloudfront-cookie.service.ts` | CloudFront signed cookie generation |

## 5. API Routes

### 5.1 Next.js API Routes (/app/api/)

| Route | Description |
|-------|-------------|
| `/api/auth/*` | Login, logout, register, session |
| `/api/courses/*` | Course listing, details, enrollment |
| `/api/admin/*` | Admin dashboard, course/user management, AI config |
| `/api/admin/materials/*` | Material CRUD operations |
| `/api/admin/courses/:id` | Course management with cascade delete |
| `/api/admin/courses/:id/chapters/:id` | Chapter management with cascade delete |
| `/api/admin/courses/:id/chapters/:id/lessons/:id` | Lesson management with cascade delete |
| `/api/exams/*` | Exam listing, taking, submission |
| `/api/progress/*` | Progress tracking, completion |
| `/api/certificates/*` | Certificate generation, verification |
| `/api/profile/*` | User profile management |
| `/api/ai/*` | AI chat endpoint |
| `/api/lessons/*` | Lesson-specific operations |
| `/api/materials/:courseId/cf-cookie` | CloudFront signed cookie generation |
| `/api/curricula/*` | Curriculum management |

## 6. Deployment Architecture

### 6.1 Container Architecture (Podman)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Podman Network: cselearning                   │
│                                                                  │
│  ┌─────────────────────┐               ┌─────────────────────┐  │
│  │  cselearning-web    │               │  cselearning-       │  │
│  │  (:3000)            │               │  postgres           │  │
│  │                     │               │                     │  │
│  │  Next.js Standalone │               │  PostgreSQL 16      │  │
│  │  (API + Frontend)   │               │  + pgvector         │  │
│  └──────────┬──────────┘               └──────────┬──────────┘  │
│             │                                     │              │
│             └─────────────────┬───────────────────┘              │
│                               │                                  │
│  ┌─────────────────────┐  ┌───┴───────────────┐                 │
│  │  cselearning-worker │  │  cselearning-     │                 │
│  │                     │  │  migrator         │                 │
│  │  Transcript         │  │                   │                 │
│  │  Processing         │  │  Prisma           │                 │
│  │                     │  │  Migrations       │                 │
│  └─────────────────────┘  └───────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌────────────────────┐
              │  External Services │
              │  - AWS S3          │
              │  - CloudFront      │
              │  - OpenAI API      │
              └────────────────────┘
```

### 6.2 Container Images

| Image | Source | Description |
|-------|--------|-------------|
| `cselearning-web` | `Containerfile` (default target) | Next.js standalone (API + frontend) |
| `cselearning-worker` | `Containerfile` (target: worker) | Background transcript processor |
| `cselearning-migrator` | `Containerfile` (target: migrator) | Prisma migrations |
| `cselearning-postgres` | `pgvector/pgvector:pg16` | PostgreSQL + vector |

### 6.3 Deployment Commands

```bash
# Build images
podman build -t cselearning-web:latest -f Containerfile .
podman build --target worker -t cselearning-worker:latest -f Containerfile .
podman build --target migrator -t cselearning-migrator:latest -f Containerfile .

# Create network
podman network create cselearning

# Start services (in order)
# 1. PostgreSQL
# 2. Migrator (run migrations)
# 3. Web (Next.js with unified API)
# 4. Worker (optional - for transcript processing)
```

## 7. Database Schema Overview

Key entities managed by Prisma:

- **User**: Authentication, roles (USER/ADMIN)
- **Course**: Title, slug, description, chapters, lessons
- **Chapter**: Course sections with ordering
- **Lesson**: Video content, transcripts, knowledge context
- **Enrollment**: User-course relationship
- **Progress**: Lesson completion tracking
- **Exam**: Exam definitions with questions
- **ExamAttempt**: User exam submissions and grades
- **Certificate**: Completion certificates with verification
- **AIPromptTemplate**: Configurable AI prompts per use case
- **KnowledgeContext**: Processed transcript XML for AI
- **CourseAsset**: Course materials (documents, videos, etc.)
- **LessonAsset**: Lesson-material bindings

## 8. Environment Variables

Key configuration:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_S3_BUCKET_NAME` | S3 bucket name |
| `AWS_S3_ASSET_PREFIX` | S3 key prefix for assets |
| `CLOUDFRONT_DOMAIN` | CloudFront distribution domain |
| `CLOUDFRONT_KEY_PAIR_ID` | CloudFront key pair for signing |
| `CLOUDFRONT_PRIVATE_KEY` | CloudFront private key |
| `CLOUDFRONT_SIGNED_COOKIE_TTL_HOURS` | Cookie expiration (default: 12) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | OpenAI model (default: gpt-4o) |
