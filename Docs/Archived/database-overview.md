# CSE Training System – PostgreSQL Schema Overview

This document summarizes the database schema (based on prisma/schema.prisma), highlights key entities and relationships, and provides commands/URLs to explore live data.

## 1) ER Relationship (ASCII Summary)

```
User ─< Enrollment >─ Course
  │                         │
  │                         ├─< Chapter ─< Lesson ─< LessonProgress >─ User
  │                         │                      └─< LessonAsset >─┐
  │                         │                                         │
  └─< QuizAttempt >─ Quiz ─< Question                                  │
                                                                    CourseAsset >─┘

Additional:
- Course ─< CourseAsset (course materials)
- LessonAsset is the linking table between Lesson and CourseAsset
- Course ─< Discussion (self-referential replies)
- Course ─< CourseReview >─ User
- Achievement ─< UserAchievement >─ User
- AIConversation (optional courseId/lessonId) ─< AIMessage
- Certificate(userId, courseId)
- LearningReport(userId, courseId)
- SystemAnalytics(date unique)
- Notification(optional userId)
```

Cascades (examples):
- Course → Chapter/Enrollment/Quiz/Discussion/CourseReview/CourseAsset: onDelete: Cascade
- Chapter → Lesson: Cascade
- Lesson → LessonProgress/LessonAsset: Cascade

## 2) Core Entities & Key Fields

- users (User)
  - id PK, email unique, name, password?, avatar?, role(USER|ADMIN), status(ACTIVE|SUSPENDED|DELETED)
  - supabaseId unique?, bio?, title?, department?
  - createdAt, updatedAt, lastLoginAt

- courses (Course)
  - id PK, title, slug unique, description text, thumbnail?
  - level(BEGINNER|INTERMEDIATE|ADVANCED), status(DRAFT|PUBLISHED|ARCHIVED), category, tags[], learningOutcomes[], requirements[]
  - duration (seconds), instructorId → users.id
  - enrolledCount, rating, reviewCount
  - createdAt, updatedAt, publishedAt

- chapters (Chapter)
  - id PK, courseId → courses.id (Cascade), title, description?, order, createdAt, updatedAt

- lessons (Lesson)
  - id PK, chapterId → chapters.id (Cascade), title, description?, order
  - duration (seconds, legacy), durationMinutes?
  - lessonType(VIDEO|DOC|QUIZ|OTHER)?, learningObjectives[], completionRule(VIEW_ASSETS|MANUAL|QUIZ)?
  - videoUrl?, videoKey?, subtitleUrl?, subtitleKey?, transcript?, content?
  - createdAt, updatedAt

- enrollments (Enrollment)
  - id PK, userId → users.id (Cascade), courseId → courses.id (Cascade), status(ACTIVE|COMPLETED|DROPPED)
  - progress float, enrolledAt, completedAt?, lastAccessedAt?
  - UNIQUE(userId, courseId)

- lesson_progress (LessonProgress)
  - id PK, userId → users.id (Cascade), lessonId → lessons.id (Cascade)
  - completed bool, watchedDuration int, lastTimestamp int
  - startedAt, completedAt?, updatedAt
  - UNIQUE(userId, lessonId)

- course_assets (CourseAsset)
  - id PK, courseId → courses.id (Cascade), title, description?
  - type(LessonAssetType), url, cloudfrontUrl?, s3Key, contentType?, mimeType?
  - createdAt

- lesson_assets (LessonAsset)
  - id PK, lessonId → lessons.id (Cascade), courseAssetId → course_assets.id (Cascade)
  - createdAt

- quizzes, questions, quiz_attempts
  - Quiz: id, courseId → courses.id (Cascade), title, description?, passingScore, timeLimit?, randomizeQ?, createdAt, updatedAt
  - Question: id, quizId → quizzes.id (Cascade), type, question text, options json?, correctAnswer, explanation?, points, order, createdAt, updatedAt
  - QuizAttempt: id, userId → users.id (Cascade), quizId → quizzes.id (Cascade), answers json, score float, passed bool, startedAt, completedAt?

