# Exam System Design & Implementation

## Overview

The Exam System is a comprehensive assessment platform for the CSE Training LMS that supports AI-powered question generation, hybrid grading, email notifications, and certificate delivery.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  Admin Pages                          │  User Pages                      │
│  - Exam Management                    │  - Exam List                     │
│  - Question Editor                    │  - Take Exam                     │
│  - Essay Grading                      │  - View Results                  │
│  - Analytics Dashboard                │  - Certificates                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Layer (Next.js App Router)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  /api/admin/exams/*                   │  /api/exams/*                    │
│  /api/admin/exams/[id]/questions/*    │  /api/certificates/*             │
│  /api/admin/exams/[id]/invitations/*  │                                  │
│  /api/admin/exams/[id]/analytics/*    │                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Service Layer                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ExamService          │  ExamAttemptService    │  ExamGradingService     │
│  ExamGenerationService│  CertificateService    │  EmailService           │
│  ExamAnalyticsService │  MaterialProcessingService                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        External Services                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Prisma)  │  OpenAI API           │  AWS S3                  │
│  Resend (Email)       │  CloudFront (CDN)     │                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Enums

```prisma
enum ExamStatus {
  DRAFT           // Initial state, editable
  PENDING_REVIEW  // Awaiting admin approval
  APPROVED        // Approved, ready to publish
  PUBLISHED       // Live, users can take
  CLOSED          // No longer accepting attempts
}

enum ExamType {
  COURSE_BASED    // Linked to a course
  STANDALONE      // Independent exam
}

enum ExamQuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
  FILL_IN_BLANK
  ESSAY
}

enum DifficultyLevel {
  EASY
  MEDIUM
  HARD
}

enum GradingStatus {
  PENDING         // Not yet graded
  AUTO_GRADED     // Automatically graded (MC, TF, Fill-in)
  AI_SUGGESTED    // AI provided suggestion (essays)
  MANUALLY_GRADED // Admin finalized grade
}

enum ExamAttemptStatus {
  IN_PROGRESS     // User is taking exam
  SUBMITTED       // User submitted
  GRADED          // All answers graded
  EXPIRED         // Time ran out
}
```

### Core Models

#### Exam
```prisma
model Exam {
  id          String     @id @default(uuid())
  title       String
  description String?
  instructions String?

  examType    ExamType   @default(STANDALONE)
  status      ExamStatus @default(DRAFT)

  // Linked course (optional)
  courseId    String?
  course      Course?    @relation(...)

  // Timing
  timeLimit     Int?     // Minutes
  availableFrom DateTime?
  deadline      DateTime?

  // Scoring
  totalScore    Int      @default(100)
  passingScore  Int      @default(70)
  maxAttempts   Int      @default(1)

  // Options
  randomizeQuestions     Boolean @default(false)
  randomizeOptions       Boolean @default(false)
  showResultsImmediately Boolean @default(true)
  allowReview            Boolean @default(true)

  // AI Generation Config
  aiGenerationConfig Json?

  // Audit
  createdById  String
  approvedById String?
  approvedAt   DateTime?
  publishedAt  DateTime?
  closedAt     DateTime?

  // Relations
  questions   ExamQuestion[]
  attempts    ExamAttempt[]
  materials   ExamMaterial[]
  invitations ExamInvitation[]
  analytics   ExamAnalytics?
  certificates Certificate[]
}
```

#### ExamQuestion
```prisma
model ExamQuestion {
  id         String           @id @default(uuid())
  examId     String
  exam       Exam             @relation(...)

  type       ExamQuestionType
  difficulty DifficultyLevel  @default(MEDIUM)

  question      String        // Question text
  options       Json?         // Array of options for MC
  correctAnswer String?       // For auto-grading

  // Essay-specific
  rubric       String?        // Grading criteria
  sampleAnswer String?        // Model answer
  maxWords     Int?           // Word limit

  explanation String?         // Shown after grading
  topic       String?         // Topic tag
  points      Int    @default(10)
  order       Int    @default(0)

  // AI generation metadata
  isAIGenerated Boolean @default(false)
  aiModel       String?

  // Relations
  answers ExamAnswer[]
  sources ExamQuestionSource[]
}
```

#### ExamAttempt
```prisma
model ExamAttempt {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(...)
  examId String
  exam   Exam   @relation(...)

  attemptNumber Int               @default(1)
  status        ExamAttemptStatus @default(IN_PROGRESS)

  // Timing
  startedAt   DateTime  @default(now())
  submittedAt DateTime?
  expiresAt   DateTime?
  lastSavedAt DateTime?

  // Scoring
  rawScore        Float?
  percentageScore Float?
  passed          Boolean?

  // Essay tracking
  hasEssays    Boolean @default(false)
  essaysGraded Boolean @default(false)

  // Proctoring
  userAgent String?
  ipAddress String?

  answers ExamAnswer[]
}
```

#### ExamAnswer
```prisma
model ExamAnswer {
  id         String       @id @default(uuid())
  attemptId  String
  attempt    ExamAttempt  @relation(...)
  questionId String
  question   ExamQuestion @relation(...)

  // User's answer
  answer         String?  // Text response
  selectedOption Int?     // MC option index

  // Grading
  gradingStatus GradingStatus @default(PENDING)
  isCorrect     Boolean?
  pointsAwarded Float?

  // AI Grading
  aiSuggestedScore Float?
  aiFeedback       String?
  aiGradedAt       DateTime?

  // Admin Override
  adminScore      Float?
  adminFeedback   String?
  adminGradedById String?
  adminGradedAt   DateTime?

  answeredAt DateTime?
}
```

---

## Services

### ExamService (`lib/services/exam.service.ts`)

Manages exam CRUD operations and status workflow.

**Key Methods:**
```typescript
class ExamService {
  // CRUD
  static async getExams(params: ExamListParams): Promise<PaginatedResult>
  static async getExamById(id: string): Promise<ExamWithDetails | null>
  static async createExam(data: CreateExamInput, createdById: string): Promise<Exam>
  static async updateExam(id: string, data: UpdateExamInput): Promise<Exam>
  static async deleteExam(id: string): Promise<void>

  // Status Management
  static async changeStatus(id: string, status: ExamStatus, userId?: string): Promise<Exam>

  // Questions
  static async getQuestions(examId: string): Promise<ExamQuestion[]>
  static async addQuestion(examId: string, data: CreateQuestionInput): Promise<ExamQuestion>
  static async updateQuestion(questionId: string, data: UpdateQuestionInput): Promise<ExamQuestion>
  static async deleteQuestion(questionId: string): Promise<void>
  static async reorderQuestions(examId: string, questionIds: string[]): Promise<void>

  // Access Control
  static async canUserTakeExam(userId: string, examId: string): Promise<AccessResult>
}
```

**Status Workflow:**
```
DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED → CLOSED
         ↑                    │
         └────────────────────┘ (can revert to pending)
```

---

### ExamGenerationService (`lib/services/exam-generation.service.ts`)

AI-powered question generation using RAG content.

**Key Methods:**
```typescript
class ExamGenerationService {
  async generateQuestions(examId: string, config: GenerationConfig): Promise<GenerationResult>
  async regenerateQuestion(questionId: string, config?: Partial<GenerationConfig>): Promise<GeneratedQuestion>
}

interface GenerationConfig {
  questionCounts: {
    multipleChoice?: number;
    trueFalse?: number;
    fillInBlank?: number;
    essay?: number;
  };
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'mixed';
  topics?: string[];
  focusAreas?: string[];
}
```

**Generation Flow:**
1. Collect RAG chunks from exam materials and/or course transcripts
2. Select relevant chunks based on topic/focus areas
3. Build type-specific prompts for each question type
4. Call OpenAI API (gpt-4o-mini) with JSON response format
5. Parse and validate generated questions
6. Store in database with source chunk links

**Prompts by Question Type:**
- **Multiple Choice**: 4 options, 1 correct answer, explanation
- **True/False**: Clear statement, correct answer, explanation
- **Fill-in-Blank**: Sentence with blank, correct answer(s), context
- **Essay**: Open-ended question, rubric, sample answer

---

### ExamAttemptService (`lib/services/exam-attempt.service.ts`)

Manages user exam sessions.

**Key Methods:**
```typescript
class ExamAttemptService {
  static async startAttempt(userId: string, examId: string, ipAddress?: string, userAgent?: string): Promise<StartAttemptResult>
  static async saveAnswer(attemptId: string, input: SaveAnswerInput): Promise<void>
  static async submitAttempt(attemptId: string): Promise<AttemptWithAnswers>
  static async getAttemptWithAnswers(attemptId: string): Promise<AttemptWithAnswers>
  static async getUserAttempts(userId: string, examId: string): Promise<AttemptSummary[]>
  static async getCurrentAttempt(userId: string, examId: string): Promise<StartAttemptResult | null>
  static async checkAndSubmitExpired(attemptId: string): Promise<boolean>
}
```

**Start Attempt Flow:**
1. Verify exam exists and is published
2. Check availability window (availableFrom, deadline)
3. Verify user access (invitation or course enrollment)
4. Check for existing in-progress attempt (resume if found)
5. Verify attempt limit not reached
6. Calculate expiry time if time limit set
7. Create new attempt record
8. Return questions (optionally randomized)

**Auto-Save:**
- Answers are saved on each change via `saveAnswer()`
- `lastSavedAt` timestamp updated
- No data loss on browser refresh/close

**Auto-Submit:**
- If `expiresAt` is reached, attempt is auto-submitted
- Checked on: answer save, attempt access, dedicated check endpoint

---

### ExamGradingService (`lib/services/exam-grading.service.ts`)

Handles auto-grading and AI-assisted essay grading.

**Key Methods:**
```typescript
class ExamGradingService {
  // Auto-grade objective questions
  async gradeAttempt(attemptId: string): Promise<GradingResult>

  // AI essay grading
  async gradeEssayWithAI(answerId: string): Promise<AIGradingResult>
  async batchGradeEssaysWithAI(attemptId: string): Promise<AIGradingResult[]>

  // Admin finalize
  async finalizeEssayGrade(answerId: string, adminId: string, score: number, feedback?: string): Promise<void>

  // Final scoring
  async calculateFinalScore(attemptId: string): Promise<FinalScoreResult>

  // Admin helpers
  async getPendingEssays(examId: string): Promise<PendingEssay[]>
  async getGradingSummary(attemptId: string): Promise<GradingSummary>
}
```

**Auto-Grading Logic:**

| Question Type | Grading Method |
|--------------|----------------|
| Multiple Choice | Compare `selectedOption` with correct answer index (A=0, B=1, etc.) |
| True/False | Case-insensitive comparison of answer text |
| Fill-in-Blank | Case-insensitive match, supports multiple answers separated by `\|` |
| Essay | AI suggestion + admin approval |

**AI Essay Grading:**
1. Build prompt with question, rubric, sample answer, user's essay
2. Call OpenAI with JSON response format
3. Parse: `{ score, feedback, rubricEvaluation, confidence }`
4. Store as `AI_SUGGESTED` status with `aiSuggestedScore` and `aiFeedback`
5. Admin reviews and finalizes with `finalizeEssayGrade()`

**Grading Status Flow:**
```
PENDING → AUTO_GRADED (objective questions)
        → AI_SUGGESTED (essays) → MANUALLY_GRADED (admin approval)
```

---

### EmailService (`lib/services/email.service.ts`)

Handles all email notifications using Resend.

**Key Methods:**
```typescript
class EmailService {
  static async sendExamInvitation(userId: string, examId: string): Promise<SendEmailResult>
  static async sendExamReminder(userId: string, examId: string): Promise<SendEmailResult>
  static async sendExamResults(userId: string, attemptId: string): Promise<SendEmailResult>
  static async sendCertificate(userId: string, certificateId: string): Promise<SendEmailResult>
  static async sendBulkInvitations(examId: string, userIds: string[]): Promise<BulkResult>
  static async getUserEmailLogs(userId: string, limit?: number): Promise<EmailLog[]>
}
```

**Email Templates (`lib/email-templates/index.tsx`):**
- `ExamInvitationEmail` - Exam link, deadline, time limit, attempts
- `ExamReminderEmail` - Deadline warning
- `ExamResultsEmail` - Score, pass/fail status, results link
- `CertificateDeliveryEmail` - Certificate number, download/verify links

**Environment Variables:**
```env
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=exams@yourdomain.com
NEXT_PUBLIC_APP_NAME=CSE Training System
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

### CertificateService (`lib/services/certificate.service.ts`)

Generates and manages completion certificates.

**Key Methods:**
```typescript
class CertificateService {
  static async generateCertificate(userId: string, attemptId: string, sendEmail?: boolean): Promise<GenerateCertificateResult>
  static async getCertificateById(certificateId: string): Promise<CertificateData | null>
  static async verifyCertificate(certificateNumber: string): Promise<VerificationResult>
  static async getUserCertificates(userId: string): Promise<CertificateData[]>
}
```

**Certificate Generation:**
1. Verify attempt exists and passed
2. Check for existing certificate (return if exists)
3. Generate unique certificate number: `CSE-YYYY-XXXXX`
4. Generate PDF using @react-pdf/renderer
5. Upload to S3
6. Create database record
7. Optionally send email with certificate

**PDF Template Features:**
- A4 landscape orientation
- Decorative borders
- Recipient name, exam title
- Score and percentage
- Issue date
- Certificate number
- Verification URL

---

### ExamAnalyticsService (`lib/services/exam-analytics.service.ts`)

Provides statistics and reporting.

**Key Methods:**
```typescript
class ExamAnalyticsService {
  static async getExamAnalytics(examId: string): Promise<ExamAnalytics>
  static async exportToCSV(examId: string): Promise<string>
  static async getLeaderboard(examId: string, limit?: number): Promise<LeaderboardEntry[]>
  static async saveAnalyticsSnapshot(examId: string): Promise<void>
}

interface ExamAnalytics {
  summary: {
    totalAttempts: number;
    uniqueUsers: number;
    completedAttempts: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
    averageScore: number;
    medianScore: number;
    minScore: number;
    maxScore: number;
    averageCompletionTime: number;
  };
  questionStats: QuestionStat[];
  scoreDistribution: ScoreRange[];
  timeline: DailyStats[];
}
```

**Question-Level Analytics:**
- Total answers, correct/incorrect counts
- Correct rate percentage
- Average points awarded
- Option distribution (for MC questions)

**CSV Export Columns:**
- Attempt ID, User Name, Email
- Attempt Number, Status
- Started At, Submitted At, Completion Time
- Raw Score, Percentage Score, Passed
- Each question's answer and points awarded

---

## API Endpoints

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/exams` | List all exams |
| POST | `/api/admin/exams` | Create exam |
| GET | `/api/admin/exams/[examId]` | Get exam details |
| PATCH | `/api/admin/exams/[examId]` | Update exam |
| DELETE | `/api/admin/exams/[examId]` | Delete exam |
| POST | `/api/admin/exams/[examId]/status` | Change exam status |
| GET | `/api/admin/exams/[examId]/questions` | Get questions |
| POST | `/api/admin/exams/[examId]/questions` | Add question |
| PUT | `/api/admin/exams/[examId]/questions` | Reorder questions |
| PATCH | `/api/admin/exams/[examId]/questions/[questionId]` | Update question |
| DELETE | `/api/admin/exams/[examId]/questions/[questionId]` | Delete question |
| POST | `/api/admin/exams/[examId]/generate-questions` | AI generate questions |
| GET | `/api/admin/exams/[examId]/invitations` | Get invitations |
| POST | `/api/admin/exams/[examId]/invitations` | Send invitations |
| GET | `/api/admin/exams/[examId]/attempts` | Get all attempts |
| POST | `/api/admin/exams/[examId]/attempts/[attemptId]/grade` | Trigger grading |
| POST | `/api/admin/exams/[examId]/attempts/[attemptId]/grade-essay` | Grade essay |
| GET | `/api/admin/exams/[examId]/essays` | Get pending essays |
| GET | `/api/admin/exams/[examId]/analytics` | Get analytics |
| GET | `/api/admin/exams/[examId]/export` | Export CSV |
| GET | `/api/admin/exams/[examId]/leaderboard` | Get leaderboard |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exams` | List available exams |
| GET | `/api/exams/[examId]` | Get exam info |
| POST | `/api/exams/[examId]/start` | Start attempt |
| POST | `/api/exams/[examId]/answer` | Save answer |
| POST | `/api/exams/[examId]/submit` | Submit exam |
| GET | `/api/exams/[examId]/result` | Get results |
| GET | `/api/exams/[examId]/attempts` | Get user's attempts |

### Certificate Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/certificates` | List user's certificates |
| POST | `/api/certificates` | Generate certificate |
| GET | `/api/certificates/[id]` | Get certificate |
| GET | `/api/certificates/[id]/download` | Download PDF |
| GET | `/api/certificates/verify/[number]` | Public verification |

---

## Workflows

### Exam Creation & Publishing

```
1. Admin creates exam (DRAFT)
   └─ Set title, description, instructions
   └─ Configure: time limit, scoring, attempts
   └─ Optionally link to course

2. Add/Generate Questions
   └─ Manual: Add questions one by one
   └─ AI: Upload materials → Generate questions
   └─ Review and edit generated questions

3. Submit for Review (PENDING_REVIEW)
   └─ Admin reviews exam structure
   └─ Verifies questions and scoring

4. Approve (APPROVED)
   └─ Senior admin approves
   └─ Ready for publishing

5. Publish (PUBLISHED)
   └─ Exam becomes available
   └─ Send invitations to users
   └─ Users can start taking exam

6. Close (CLOSED)
   └─ No new attempts allowed
   └─ Existing in-progress attempts auto-submit
```

### User Exam Flow

```
1. View Available Exams
   └─ See exams user is invited to
   └─ See exams for enrolled courses

2. Start Exam
   └─ View instructions
   └─ Click "Start Exam"
   └─ Timer starts (if time limit)

3. Answer Questions
   └─ Navigate between questions
   └─ Answers auto-save
   └─ Progress tracked

4. Submit Exam
   └─ Review answers
   └─ Click "Submit"
   └─ Or auto-submit on time expiry

5. View Results
   └─ Immediate: See score after submit
   └─ Delayed: Wait for essay grading
   └─ Review answers (if allowed)

6. Certificate (if passed)
   └─ Generate certificate
   └─ Download PDF
   └─ Share verification link
```

### Grading Flow

```
1. User Submits Exam
   └─ Status: SUBMITTED

2. Auto-Grade (triggered automatically or manually)
   └─ Grade MC, TF, Fill-in-blank questions
   └─ Mark as AUTO_GRADED

3. AI Essay Grading (if essays present)
   └─ Generate AI suggestions
   └─ Mark as AI_SUGGESTED

4. Admin Review Essays
   └─ View question, rubric, sample answer
   └─ See user's essay
   └─ Review AI suggestion
   └─ Accept or modify score
   └─ Add feedback
   └─ Mark as MANUALLY_GRADED

5. Calculate Final Score
   └─ Sum all points awarded
   └─ Calculate percentage
   └─ Determine pass/fail
   └─ Status: GRADED

6. Notify User
   └─ Send results email
   └─ Generate certificate if passed
```

---

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# OpenAI (for question generation and essay grading)
OPENAI_API_KEY=sk-...

# AWS S3 (for certificate storage)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket
AWS_CLOUDFRONT_DOMAIN=https://xxx.cloudfront.net

# Resend (for email)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=exams@yourdomain.com

# App
NEXT_PUBLIC_APP_NAME=CSE Training System
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Dependencies

```json
{
  "dependencies": {
    "@react-email/components": "^0.x.x",
    "@react-pdf/renderer": "^3.x.x",
    "resend": "^2.x.x",
    "pdf-parse": "^1.x.x",
    "mammoth": "^1.x.x",
    "openai": "^4.x.x"
  }
}
```

---

## Security Considerations

### Access Control
- Admin-only endpoints use `withAdminAuth` middleware
- User endpoints use `withAuth` middleware
- Exam access verified via invitation or course enrollment

### Data Protection
- Answers encrypted in transit (HTTPS)
- Certificate PDFs stored in private S3 bucket
- No sensitive data in public verification endpoint

### Exam Integrity
- IP address and user agent logged per attempt
- Time limits enforced server-side
- Auto-submit on expiry prevents late answers
- Question/option randomization available

### API Rate Limiting
- Email sending includes delays for rate limits
- Consider adding rate limiting to submission endpoints

---

## Future Enhancements

1. **Proctoring Integration**
   - Webcam monitoring
   - Screen recording
   - Browser lockdown

2. **Question Bank**
   - Reusable question library
   - Tags and categories
   - Random selection from pool

3. **Advanced Analytics**
   - Item response theory analysis
   - Difficulty calibration
   - Cheating detection

4. **Scheduling**
   - Exam scheduling system
   - Automated reminders
   - Calendar integration

5. **Multi-language Support**
   - Translate questions
   - Localized certificates
