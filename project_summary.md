# CSE Training System - Project Summary

## 1. Project Overview

### Purpose
The CSE Training System is a comprehensive web-based Learning Management System (LMS) designed for the Agora CSE (Customer Success Engineering) team. It provides a complete learning platform with course management, video streaming, AI-powered learning assistance, progress tracking, and analytics.

### Tech Stack

**Frontend:**
- Next.js 15 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Radix UI components
- Video.js with HLS.js for video playback

**Backend:**
- Next.js API Routes (primary API layer)
- Fastify server (supplementary services for S3/CloudFront)
- Prisma ORM
- PostgreSQL database

**Infrastructure & Cloud Services:**
- AWS S3 (asset storage)
- AWS CloudFront (CDN for content delivery)
- Supabase Auth (optional authentication)
- OpenAI API (AI learning assistant)

**Key Libraries:**
- `@prisma/client` - Database ORM
- `@aws-sdk/client-s3` - S3 integration
- `jsonwebtoken` / `bcryptjs` - Authentication
- `zod` - Schema validation
- `video.js` - Video player
- `recharts` - Analytics charts

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                           │
│                    (Next.js React Frontend)                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTP/HTTPS
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                    NEXT.JS APPLICATION                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  App Router Pages (SSR/CSR)                              │   │
│  │  - /courses, /learn, /admin, /profile                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Routes (/api/*)                                     │   │
│  │  - Auth, Courses, Progress, Admin, AI                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Service Layer (lib/services)                            │   │
│  │  - CourseService, AIService, ProgressService, etc.       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────┬──────────────────────────────────┬───────────────┘
              │                                   │
              │                                   │ Presigned URLs
              │                                   │ Signed Cookies
              │                                   │
┌─────────────▼──────────────┐    ┌──────────────▼──────────────┐
│  POSTGRESQL DATABASE        │    │   FASTIFY BACKEND SERVER    │
│  (Prisma ORM)              │    │   (Port 8080)               │
│  - Users, Courses          │    │   - S3 Presigned URLs       │
│  - Lessons, Progress       │    │   - CloudFront Signing      │
│  - AI Conversations        │    │   - Material Delivery       │
│  - Analytics               │    └──────────┬──────────────────┘
└────────────────────────────┘               │
                                             │
              ┌──────────────────────────────┴──────────────┐
              │                                             │
┌─────────────▼─────────────┐              ┌───────────────▼─────────┐
│    AWS S3 BUCKET          │              │   AWS CLOUDFRONT CDN    │
│  - Video files            │              │  - Signed URLs          │
│  - Course assets          │              │  - Content delivery     │
│  - Documents, PDFs        │              └─────────────────────────┘
└───────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                              │
│  - OpenAI API (AI Assistant)                                     │
│  - Supabase Auth (Optional)                                      │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Directory Structure Understanding

### Root Level Structure

```
/CSETrainingSystem
├── app/                    # Next.js App Router (pages & API routes)
├── backend/                # Fastify supplementary backend server
├── components/             # React UI components
├── lib/                    # Shared utilities and service layer
├── prisma/                 # Database schema and migrations
├── types/                  # TypeScript type definitions
├── Docs/                   # Project documentation
├── public/                 # Static assets
├── scripts/                # Utility scripts (S3 GC, etc.)
├── infrastructure/         # IaC (Terraform, CDK)
└── tmp/                    # Temporary files
```

### Module Responsibilities

#### `/app` - Next.js Application (Frontend + API)

**Pages (User-facing):**
- `/` - Landing page
- `/login` - Authentication
- `/courses` - Course catalog
- `/courses/[id]` - Course details
- `/learn/[courseId]/[lessonId]` - Learning interface (video player, assets)
- `/profile` - User profile management
- `/progress` - Learning progress dashboard
- `/curriculum/[courseId]` - Course curriculum view

**Admin Pages:**
- `/admin` - Admin dashboard
- `/admin/courses` - Course management
- `/admin/courses/[id]/edit` - Course editor
- `/admin/users` - User management
- `/admin/analytics` - Analytics dashboard
- `/admin/ai-config` - AI configuration
- `/admin/curricula` - Curriculum management

**API Routes:**
- `/api/auth/*` - Authentication (login, register, me)
- `/api/courses/*` - Course CRUD and enrollment
- `/api/progress/*` - Progress tracking
- `/api/ai/*` - AI conversation endpoints
- `/api/admin/*` - Admin operations (courses, chapters, lessons, assets, users)

#### `/backend` - Fastify Server (Port 8080)

Supplementary backend for operations requiring server-side processing:

**Routes:**
- `/api/admin/uploads` - S3 presigned URL generation
- `/api/admin/materials` - Material management
- `/api/admin/courses` - Course operations
- `/api/admin/chapters` - Chapter management
- `/api/admin/lessons` - Lesson management
- `/api/admin/lesson-assets` - Asset management
- `/api/materials/cloudfront` - CloudFront signed cookies

**Services:**
- `MaterialService` - Material delivery and access control
- `EnrollmentService` - Enrollment operations
- `CascadeService` - Cascading delete operations

#### `/components` - React Components

**Admin Components:**
- Course creation/editing forms
- Chapter and lesson builders
- User management tables
- Analytics dashboards

**Learning Components:**
- `course-content-panel.tsx` - Sidebar navigation
- `asset-viewer.tsx` - Multi-format asset viewer
- `document-viewer.tsx`, `pdf-viewer.tsx`, `text-viewer.tsx`

**Video Components:**
- `videojs-player.tsx` - Video.js integration with HLS
- `transcript-panel.tsx` - Video transcript display

**AI Components:**
- `ai-chat-panel.tsx` - AI assistant interface

**Course Components:**
- `course-card.tsx` - Course display card
- `course-outline.tsx` - Course structure navigation

**UI Components:**
- Radix UI-based components (buttons, dialogs, forms, etc.)

#### `/lib` - Shared Libraries and Services

**Services (Business Logic):**
- `course.service.ts` - Course CRUD, enrollment, filtering
- `ai.service.ts` - OpenAI integration, conversation management
- `progress.service.ts` - Progress tracking and calculation
- `auth.service.ts` - User authentication
- `user.service.ts` - User management
- `analytics.service.ts` - Analytics and reporting
- `file.service.ts` - File upload/download
- `lesson-asset.service.ts` - Asset management
- `course-structure.service.ts` - Course hierarchy operations

**Utilities:**
- `auth-middleware.ts` - JWT/Supabase authentication middleware
- `aws-s3.ts` - S3 client configuration
- `api-client.ts` - API client utilities
- `validations.ts` - Zod schemas for validation
- `prisma.ts` - Prisma client instance

#### `/prisma` - Database Layer

- `schema.prisma` - Complete database schema (21 models)
- `/migrations` - Database migration history
- `seed.ts` - Database seeding script

### Cross-Module Dependencies

```
Frontend Pages
    ↓ (imports)
Components
    ↓ (imports)
Services (lib/services)
    ↓ (uses)
Prisma Client
    ↓ (queries)
PostgreSQL Database

API Routes
    ↓ (calls)
Services
    ↓ (uses)
Prisma / External APIs (S3, OpenAI)

Backend Server
    ↓ (generates)
S3 Presigned URLs / CloudFront Cookies
```

## 3. Data Models / Types

### Core Entity Relationships

```
User
 ├─── Enrollment ──→ Course
 ├─── LessonProgress ──→ Lesson
 ├─── QuizAttempt ──→ Quiz
 ├─── UserAchievement ──→ Achievement
 ├─── AIConversation ──→ AIMessage
 └─── Discussion

Course
 ├─── Chapter ──→ Lesson ──→ LessonAsset ──→ CourseAsset
 ├─── CourseAsset
 ├─── Enrollment
 ├─── Quiz ──→ Question
 ├─── Discussion
 ├─── CourseReview
 └─── CourseAIConfig

Lesson
 ├─── LessonProgress (per user)
 ├─── LessonAsset (links to CourseAsset)
 └─── LessonAIConfig
```

### Key Models

#### User Management
- **User**: User accounts with roles (USER/ADMIN), status (ACTIVE/SUSPENDED/DELETED)
  - Supports both local auth (password) and Supabase auth (supabaseId)
  - Profile fields: bio, title, department
  - Relations: enrollments, progress, quizAttempts, achievements, conversations

#### Course Hierarchy
- **Course**: Top-level learning container
  - Fields: title, slug, description, thumbnail, level, status, category, tags
  - Status flow: DRAFT → PUBLISHED → ARCHIVED
  - Metadata: learningOutcomes, requirements, duration, rating
  - Instructor relationship (User)

- **Chapter**: Course sections
  - Ordered containers for lessons
  - Fields: title, description, order

- **Lesson**: Individual learning units
  - Types: VIDEO, DOC, QUIZ, OTHER
  - Completion rules: VIEW_ASSETS, MANUAL, QUIZ
  - Fields: title, description, duration, learningObjectives
  - Legacy fields: videoUrl, subtitleUrl, transcript
  - Modern approach: uses LessonAsset → CourseAsset

- **CourseAsset**: Reusable learning materials
  - Types: VIDEO, DOCUMENT, PRESENTATION, TEXT, AUDIO, OTHER
  - Fields: title, description, url, cloudfrontUrl, s3Key, mimeType
  - Can be attached to multiple lessons via LessonAsset junction table

- **LessonAsset**: Junction table linking lessons to assets
  - Allows many-to-many relationship
  - One lesson can have multiple assets
  - One asset can be used in multiple lessons

#### Progress & Enrollment
- **Enrollment**: User-course enrollment
  - Status: ACTIVE, COMPLETED, DROPPED
  - Tracks overall progress percentage (0-100)
  - Timestamps: enrolledAt, completedAt, lastAccessedAt

- **LessonProgress**: Per-lesson completion tracking
  - Fields: completed, watchedDuration, lastTimestamp
  - One record per user per lesson

#### Assessment
- **Quiz**: Course assessments
  - Fields: title, passingScore, timeLimit, randomizeQ
  - Contains multiple Questions

- **Question**: Quiz questions
  - Types: MULTIPLE_CHOICE, TRUE_FALSE, FILL_IN_BLANK, ESSAY
  - Fields: question, options (JSON), correctAnswer, explanation, points

- **QuizAttempt**: User quiz submissions
  - Fields: answers (JSON), score, passed
  - Timestamps: startedAt, completedAt

#### AI Assistant
- **AIConversation**: Chat sessions
  - Context: userId, courseId, lessonId
  - Contains multiple AIMessages

- **AIMessage**: Individual messages
  - Role: "user" or "assistant"
  - Fields: content, videoTimestamp, context (JSON), tokens, model

- **CourseAIConfig**: Course-level AI configuration
  - Fields: systemPrompt, modelOverride, temperature, maxTokens
  - Applies to all lessons in course (can be overridden per lesson)

- **LessonAIConfig**: Lesson-level AI configuration
  - Overrides course-level config
  - Additional fields: includeTranscript, includeAssetSummaries, customContext

- **AIPromptTemplate**: Reusable prompt templates
  - Fields: name, template, variables

#### Gamification
- **Achievement**: Badges and milestones
  - Fields: title, description, icon, criteria (JSON)

- **UserAchievement**: User-earned achievements
  - Links User to Achievement with earnedAt timestamp

- **Certificate**: Course completion certificates
  - Fields: certificateNumber, issueDate, pdfUrl

#### Analytics
- **SystemAnalytics**: Daily metrics
  - Fields: date, activeUsers, newEnrollments, completedCourses, totalViews, aiInteractions

- **LearningReport**: User learning reports
  - Fields: completedLessons, totalLessons, averageQuizScore, totalLearningTime
  - AI-generated: knowledgePoints, recommendations, aiSummary
  - Export: pdfUrl, htmlUrl

#### Social Features
- **Discussion**: Course discussions
  - Threaded conversations (parent/replies)
  - Fields: title, content, likes, isPinned

- **CourseReview**: Course ratings
  - Fields: rating (1-5), comment

- **Notification**: System notifications
  - Types: COURSE_UPDATE, QUIZ_REMINDER, ACHIEVEMENT, ANNOUNCEMENT, SYSTEM
  - Can be broadcast (userId = null) or targeted

### TypeScript Type Definitions (`types/index.ts`)

Key interfaces that extend Prisma models with additional client-side fields:
- `Course` - Includes instructor object, chapters with lessons
- `Chapter` - Contains ordered lessons array
- `Lesson` - Includes assets array, completion status
- `CourseAsset` - Asset with URL resolution
- `User`, `AdminUser`, `UserProfile` - User representations
- `LessonProgress` - Client-side progress tracking
- `AIMessage` - Chat message format
- Progress summaries: `CourseProgressSummary`, `UserProgressOverview`

### Data Flow Examples

#### Course Enrollment Flow
```
1. User clicks "Enroll" on course page
2. POST /api/courses/[id]/enroll
3. CourseService.enrollUser()
   - Validates course is PUBLISHED
   - Creates Enrollment record
   - Increments course.enrolledCount
4. Returns enrollment object
```

#### Lesson Progress Update Flow
```
1. User watches video, player updates currentTime
2. Every 15 seconds, syncProgress() called
3. POST /api/progress/lessons/[lessonId]
4. ProgressService.updateLessonProgress()
   - Updates watchedDuration, lastTimestamp
   - Marks completed if criteria met
   - Recalculates course progress percentage
5. Updates enrollment.progress
```

#### AI Conversation Flow
```
1. User types message in AI chat
2. POST /api/ai/conversations/[conversationId]/messages
3. AIService.sendMessage()
   - Fetches conversation history (last 10 messages)
   - Retrieves lesson context (title, transcript, objectives)
   - Applies AI config (course-level or lesson-level override)
   - Calls OpenAI API with configured model/settings
   - Saves user message and assistant response
4. Returns message pair with suggestions
```

## 4. API & Service Layer

### Authentication Flow

The system supports dual authentication:
1. **Local JWT Auth**: Email/password with bcrypt hashing
2. **Supabase Auth**: OAuth and Supabase-managed authentication

**Middleware** (`lib/auth-middleware.ts`):
- `withAuth()` - Requires valid authentication
- `withAdminAuth()` - Requires ADMIN role
- `withAuthOptional()` - Authentication optional

Token verification order:
1. Try Supabase token verification
2. Fall back to local JWT verification
3. Verify user exists in database and status is ACTIVE

### API Route Inventory

#### Public Routes (No Auth Required)

**Authentication:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Login (returns JWT token)
- `GET /api/auth/me` - Get current user (requires auth)

**Course Browsing:**
- `GET /api/courses` - List published courses (paginated)
  - Query params: page, limit, category, level, search
  - Returns only PUBLISHED courses
- `GET /api/courses/[id]` - Get course details
  - Returns full course with chapters, lessons, assets
  - Shows enrollment status if authenticated
- `GET /api/courses/[id]/content` - Get course structure

**Curriculum:**
- `GET /api/curricula` - List curricula
- `GET /api/curricula/[slug]` - Get curriculum by slug

#### Authenticated User Routes

**Enrollment:**
- `POST /api/courses/[id]/enroll` - Enroll in course

**Progress Tracking:**
- `GET /api/progress/overview` - User's overall progress dashboard
- `GET /api/progress/courses/[courseId]` - Course-specific progress
- `POST /api/progress/lessons/[lessonId]` - Update lesson progress

**Profile:**
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile

**AI Assistant:**
- `POST /api/ai/conversations` - Create/get conversation
- `GET /api/ai/conversations/[conversationId]/messages` - Get message history
- `POST /api/ai/conversations/[conversationId]/messages` - Send message

#### Admin Routes (Requires ADMIN Role)

**Course Management:**
- `GET /api/admin/courses` - List all courses (all statuses)
- `POST /api/admin/courses` - Create course
- `GET /api/admin/courses/[id]` - Get course details
- `PUT /api/admin/courses/[id]` - Update course
- `DELETE /api/admin/courses/[id]` - Delete course

**Chapter Management:**
- `GET /api/admin/courses/[id]/chapters` - List chapters
- `POST /api/admin/courses/[id]/chapters` - Create chapter
- `PUT /api/admin/chapters/[chapterId]` - Update chapter
- `DELETE /api/admin/chapters/[chapterId]` - Delete chapter
- `POST /api/admin/courses/[id]/chapters/reorder` - Reorder chapters

**Lesson Management:**
- `GET /api/admin/chapters/[chapterId]/lessons` - List lessons
- `POST /api/admin/chapters/[chapterId]/lessons` - Create lesson
- `PUT /api/admin/lessons/[lessonId]` - Update lesson
- `DELETE /api/admin/lessons/[lessonId]` - Delete lesson
- `POST /api/admin/chapters/[chapterId]/lessons/reorder` - Reorder lessons

**Asset Management:**
- `GET /api/admin/courses/[id]/assets` - List course assets
- `POST /api/admin/lessons/[lessonId]/assets` - Attach asset to lesson
- `POST /api/admin/lessons/[lessonId]/assets/upload` - Upload new asset
- `DELETE /api/admin/lessons/[lessonId]/assets/[assetId]` - Detach asset
- `DELETE /api/admin/courses/assets/[assetId]` - Delete course asset

**AI Configuration:**
- `GET /api/admin/courses/[id]/ai-config` - Get course AI config
- `PUT /api/admin/courses/[id]/ai-config` - Update course AI config
- `GET /api/admin/lessons/[lessonId]/ai-config` - Get lesson AI config
- `PUT /api/admin/lessons/[lessonId]/ai-config` - Update lesson AI config

**User Management:**
- `GET /api/admin/users` - List users
- `GET /api/admin/users/[id]` - Get user details
- `PUT /api/admin/users/[id]` - Update user
- `DELETE /api/admin/users/[id]` - Delete user

**Analytics:**
- `GET /api/admin/analytics` - System analytics

**Curriculum Management:**
- `GET /api/admin/curricula` - List curricula
- `POST /api/admin/curricula` - Create curriculum
- `PUT /api/admin/curricula/[id]` - Update curriculum
- `DELETE /api/admin/curricula/[id]` - Delete curriculum
- `POST /api/admin/curricula/[id]/publish` - Publish curriculum

### Fastify Backend Routes (Port 8080)

**S3 Operations:**
- `POST /api/admin/uploads/presign` - Generate S3 presigned upload URL
  - Returns temporary signed URL for client-side upload
  - Validates file type and size constraints

**Material Delivery:**
- `GET /api/materials/cloudfront/sign` - Get CloudFront signed cookies
  - Returns signed cookies for authenticated asset access
  - Validates user enrollment before signing

**Admin Operations:**
- Course, chapter, lesson, and asset management endpoints
- Mirrors Next.js admin routes but with server-side processing

### Service Layer Architecture

Services encapsulate business logic and database operations:

#### CourseService (`lib/services/course.service.ts`)

**Key Methods:**
- `getCourses(params)` - Paginated course listing with filters
- `getCourseById(idOrSlug, userId?)` - Get course with nested structure
- `createCourse(data)` - Create new course (auto-resolves slug conflicts)
- `updateCourse(id, data)` - Update course
- `deleteCourse(id)` - Delete course (cascade)
- `enrollUser(userId, courseId)` - Enroll user in course

**Business Logic:**
- Slug uniqueness with auto-increment (slug, slug-2, slug-3...)
- Enrollment validation (must be PUBLISHED)
- Progress calculation based on lesson completion
- Default filtering (public API shows only PUBLISHED)

#### AIService (`lib/services/ai.service.ts`)

**Key Methods:**
- `createConversation(params)` - Create/reuse conversation
- `sendMessage(params)` - Send message and get AI response
- `getMessages(conversationId)` - Get conversation history
- `getEffectiveAIConfig(lessonId, courseId)` - Resolve AI config
- `getCourseAIConfig(courseId)` - Admin: get course config
- `getLessonAIConfig(lessonId)` - Admin: get lesson config

**AI Configuration Resolution (Priority Order):**
1. Lesson-level config (if exists and enabled)
2. Course-level config (if exists and enabled)
3. Default hardcoded config

**Context Building:**
- Includes: course title, chapter title, lesson title
- Optional: lesson description, learning objectives
- Optional: transcript (up to 2000 chars, if includeTranscript=true)
- Optional: customContext (lesson-specific additional context)
- User message history (last 10 messages)

**OpenAI Integration:**
- Default model: gpt-4o-mini (configurable)
- Returns JSON: `{ answer: string, suggestions: string[] }`
- Fallback mock response if API unavailable
- Token usage tracking

#### ProgressService (`lib/services/progress.service.ts`)

**Key Methods:**
- `updateLessonProgress(userId, lessonId, data)` - Update progress
- `getUserProgressOverview(userId)` - Dashboard data
- `getCourseProgress(userId, courseId)` - Course-specific progress
- `calculateCourseProgress(userId, courseId)` - Recalculate percentage

**Progress Calculation:**
- Completion percentage = (completed lessons / total lessons) * 100
- Updates enrollment.progress automatically
- Marks enrollment as COMPLETED when 100%

### Major Workflow Implementations

#### Course Content Upload Workflow

```
1. Admin uploads file via form
2. Frontend requests presigned URL from backend
   POST /api/admin/uploads/presign
3. Backend generates S3 presigned URL
4. Frontend uploads directly to S3 using presigned URL
5. Frontend creates CourseAsset record with S3 key
   POST /api/admin/courses/[id]/assets
6. Optional: Attach asset to lesson(s)
   POST /api/admin/lessons/[lessonId]/assets
```

#### Video Playback Workflow

```
1. User navigates to lesson page
2. Frontend fetches course/lesson data
   GET /api/courses/[id]
3. Frontend requests CloudFront signed cookies
   GET (backend) /api/materials/cloudfront/sign
4. Backend validates enrollment and generates signed cookies
5. Frontend receives cookies and loads video
6. Video.js player uses HLS.js for adaptive streaming
7. Progress updates sent periodically
   POST /api/progress/lessons/[lessonId]
```

#### AI Assistant Interaction Workflow

```
1. User opens AI chat panel in learning interface
2. Frontend creates/loads conversation
   POST /api/ai/conversations
3. User sends message
   POST /api/ai/conversations/[id]/messages
4. Backend:
   - Fetches conversation history
   - Loads lesson context (title, objectives, transcript)
   - Resolves AI config (lesson > course > default)
   - Builds system prompt with context
   - Calls OpenAI API
   - Saves user message and AI response
5. Frontend displays response with follow-up suggestions
```

## 5. Business Logic Summary

### Key Algorithms

#### Course Progress Calculation

```typescript
// Simplified version from ProgressService
function calculateCourseProgress(userId, courseId) {
  // Get all lessons in course
  const lessons = getAllLessonsInCourse(courseId)

  // Get user's completed lessons
  const completedLessons = getCompletedLessons(userId, lessonIds)

  // Calculate percentage
  const progress = (completedLessons.length / lessons.length) * 100

  // Update enrollment record
  updateEnrollment(userId, courseId, { progress })

  // Mark as COMPLETED if 100%
  if (progress >= 100) {
    updateEnrollment(userId, courseId, {
      status: 'COMPLETED',
      completedAt: new Date()
    })
  }
}
```

#### Lesson Completion Rules

Three completion strategies:
1. **VIEW_ASSETS**: Auto-complete when user views all assets
2. **MANUAL**: User must manually mark as complete
3. **QUIZ**: Complete only after passing quiz

Current implementation focuses on MANUAL marking.

#### AI Context Injection

```typescript
// Priority-based config resolution
function getEffectiveAIConfig(lessonId, courseId) {
  if (lessonId) {
    const lessonConfig = getLessonAIConfig(lessonId)
    if (lessonConfig.isEnabled) return lessonConfig
  }

  if (courseId) {
    const courseConfig = getCourseAIConfig(courseId)
    if (courseConfig.isEnabled) return courseConfig
  }

  return DEFAULT_CONFIG
}

// Context building
function buildLessonContext(lesson, config) {
  const parts = [
    `Course: ${lesson.chapter.course.title}`,
    `Chapter: ${lesson.chapter.title}`,
    `Lesson: ${lesson.title}`
  ]

  if (lesson.description) {
    parts.push(`Description: ${lesson.description}`)
  }

  if (config.includeTranscript && lesson.transcript) {
    const truncated = lesson.transcript.substring(0, 2000)
    parts.push(`Transcript: ${truncated}`)
  }

  if (config.customContext) {
    parts.push(`Additional Context: ${config.customContext}`)
  }

  return parts.join('\n')
}
```

### Processing Pipelines

#### Asset Upload Pipeline

```
File Selection (Frontend)
    ↓
Request Presigned URL (Backend)
    ↓
Direct Upload to S3 (Client → S3)
    ↓
Create CourseAsset Record (Frontend → API)
    ↓
Link to Lesson via LessonAsset (Frontend → API)
    ↓
Asset Available in Learning Interface
```

#### Enrollment and Progress Pipeline

```
User Enrolls in Course
    ↓
Enrollment Record Created (status: ACTIVE, progress: 0)
    ↓
User Watches Lesson
    ↓
LessonProgress Updated (watchedDuration, lastTimestamp)
    ↓
User Marks Lesson Complete
    ↓
LessonProgress.completed = true
    ↓
Course Progress Recalculated
    ↓
Enrollment.progress Updated
    ↓
If 100%: Enrollment.status = COMPLETED, Certificate Generated
```

### Important Condition Branches

#### Course Visibility Rules

```
Public API (/api/courses):
  - ONLY show courses with status = PUBLISHED

Admin API (/api/admin/courses):
  - Show ALL courses (DRAFT, PUBLISHED, ARCHIVED)
  - Filter by status param (default: ALL)

Enrollment:
  - ONLY allow enrollment in PUBLISHED courses
  - Return 404 for DRAFT or ARCHIVED courses
```

#### Authentication Decision Tree

```
Request → Extract Token
    ↓
Is Supabase Enabled?
    ├─ YES → Verify with Supabase
    │   ├─ Valid → Load user from DB by supabaseId
    │   └─ Invalid → Try Local JWT
    └─ NO → Skip to Local JWT

Local JWT Verification
    ├─ Valid → Load user from DB by userId
    └─ Invalid → Reject (401)

User Found?
    ├─ YES → Check status = ACTIVE
    │   ├─ ACTIVE → Check role requirement
    │   │   ├─ Matches → Allow request
    │   │   └─ No match → Reject (403)
    │   └─ NOT ACTIVE → Reject (401)
    └─ NO → Reject (401)
```

#### Slug Conflict Resolution

```
Admin creates course with slug "agora-basics"
    ↓
Check if slug exists
    ├─ NO → Use slug as-is
    └─ YES → Auto-increment
        ├─ Try "agora-basics-2"
        ├─ If taken, try "agora-basics-3"
        ├─ Continue up to 1000 attempts
        └─ If all taken, throw error
```

## 6. Frontend Architecture

### Page Routing Structure (App Router)

Next.js 15 App Router with file-based routing:

```
/app
├── layout.tsx                    # Root layout
├── page.tsx                      # Landing page (/)
├── login/page.tsx               # Login page
├── courses/
│   ├── page.tsx                 # Course catalog (/courses)
│   └── [id]/
│       ├── page.tsx             # Course details (/courses/:id)
│       └── materials/page.tsx   # Course materials
├── learn/[courseId]/[lessonId]/page.tsx  # Learning interface
├── progress/page.tsx            # Progress dashboard
├── profile/page.tsx             # User profile
├── curriculum/[courseId]/page.tsx  # Curriculum view
├── quiz/[id]/
│   ├── page.tsx                 # Quiz taking
│   └── result/page.tsx          # Quiz results
└── admin/
    ├── page.tsx                 # Admin dashboard
    ├── courses/
    │   ├── page.tsx             # Course list
    │   ├── create/page.tsx      # Create course
    │   └── [id]/edit/page.tsx   # Edit course
    ├── users/page.tsx           # User management
    ├── analytics/page.tsx       # Analytics
    ├── ai-config/page.tsx       # AI configuration
    └── curricula/
        ├── page.tsx             # Curriculum list
        └── new/page.tsx         # Create curriculum
```

### State Management

**Approach**: Primarily uses React hooks (useState, useEffect, useCallback)
- No global state library (Redux, Zustand)
- API client (`lib/api-client.ts`) for data fetching
- Local state management in components
- URL state for navigation and filters

**Key State Patterns**:

1. **Loading States**:
   ```typescript
   const [loading, setLoading] = useState(true)
   const [error, setError] = useState<string | null>(null)
   ```

2. **Data Fetching**:
   ```typescript
   useEffect(() => {
     let cancelled = false
     const loadData = async () => {
       try {
         const response = await ApiClient.getCourse(id)
         if (!cancelled) setData(response.data)
       } catch (err) {
         if (!cancelled) setError(err.message)
       }
     }
     loadData()
     return () => { cancelled = true }
   }, [id])
   ```

3. **Progress Tracking**:
   ```typescript
   // Map of lessonId → progress data
   const [lessonProgressMap, setLessonProgressMap] =
     useState<Record<string, LessonProgress>>({})
   ```

### Component Hierarchy

#### Learning Interface (`/learn/[courseId]/[lessonId]/page.tsx`)

```
LessonPage (Container)
 ├── Header
 │   ├── Navigation (Home, Back)
 │   ├── Progress Indicator
 │   ├── Completion Badge/Button
 │   └── AI Assistant Toggle
 ├── Main Content Area
 │   ├── Sidebar (collapsible)
 │   │   └── CourseContentPanel
 │   │       ├── Chapter List
 │   │       └── Lesson List (with completion status)
 │   ├── Content Area
 │   │   ├── VideoJSPlayer (if video asset)
 │   │   ├── AssetViewer (if other asset selected)
 │   │   │   ├── PDFViewer
 │   │   │   ├── DocumentViewer
 │   │   │   └── TextViewer
 │   │   ├── Lesson Info (title, description, objectives)
 │   │   └── Navigation (Prev/Next lesson)
 │   └── AI Chat Panel (slide-in)
 │       └── AIChatPanel
 │           ├── Message List
 │           ├── Message Input
 │           └── Suggestion Chips
```

#### Admin Course Editor

```
CourseEditPage
 ├── Course Info Form
 │   ├── Title, Slug, Description
 │   ├── Level, Category, Tags
 │   ├── Thumbnail Upload
 │   └── Instructor Selection
 ├── Chapter Builder
 │   ├── Chapter List (drag-to-reorder)
 │   └── Chapter Editor
 │       ├── Title, Description
 │       └── Lesson Builder
 │           ├── Lesson List (drag-to-reorder)
 │           └── Lesson Editor
 │               ├── Title, Type, Duration
 │               ├── Learning Objectives
 │               └── Asset Manager
 │                   ├── Asset List
 │                   ├── Attach Existing Asset
 │                   └── Upload New Asset
 └── AI Config Panel
     ├── System Prompt Editor
     ├── Model Selection
     └── Temperature/Token Settings
```

### Key Frontend Features

#### Video Player Integration

- **Library**: Video.js with HLS.js plugin
- **Features**:
  - HLS adaptive bitrate streaming
  - Subtitle/caption support (VTT files)
  - Resume playback from last position
  - Progress tracking during playback
  - Playback speed control
  - Fullscreen support

#### Asset Viewing

Supports multiple asset types:
- **VIDEO**: Video.js player
- **DOCUMENT**: Embedded iframe or custom viewer
- **PRESENTATION**: PDF.js or iframe
- **TEXT**: Markdown/text renderer
- **AUDIO**: HTML5 audio player
- **PDF**: PDF.js viewer

#### Responsive Design

- Mobile-first approach with Tailwind CSS
- Collapsible sidebars for mobile
- Responsive video player
- Touch-friendly navigation
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)

#### Client-Side Performance

**Optimizations**:
- React component memoization (useMemo, useCallback)
- Lazy loading of heavy components
- Pagination for large lists
- Debounced search inputs
- Optimistic UI updates for progress tracking

## 7. Build, Deploy, Config

### Build System

**Frontend (Next.js)**:
```bash
npm run dev          # Development server (port 3000)
npm run build        # Production build
npm start            # Production server
npm run lint         # ESLint
```

Build output: `.next/` directory (server and static files)

**Backend (Fastify)**:
```bash
npm run backend:dev    # Development (tsx watch mode, port 8080)
npm run backend:build  # TypeScript compilation
cd backend && npm start  # Production server
```

Build output: `backend/dist/` directory (compiled JS)

**Database**:
```bash
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Visual DB explorer
npm run prisma:seed      # Seed database
```

**Utility Scripts**:
```bash
npm run s3:gc            # S3 garbage collection (dry run)
npm run s3:gc:apply      # Apply S3 cleanup
```

### Environment Configuration

**Required Environment Variables** (`.env`):

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/cse_training"

# AWS S3 & CloudFront
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=agora-cse-training-videos
AWS_CLOUDFRONT_DOMAIN=https://d123.cloudfront.net
AWS_S3_ASSET_PREFIX=course-assets
AWS_ASSET_PUBLIC_BASE_URL=https://assets.example.com

# Authentication
JWT_SECRET=your_jwt_secret_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url  # Optional
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key  # Optional

# OpenAI (AI Assistant)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Backend Server
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

### Important Configuration Files

#### `package.json`
- Scripts for dev, build, deployment
- Dependencies (Next.js, React, Prisma, AWS SDK, etc.)
- Prisma seed configuration

#### `tsconfig.json`
- TypeScript compiler options
- Path aliases: `@/*` maps to project root
- Target: ES2017
- Strict mode enabled

#### `prisma/schema.prisma`
- Database schema definition
- Generates two Prisma clients:
  1. Main client (for Next.js)
  2. Backend client (for Fastify, in `backend/node_modules/.prisma/client`)

#### `next.config.js` (if exists)
- Next.js configuration
- Image optimization settings
- Webpack customizations

#### `tailwind.config.js` (if exists)
- Tailwind CSS customization
- Theme colors, fonts, breakpoints
- Plugin configurations

### Deployment Environments

**Development**:
- Local PostgreSQL database
- Local S3 (MinIO) or development S3 bucket
- Next.js dev server (hot reload)
- Fastify dev server (tsx watch mode)

**Production**:
- Managed PostgreSQL (AWS RDS, Heroku Postgres, Supabase)
- AWS S3 production bucket with CloudFront CDN
- Next.js deployed to Vercel / AWS / Heroku
- Fastify deployed to AWS / Heroku / Docker

### Build Process

#### Frontend Build
```bash
1. npm install                    # Install dependencies
2. npx prisma generate            # Generate Prisma client
3. npm run build                  # Next.js build
   - TypeScript compilation
   - React optimization
   - Static page generation
   - Bundle optimization
4. Output: .next/ directory
```

#### Backend Build
```bash
1. cd backend && npm install      # Install backend deps
2. npx prisma generate            # Generate backend Prisma client
3. npm run build                  # TypeScript → JavaScript
   - Compiles src/ to dist/
4. Output: backend/dist/
```

#### Database Setup
```bash
1. Set DATABASE_URL in .env
2. npx prisma migrate deploy      # Run migrations in production
   OR
   npx prisma migrate dev         # Run migrations in development
3. npx prisma generate            # Generate client
4. Optional: npm run prisma:seed  # Seed initial data
```

### Deployment Platforms

**Frontend (Next.js)**:
- **Vercel** (recommended): One-click deployment, automatic builds
- **AWS**: Elastic Beanstalk, ECS, or EC2
- **Heroku**: Heroku Buildpack for Next.js
- **Docker**: Containerize and deploy anywhere

**Backend (Fastify)**:
- **AWS**: ECS, Lambda (serverless), or EC2
- **Heroku**: Node.js buildpack
- **Docker**: Containerize Fastify app
- **Google Cloud Run**: Serverless containers

**Database**:
- **AWS RDS**: Managed PostgreSQL
- **Heroku Postgres**: Managed add-on
- **Supabase**: PostgreSQL + auth + storage
- **Self-hosted**: Docker PostgreSQL container

## 8. Dependencies & External Integrations

### Core Dependencies

#### Frontend Core
- `next@^15.0.3` - React framework with App Router
- `react@^18.3.1`, `react-dom@^18.3.1` - UI library
- `typescript@^5.6.3` - Type safety
- `tailwindcss@^3.4.17` - Utility-first CSS
- `@radix-ui/*` - Headless UI components (dialogs, dropdowns, etc.)
- `lucide-react@^0.294.0` - Icon library

#### Backend Core
- `fastify@^4.28.1` - High-performance Node.js server
- `@fastify/cors`, `@fastify/cookie`, `@fastify/jwt` - Fastify plugins
- `@prisma/client@^5.22.0`, `prisma@^5.22.0` - Database ORM
- `zod@^3.25.76` - Schema validation

#### Video & Media
- `video.js@^8.23.4` - Video player
- `@types/video.js@^7.3.58` - TypeScript definitions
- `hls.js@^1.5.8` - HLS streaming support

#### Authentication
- `jsonwebtoken@^9.0.2` - JWT token generation/verification
- `bcryptjs@^2.4.3` - Password hashing
- `@supabase/supabase-js@^2.86.0` - Supabase client (optional)

#### AWS Integration
- `@aws-sdk/client-s3@^3.943.0` - S3 client
- `@aws-sdk/s3-request-presigner@^3.943.0` - Presigned URL generation
- `@aws-sdk/client-cloudfront@^3.503.0` - CloudFront integration
- `aws-cloudfront-sign@^2.1.1` - CloudFront URL/cookie signing

#### Utilities
- `date-fns@^3.0.6` - Date manipulation
- `recharts@^2.10.3` - Charts for analytics
- `clsx@^2.1.0`, `tailwind-merge@^2.2.0` - CSS class utilities
- `uuid@^11.0.3` - UUID generation
- `dotenv@^16.4.7` - Environment variable loading

### External Service Integrations

#### AWS S3 (File Storage)

**Purpose**: Store and serve course assets (videos, documents, images)

**Configuration**:
```typescript
// lib/aws-s3.ts
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
```

**Bucket Structure**:
```
agora-cse-training-videos/
└── course-assets/
    ├── {courseId}/
    │   ├── videos/
    │   │   ├── {assetId}.m3u8
    │   │   └── {assetId}.vtt
    │   ├── documents/
    │   │   └── {assetId}.pdf
    │   └── images/
    │       └── {assetId}.png
```

**Usage**:
1. **Upload**: Presigned POST URLs for client-side upload
2. **Download**: CloudFront URLs with optional signing
3. **Garbage Collection**: Script to clean up orphaned files (`scripts/s3-gc.ts`)

#### AWS CloudFront (CDN)

**Purpose**: Fast, globally distributed content delivery

**Features**:
- Cache course assets near users
- Signed URLs/cookies for access control
- HLS video streaming optimization

**Integration Points**:
```typescript
// backend/src/routes/materials/cloudfront.js
// Generates signed cookies for authenticated users
const signedCookies = getSignedCookies({
  keypairId: process.env.CLOUDFRONT_KEYPAIR_ID,
  privateKey: process.env.CLOUDFRONT_PRIVATE_KEY,
  url: process.env.AWS_CLOUDFRONT_DOMAIN + '/*',
  expires: Date.now() + 3600000, // 1 hour
})
```

#### OpenAI API (AI Assistant)

**Purpose**: Power the AI learning assistant

**Models Supported**: gpt-4o-mini (default), gpt-4, gpt-3.5-turbo

**Integration**:
```typescript
// lib/services/ai.service.ts
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: config.model,
    messages: [...history, { role: 'user', content: message }],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  }),
})
```

**Context Provided to AI**:
- Course/chapter/lesson titles
- Lesson description and learning objectives
- Video transcript (first 2000 chars)
- Custom context (lesson-specific)
- Recent conversation history (last 10 messages)

**Response Format**:
```json
{
  "answer": "Detailed explanation here",
  "suggestions": [
    "Follow-up question 1",
    "Follow-up question 2",
    "Follow-up question 3"
  ]
}
```

#### Supabase (Optional Auth & Storage)

**Purpose**: Alternative authentication and file storage

**Usage**:
- OAuth providers (Google, GitHub, etc.)
- User management
- Row-level security
- Optional alternative to AWS S3

**Integration**:
```typescript
// lib/auth-middleware.ts
const { data: { user }, error } =
  await supabaseAdmin.auth.getUser(token)

if (user) {
  dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id }
  })
}
```

**Dual Auth Strategy**:
1. Check Supabase token first (if configured)
2. Fall back to local JWT if Supabase unavailable
3. Always verify against local database for roles/status

#### PostgreSQL Database

**Provider Options**:
- Local development: PostgreSQL 14+
- Production: AWS RDS, Heroku Postgres, Supabase, Neon, etc.

**Prisma ORM**:
- Type-safe database queries
- Automatic migrations
- Query optimization
- Connection pooling

**Connection**:
```
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
```

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                      │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐   │
│  │ Auth Layer │→ │ Supabase   │  │ Local JWT + Bcrypt  │   │
│  └────────────┘  └────────────┘  └─────────────────────┘   │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐   │
│  │ File Layer │→ │ AWS S3     │→ │ CloudFront CDN      │   │
│  └────────────┘  └────────────┘  └─────────────────────┘   │
│                                                              │
│  ┌────────────┐  ┌────────────────────────────────────┐    │
│  │ AI Layer   │→ │ OpenAI API (gpt-4o-mini)          │    │
│  └────────────┘  └────────────────────────────────────┘    │
│                                                              │
│  ┌────────────┐  ┌────────────────────────────────────┐    │
│  │ Data Layer │→ │ PostgreSQL + Prisma ORM           │    │
│  └────────────┘  └────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 9. Known Risks / Complexity Points

### Fragile Areas

#### 1. Dual Prisma Client Setup
**Issue**: Two separate Prisma client instances
- Main app: `node_modules/.prisma/client`
- Backend: `backend/node_modules/.prisma/client`

**Risk**:
- Schema changes require generating BOTH clients
- Version mismatches can cause runtime errors
- Easy to forget to regenerate one of them

**Mitigation**:
- Always run `npx prisma generate` from root AND backend
- Use pre-build hooks to ensure both are generated
- Keep Prisma version in sync between package.json files

#### 2. Asset URL Resolution
**Complexity**: Multiple URL formats for the same asset

```typescript
// Legacy fields (still present in Lesson model)
lesson.videoUrl       // Old S3 URL
lesson.subtitleUrl    // Old subtitle URL

// Modern approach
lesson.assets[].url           // Direct S3 URL
lesson.assets[].cloudfrontUrl // CloudFront URL (preferred)

// Resolution logic in course.service.ts
url: binding.courseAsset.cloudfrontUrl ?? binding.courseAsset.url
```

**Risk**:
- Code uses different URL sources in different places
- Difficult to track which URL to use
- Migration path from legacy to modern not clear

**Mitigation**:
- Prefer `cloudfrontUrl` over `url` when available
- Fallback chain: cloudfrontUrl → url → legacy fields
- Document URL resolution strategy

#### 3. Progress Calculation Race Conditions
**Issue**: Multiple simultaneous progress updates

**Scenario**:
```
User watches video → syncProgress() throttled to 15s
User navigates away → onEnded() fires
User marks complete → handleMarkComplete() called
All three may update progress simultaneously
```

**Risk**:
- Overlapping API calls
- Stale progress values
- Incorrect completion status

**Mitigation**:
- Use `force` parameter to override throttling on critical events
- Optimistic UI updates with rollback on error
- Consider using a progress update queue

#### 4. S3 Orphaned Files
**Issue**: Files uploaded to S3 but no database record created

**Causes**:
1. User uploads file, then cancels before saving
2. CourseAsset deletion doesn't delete S3 file
3. Course/lesson deletion may leave orphaned assets

**Mitigation**:
- `scripts/s3-gc.ts` script to find and delete orphaned files
- Compares S3 bucket contents with database records
- Dry-run mode to preview deletions
- Use S3 lifecycle policies for automatic cleanup

### Hard-to-Modify Modules

#### 1. Database Schema Migrations
**Complexity**: 21 interconnected models with cascading deletes

**Challenges**:
- Changing core models (Course, Lesson) affects many related tables
- Cascade delete behavior must be carefully maintained
- Production migrations require downtime or careful planning
- Prisma migration conflicts on team environments

**Breaking Changes**:
- Changing enum values (CourseStatus, UserRole)
- Removing required fields
- Changing relation cardinality (one-to-many → many-to-many)

**Safe Approach**:
1. Add new fields as optional
2. Migrate data gradually
3. Mark old fields as deprecated
4. Remove old fields in later migration

#### 2. Authentication System
**Complexity**: Dual auth (Supabase + Local JWT)

**Current Logic**:
```typescript
if (IS_LOCAL_AUTH) {
  // Use local JWT only
} else {
  // Try Supabase, fall back to JWT
}
```

**Issues**:
- Hard to switch from one auth method to another
- User records may have `supabaseId` or `password` or both
- Changing auth strategy requires data migration
- Role/permission checks scattered across codebase

**Migration Path** (if needed):
- Add feature flag for auth strategy
- Support hybrid mode (both methods active)
- Migrate users one at a time
- Deprecate old method after full migration

#### 3. Video Player Component
**Tightly Coupled**: VideoJSPlayer uses specific HLS.js configuration

**Challenges**:
- Switching video players requires significant refactoring
- Subtitle format locked to VTT
- Progress tracking tied to Video.js events
- Mobile vs desktop player differences

**Extension Points**:
- Consider abstracting player interface
- Support multiple subtitle formats
- Decouple progress tracking from player events

### Tech Debt Sections

#### 1. Legacy Video Fields
**Debt**: Lesson model still has `videoUrl`, `subtitleUrl`, `transcript`

**Impact**:
- Frontend code checks both legacy and modern fields
- Unclear which is source of truth
- Cannot safely remove old fields without data migration

**Resolution**:
1. Migrate all data to CourseAsset + LessonAsset
2. Update all code to use only asset-based approach
3. Mark legacy fields as deprecated
4. Remove fields in future schema version

#### 2. Inconsistent Error Handling
**Issue**: Different error response formats across API routes

**Examples**:
```typescript
// Some routes
{ success: false, error: { code: 'AUTH_001', message: '...' } }

// Other routes
{ error: 'Something went wrong' }

// Validation errors
{ success: false, error: { code: 'VALIDATION_ERROR', details: [...] } }
```

**Impact**:
- Frontend must handle multiple error formats
- Difficult to provide consistent user experience
- Error codes not standardized

**Solution**:
- Define standard error response interface
- Create error handler middleware
- Document error codes

#### 3. No Comprehensive Testing
**Gaps**:
- No unit tests for service layer
- No integration tests for API routes
- No E2E tests for critical user flows
- Manual testing only

**Impact**:
- Regressions go unnoticed
- Refactoring is risky
- Hard to validate complex logic (progress calculation, AI context building)

**Recommendations**:
- Add Jest for unit/integration tests
- Use Playwright or Cypress for E2E tests
- Start with critical paths: enrollment, progress, AI chat

#### 4. Frontend State Management
**Issue**: No centralized state management

**Current Approach**:
- Each component manages own state
- Props drilling for shared state
- Repeated API calls for same data
- No caching strategy

**Consequences**:
- Performance issues on data-heavy pages
- Stale data problems
- Difficult to sync state across components

**Potential Solutions**:
- Introduce React Query / SWR for data fetching + caching
- Use Zustand or Jotai for shared client state
- Implement optimistic updates

### Legacy Logic

#### 1. Course Duration Calculation
**Current**: Hardcoded to 0, not calculated from lessons

```prisma
model Course {
  duration Int // Total duration in seconds
  // ...
}
```

**Code Comment**:
```typescript
// CourseService.createCourse()
duration: 0, // Will be calculated from lessons
```

**Issue**: Duration never actually calculated
**TODO**: Implement aggregation from lesson durations

#### 2. Enrollment Auto-Completion
**Incomplete Implementation**:
- Marks enrollment as COMPLETED when progress = 100%
- Does NOT trigger certificate generation
- Does NOT trigger achievement awards

**Expected Flow**:
```
Progress reaches 100%
    ↓
Mark enrollment as COMPLETED
    ↓
Generate certificate (TODO)
    ↓
Award completion achievement (TODO)
    ↓
Send notification (TODO)
```

#### 3. Quiz System
**Status**: Database models exist, but no implementation

**Models Present**:
- Quiz, Question, QuizAttempt

**Missing**:
- Quiz taking UI
- Answer validation logic
- Score calculation
- Quiz-based lesson completion

#### 4. Curriculum vs Course Confusion
**Issue**: Two overlapping concepts

- **Course**: Original system (Course → Chapter → Lesson)
- **Curriculum**: Newer system (status unclear)

**Unclear**:
- Relationship between Course and Curriculum
- Migration path
- Which to use for new content
- Whether both will coexist

**Needs Documentation**: Clarify architectural vision

## 10. How to Extend the Project

### Adding a New Feature

#### Pattern to Follow

1. **Define Database Models** (if needed)
   ```prisma
   // prisma/schema.prisma
   model NewFeature {
     id String @id @default(uuid())
     // ... fields
     @@map("new_features")
   }
   ```

2. **Run Migration**
   ```bash
   npx prisma migrate dev --name add_new_feature
   ```

3. **Create Service Layer**
   ```typescript
   // lib/services/new-feature.service.ts
   export class NewFeatureService {
     static async createNewFeature(data) {
       return await prisma.newFeature.create({ data })
     }
   }
   ```

4. **Create API Route**
   ```typescript
   // app/api/new-feature/route.ts
   import { withAuth } from '@/lib/auth-middleware'
   import { NewFeatureService } from '@/lib/services/new-feature.service'

   export const GET = withAuth(async (req, user) => {
     const data = await NewFeatureService.getAll()
     return NextResponse.json({ success: true, data })
   })
   ```

5. **Create UI Components**
   ```typescript
   // components/new-feature/feature-card.tsx
   export function FeatureCard({ feature }) {
     return <div>...</div>
   }
   ```

6. **Create Page**
   ```typescript
   // app/new-feature/page.tsx
   'use client'
   export default function NewFeaturePage() {
     return <FeatureCard />
   }
   ```

### Adding a New API Endpoint

**Example**: Add lesson notes endpoint

1. **Create route file**:
   ```typescript
   // app/api/lessons/[lessonId]/notes/route.ts
   import { withAuth } from '@/lib/auth-middleware'
   import { NextRequest, NextResponse } from 'next/server'
   import prisma from '@/lib/prisma'

   export const GET = withAuth(async (req, user, context) => {
     const { lessonId } = context.params

     const notes = await prisma.lessonNote.findMany({
       where: { lessonId, userId: user.id },
     })

     return NextResponse.json({ success: true, data: notes })
   })

   export const POST = withAuth(async (req, user, context) => {
     const { lessonId } = context.params
     const body = await req.json()

     const note = await prisma.lessonNote.create({
       data: {
         lessonId,
         userId: user.id,
         content: body.content,
         timestamp: body.timestamp,
       },
     })

     return NextResponse.json({ success: true, data: note }, { status: 201 })
   })
   ```

2. **Add to API client**:
   ```typescript
   // lib/api-client.ts
   export class ApiClient {
     static async getLessonNotes(lessonId: string) {
       return this.get(`/api/lessons/${lessonId}/notes`)
     }

     static async createLessonNote(lessonId: string, data: any) {
       return this.post(`/api/lessons/${lessonId}/notes`, data)
     }
   }
   ```

### Adding a New Component

**Best Practices**:

1. **Use TypeScript**:
   ```typescript
   interface FeatureCardProps {
     title: string
     description?: string
     onAction?: () => void
   }

   export function FeatureCard({
     title,
     description,
     onAction
   }: FeatureCardProps) {
     return (...)
   }
   ```

2. **Follow Naming Conventions**:
   - PascalCase for components: `FeatureCard.tsx`
   - kebab-case for files: `feature-card.tsx`
   - Prefix with category: `admin/course-editor.tsx`

3. **Use Radix UI for Interactive Elements**:
   ```typescript
   import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
   import { Button } from '@/components/ui/button'
   ```

4. **Style with Tailwind**:
   ```typescript
   <div className="flex items-center space-x-4 p-4 bg-card rounded-lg">
     <Button variant="outline" size="sm">Click</Button>
   </div>
   ```

### Extending the Database Schema

**Example**: Add tagging system

1. **Update schema**:
   ```prisma
   model Tag {
     id     String   @id @default(uuid())
     name   String   @unique
     slug   String   @unique
     color  String?

     courses CourseTags[]

     @@map("tags")
   }

   model CourseTags {
     courseId String
     course   Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
     tagId    String
     tag      Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

     @@id([courseId, tagId])
     @@map("course_tags")
   }

   // Add to Course model
   model Course {
     // ... existing fields
     courseTags CourseTags[]
   }
   ```

2. **Create migration**:
   ```bash
   npx prisma migrate dev --name add_tagging_system
   ```

3. **Update types**:
   ```typescript
   // types/index.ts
   export interface Tag {
     id: string
     name: string
     slug: string
     color?: string
   }
   ```

### Anti-Patterns to Avoid

#### 1. Don't Mix Server and Client Components Incorrectly
❌ **Bad**:
```typescript
// app/page.tsx
import prisma from '@/lib/prisma'

export default async function Page() {
  const courses = await prisma.course.findMany() // Direct DB access in page
  return <div>{courses.map(...)}</div>
}
```

✅ **Good**:
```typescript
// app/page.tsx
import { CourseService } from '@/lib/services/course.service'

export default async function Page() {
  const { courses } = await CourseService.getCourses({})
  return <div>{courses.map(...)}</div>
}
```

#### 2. Don't Skip Validation
❌ **Bad**:
```typescript
export const POST = withAuth(async (req) => {
  const body = await req.json()
  const course = await prisma.course.create({ data: body }) // No validation!
  return NextResponse.json({ data: course })
})
```

✅ **Good**:
```typescript
import { createCourseSchema } from '@/lib/validations'

export const POST = withAuth(async (req) => {
  const body = await req.json()
  const data = createCourseSchema.parse(body) // Zod validation
  const course = await CourseService.createCourse(data)
  return NextResponse.json({ data: course })
})
```

#### 3. Don't Expose Sensitive Data
❌ **Bad**:
```typescript
const user = await prisma.user.findUnique({ where: { id } })
return NextResponse.json({ user }) // Includes password hash!
```

✅ **Good**:
```typescript
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    name: true,
    role: true,
    // Explicitly exclude password
  }
})
return NextResponse.json({ user })
```

#### 4. Don't Bypass Authentication Middleware
❌ **Bad**:
```typescript
// app/api/admin/secret/route.ts
export async function GET(req) {
  // No auth check!
  const data = await getSecretAdminData()
  return NextResponse.json({ data })
}
```

✅ **Good**:
```typescript
import { withAdminAuth } from '@/lib/auth-middleware'

export const GET = withAdminAuth(async (req, user) => {
  const data = await getSecretAdminData()
  return NextResponse.json({ data })
})
```

#### 5. Don't Forget Error Handling
❌ **Bad**:
```typescript
export const GET = withAuth(async (req) => {
  const data = await someService.getData() // May throw error
  return NextResponse.json({ data })
})
```

✅ **Good**:
```typescript
export const GET = withAuth(async (req) => {
  try {
    const data = await someService.getData()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Get data error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DATA_ERROR',
          message: 'Failed to retrieve data'
        }
      },
      { status: 500 }
    )
  }
})
```

### Recommended Development Workflow

1. **Start with Database Schema**
   - Define models in `prisma/schema.prisma`
   - Run migration: `npx prisma migrate dev`
   - Generate types: `npx prisma generate`

2. **Build Service Layer**
   - Create service in `lib/services/`
   - Implement business logic
   - Use Prisma client for DB operations

3. **Create API Routes**
   - Add route in `app/api/`
   - Use authentication middleware
   - Call service methods
   - Handle errors consistently

4. **Build UI Components**
   - Create reusable components in `components/`
   - Use TypeScript for props
   - Style with Tailwind + Radix UI

5. **Create Pages**
   - Add page in `app/`
   - Use Server Components for data fetching
   - Use Client Components for interactivity

6. **Test Manually**
   - Test in development mode
   - Verify API responses in browser DevTools
   - Check database changes in Prisma Studio

7. **Document**
   - Add comments for complex logic
   - Update API documentation
   - Update type definitions

---

## Summary

The CSE Training System is a full-stack Learning Management System built on Next.js 15, PostgreSQL, and AWS infrastructure. It follows a service-oriented architecture with clear separation between:
- **Frontend**: Next.js App Router with React components
- **API Layer**: Next.js API routes with authentication middleware
- **Backend Services**: Fastify server for S3/CloudFront operations
- **Data Layer**: Prisma ORM with PostgreSQL
- **External Services**: AWS S3/CloudFront, OpenAI API, optional Supabase

The system supports:
- Hierarchical course structure (Course → Chapter → Lesson → Assets)
- Video streaming with HLS and progress tracking
- AI-powered learning assistance with configurable prompts
- User authentication (local JWT + optional Supabase)
- Admin dashboard for content management
- Analytics and reporting
- Gamification (achievements, certificates)

Key complexity areas include:
- Dual Prisma client setup (main + backend)
- Legacy vs modern asset management
- Dual authentication strategy
- S3 orphaned file management

When extending the system, follow the established patterns:
1. Define database models with Prisma
2. Create service layer for business logic
3. Build API routes with proper authentication
4. Create reusable UI components
5. Compose pages from components

Avoid common anti-patterns:
- Skipping validation
- Bypassing authentication
- Exposing sensitive data
- Inconsistent error handling
- Direct database access in UI components