- discussions (Discussion – self-referencing)
  - id, courseId → courses.id (Cascade), userId → users.id (Cascade)
  - title?, content text, parentId? → discussions.id (Cascade), likes, isPinned
  - createdAt, updatedAt

- course_reviews (CourseReview)
  - id, courseId → courses.id (Cascade), userId, rating(1..5), comment?
  - createdAt, updatedAt, UNIQUE(courseId, userId)

- achievements & user_achievements
  - Achievement: id, title, description text, icon, criteria json, createdAt
  - UserAchievement: id, userId → users.id (Cascade), achievementId → achievements.id (Cascade), earnedAt
  - UNIQUE(userId, achievementId)

- ai_conversations & ai_messages & ai_prompt_templates
  - AIConversation: id, userId → users.id (Cascade), courseId?, lessonId?, createdAt, updatedAt
  - AIMessage: id, conversationId → ai_conversations.id (Cascade), role, content text, videoTimestamp?, context json?, tokens?, model?, createdAt
  - AIPromptTemplate: id, name unique, description?, template text, variables[], isActive, createdAt, updatedAt

- certificates, learning_reports, system_analytics, notifications
  - Certificate: id, userId, courseId, certificateNumber unique, issueDate, pdfUrl?
  - LearningReport: id, userId, courseId, completedLessons, totalLessons, averageQuizScore?, totalLearningTime, knowledgePoints[], recommendations json, aiSummary?, pdfUrl?, htmlUrl?, generatedAt
  - SystemAnalytics: id, date unique, activeUsers, newEnrollments, completedCourses, totalViews, aiInteractions, createdAt
  - Notification: id, userId?, type, title, message text, link?, read, createdAt

## 3) Enums
- UserRole: USER | ADMIN
- UserStatus: ACTIVE | SUSPENDED | DELETED
- CourseLevel: BEGINNER | INTERMEDIATE | ADVANCED
- CourseStatus: DRAFT | PUBLISHED | ARCHIVED
- LessonType: VIDEO | DOC | QUIZ | OTHER
- LessonCompletionRule: VIEW_ASSETS | MANUAL | QUIZ
- EnrollmentStatus: ACTIVE | COMPLETED | DROPPED
- QuestionType: MULTIPLE_CHOICE | TRUE_FALSE | FILL_IN_BLANK | ESSAY
- NotificationType: COURSE_UPDATE | QUIZ_REMINDER | ACHIEVEMENT | ANNOUNCEMENT | SYSTEM
- LessonAssetType: VIDEO | DOCUMENT | PRESENTATION | TEXT | AUDIO | OTHER

## 4) How to Explore Data

### Prisma Studio (GUI)
- Start: `npx prisma studio`
- URL: http://localhost:5555
- Browse/inspect/edit rows across all tables with relations.

### psql (CLI)
- Connect: `psql "$DATABASE_URL"`
- List tables: `\dt`
- Describe table: `\d+ courses`
- Quick check (examples):
  - `SELECT id, title, status FROM courses ORDER BY createdAt DESC LIMIT 10;`
  - `SELECT * FROM chapters WHERE courseId = '<course-id>' ORDER BY "order";`
  - `SELECT * FROM lessons WHERE "chapterId" = '<chapter-id>' ORDER BY "order";`

### Migrations/Seed (optional)
- Generate client: `npx prisma generate`
- Run dev migration: `npx prisma migrate dev`
- Seed (project script): `npm run prisma:seed`

### ERD Export (optional)
- You can import prisma/schema.prisma into tools like PrismaERD or dbdiagram.io to generate SVG/PNG diagrams.

## 5) Notes
- Many relations use `onDelete: Cascade` ensuring integrity when deleting parent records.
- CourseAsset and LessonAsset implement lesson-specific materials; current business rule enforces non-reuse across lessons.

---
Last updated: {{auto}}
