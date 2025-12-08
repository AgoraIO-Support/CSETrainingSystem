# Curriculum Management System - Analysis & Implementation Plan

**Date:** 2025-12-08  
**Author:** System Architect Analysis  
**Version:** 1.0

---

## 📋 Executive Summary

After thoroughly analyzing the existing CSE Training System, I've identified that **a partial curriculum management feature has already been implemented** but is currently **using the Course model as a makeshift representation**. This document provides:

1. **Current State Analysis** - What exists and how it works
2. **Gap Analysis** - What's missing for a complete curriculum system
3. **Architecture Design** - Proposed database schema and API design
4. **Implementation Plan** - Step-by-step roadmap to completion

---

## 🔍 Current State Analysis

### What Already Exists

#### 1. **Frontend Components**
✅ **Admin Curriculum Pages:**
- `/app/admin/curricula/page.tsx` - Curriculum list view with search/filter
- `/app/admin/curricula/new/page.tsx` - Draft curriculum creator
- `/app/admin/curricula/[curriculumId]/versions/[versionId]/page.tsx` - Full-featured curriculum editor with:
  - Overview tab (title, description, audience level, learning outcomes)
  - Structure tab (module organization)
  - Modules tab (lesson assignment)
  - Checklist tab (publish validation)

✅ **UI Components:**
- `/components/curriculum/curriculum-status-badge.tsx` - Status badge component
- Type definitions in `/types/index.ts` for:
  - `CurriculumStatus` ('DRAFT' | 'PUBLISHED' | 'DEPRECATED')
  - `AudienceLevel` ('L1' | 'L2' | 'L3' | 'L4')
  - `CurriculumSummary`, `CurriculumModule`, `CurriculumVersion` interfaces

#### 2. **API Endpoints** (Partial)
✅ **Public API:**
- `GET /api/curricula` - List published curricula
- `GET /api/curricula/[slug]` - Get curriculum detail

✅ **Admin API:**
- `GET /api/admin/curricula` - List all curricula
- `POST /api/admin/curricula` - Create draft curriculum
- `GET /api/admin/curricula/[id]` - Get curriculum by ID
- `PATCH /api/admin/curricula/[id]` - Update curriculum
- `DELETE /api/admin/curricula/[id]` - Archive curriculum

❌ **Missing API Endpoints:**
- Version management endpoints
- Publish workflow endpoints
- Module-lesson mapping endpoints

#### 3. **Database Schema**
✅ **Existing Models:**
```prisma
model Course {
  id              String        @id @default(uuid())
  title           String
  slug            String        @unique
  description     String        @db.Text
  level           CourseLevel   // Mapped to audienceLevel
  status          CourseStatus  // Mapped to CurriculumStatus
  category        String
  tags            String[]
  learningOutcomes String[]
  requirements     String[]
  chapters        Chapter[]     // Mapped to modules
  ...
}

model Chapter {
  id          String    @id @default(uuid())
  courseId    String
  title       String
  description String?
  order       Int       // Mapped to position
  lessons     Lesson[]
  ...
}

model Lesson {
  id          String    @id @default(uuid())
  chapterId   String
  title       String
  description String?
  duration    Int
  videoUrl    String?
  transcript  String?
  ...
}
```

❌ **Missing Models:**
- No `Curriculum` model (currently using Course)
- No `CurriculumVersion` model for version control
- No `CurriculumModule` model (currently using Chapter)
- No proper many-to-many relationship for curriculum-course mapping

---

## 🔴 Gap Analysis

### Critical Issues

1. **Semantic Confusion**
   - **Problem:** Curricula are being stored as Courses, which creates conceptual confusion
   - **Impact:** 
     - Curricula appear in course listings
     - Cannot differentiate between standalone courses and curricula
     - Versioning is not properly supported

2. **Missing Version Control**
   - **Problem:** No database schema for curriculum versioning
   - **Impact:**
     - Cannot maintain version history
     - Publishing creates a new version but stores it as status change
     - No way to roll back or compare versions

3. **Module-Lesson Relationship**
   - **Problem:** Lessons are tightly coupled to Chapters (Modules)
   - **Impact:**
     - Cannot reuse lessons across different curricula/modules
     - Lesson duplication required for multi-curriculum scenarios
     - No lesson library concept

4. **Missing Business Logic**
   - **Problem:** No dedicated curriculum service layer
   - **Impact:**
     - Logic scattered across API routes
     - No centralized validation
     - Difficult to maintain consistency

---

## 🎯 Architecture Design

### Proposed Database Schema

```prisma
// ============================================================================
// CURRICULUM MANAGEMENT (NEW)
// ============================================================================

enum CurriculumStatus {
  DRAFT
  PUBLISHED
  DEPRECATED
  ARCHIVED
}

enum AudienceLevel {
  L1  // Level 1 Support
  L2  // Level 2 Support
  L3  // Advanced Support
  L4  // Expert/Engineering
}

// Main Curriculum entity (learning path)
model Curriculum {
  id              String             @id @default(uuid())
  code            String             @unique // e.g., "rtc-core-support"
  title           String
  description     String?            @db.Text
  
  // Metadata
  category        String?
  tags            String[]
  
  // Ownership
  ownerId         String
  owner           User               @relation("CurriculumOwner", fields: [ownerId], references: [id])
  
  // Timestamps
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  
  // Relations
  versions        CurriculumVersion[]
  
  @@index([code])
  @@index([ownerId])
  @@map("curricula")
}

// Version control for curricula
model CurriculumVersion {
  id                String             @id @default(uuid())
  curriculumId      String
  curriculum        Curriculum         @relation(fields: [curriculumId], references: [id], onDelete: Cascade)
  
  versionNumber     Int
  status            CurriculumStatus   @default(DRAFT)
  
  // Content
  title             String
  description       String?            @db.Text
  audienceLevel     AudienceLevel
  learningOutcomes  String[]
  requirements      String[]
  tags              String[]
  
  // Metadata
  publishedAt       DateTime?
  publishedBy       String?
  publishedByUser   User?              @relation("VersionPublisher", fields: [publishedBy], references: [id])
  
  // Timestamps
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  
  // Relations
  modules           CurriculumModule[]
  
  @@unique([curriculumId, versionNumber])
  @@index([curriculumId])
  @@index([status])
  @@map("curriculum_versions")
}

// Modules within a curriculum version (ordered groups of courses/lessons)
model CurriculumModule {
  id                String             @id @default(uuid())
  versionId         String
  version           CurriculumVersion  @relation(fields: [versionId], references: [id], onDelete: Cascade)
  
  title             String
  description       String?            @db.Text
  position          Int                @default(0)
  
  // Timestamps
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  
  // Relations
  items             CurriculumItem[]
  
  @@index([versionId])
  @@index([position])
  @@map("curriculum_modules")
}

// Items within a module (can be courses or standalone lessons)
enum CurriculumItemType {
  COURSE
  LESSON
}

model CurriculumItem {
  id                String              @id @default(uuid())
  moduleId          String
  module            CurriculumModule    @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  
  type              CurriculumItemType
  position          Int                 @default(0)
  
  // References (one of these will be set based on type)
  courseId          String?
  course            Course?             @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lessonId          String?
  lesson            Lesson?             @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  
  // Optional overrides
  titleOverride     String?
  isOptional        Boolean             @default(false)
  estimatedMinutes  Int?
  
  // Timestamps
  createdAt         DateTime            @default(now())
  
  @@index([moduleId])
  @@index([courseId])
  @@index([lessonId])
  @@index([position])
  @@map("curriculum_items")
}

// User progress through a curriculum
model CurriculumEnrollment {
  id                String             @id @default(uuid())
  userId            String
  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  curriculumId      String
  curriculum        Curriculum         @relation(fields: [curriculumId], references: [id], onDelete: Cascade)
  versionId         String
  version           CurriculumVersion  @relation(fields: [versionId], references: [id])
  
  status            EnrollmentStatus   @default(ACTIVE)
  progress          Float              @default(0.0) // Percentage 0-100
  
  // Timestamps
  enrolledAt        DateTime           @default(now())
  completedAt       DateTime?
  lastAccessedAt    DateTime?
  
  @@unique([userId, curriculumId])
  @@index([userId])
  @@index([curriculumId])
  @@index([versionId])
  @@map("curriculum_enrollments")
}
```

### Key Design Decisions

1. **Separation of Concerns**
   - `Curriculum`: High-level learning path entity
   - `CurriculumVersion`: Version control with full content snapshot
   - `CurriculumModule`: Logical grouping within a version
   - `CurriculumItem`: Individual learning resources (courses or lessons)

2. **Flexibility**
   - Can include both full courses and standalone lessons
   - Supports optional items
   - Allows title overrides without modifying source content
   - Version history is immutable once published

3. **User Progress Tracking**
   - Separate enrollment for curricula vs. courses
   - Tracks which version user is following
   - Maintains progress percentage

---

## 📊 API Design

### Public Endpoints

```typescript
// List all published curricula
GET /api/curricula
Response: { curricula: CurriculumSummary[] }

// Get curriculum details (latest published version)
GET /api/curricula/[code]
Response: { curriculum: CurriculumDetail }

// Enroll in curriculum
POST /api/curricula/[code]/enroll
Response: { enrollment: CurriculumEnrollment }

// Get user's curriculum progress
GET /api/curricula/[code]/progress
Response: { progress: CurriculumProgress }
```

### Admin Endpoints

```typescript
// List all curricula (all statuses)
GET /api/admin/curricula
Response: { curricula: CurriculumSummary[] }

// Create new curriculum
POST /api/admin/curricula
Body: { title, code, description, ownerId }
Response: { curriculum: Curriculum, version: CurriculumVersion }

// Get curriculum with all versions
GET /api/admin/curricula/[curriculumId]
Response: { curriculum: Curriculum, versions: CurriculumVersion[] }

// Get specific version
GET /api/admin/curricula/[curriculumId]/versions/[versionId]
Response: { version: CurriculumVersion }

// Update draft version
PATCH /api/admin/curricula/[curriculumId]/versions/[versionId]
Body: { title, description, modules, ... }
Response: { version: CurriculumVersion }

// Publish version
POST /api/admin/curricula/[curriculumId]/versions/[versionId]/publish
Response: { version: CurriculumVersion }

// Create new draft from published version
POST /api/admin/curricula/[curriculumId]/versions/[versionId]/duplicate
Response: { version: CurriculumVersion }

// Deprecate version
POST /api/admin/curricula/[curriculumId]/versions/[versionId]/deprecate
Response: { version: CurriculumVersion }
```

---

## 🛠️ Implementation Plan

### Phase 1: Database Migration (Priority: HIGH)

**Goal:** Establish proper database schema without breaking existing functionality

**Tasks:**
1. ✅ Create new Prisma models for curriculum system
2. ✅ Add relations to existing User, Course, Lesson models
3. ✅ Generate migration script
4. ✅ Create data migration script to convert existing "curriculum courses" to new schema
5. ✅ Test migration on development database
6. ✅ Document rollback procedure

**Estimated Time:** 4-6 hours

**Deliverables:**
- Updated `schema.prisma`
- Migration script
- Data migration script
- Migration documentation

---

### Phase 2: Service Layer (Priority: HIGH)

**Goal:** Implement business logic for curriculum management

**Tasks:**
1. ✅ Create `CurriculumService` in `/lib/services/curriculum.service.ts`
   - CRUD operations
   - Version management
   - Publish workflow
   - Validation logic
2. ✅ Create `CurriculumItemService` for module-item management
3. ✅ Update `CourseService` to work with curriculum relationships
4. ✅ Add validation schemas using Zod

**Estimated Time:** 6-8 hours

**Deliverables:**
- `/lib/services/curriculum.service.ts`
- `/lib/services/curriculum-item.service.ts`
- `/lib/validations/curriculum.ts`
- Unit tests (optional but recommended)

---

### Phase 3: API Implementation (Priority: HIGH)

**Goal:** Implement complete REST API for curriculum management

**Tasks:**
1. ✅ Refactor existing admin API routes to use new service
2. ✅ Implement version-specific endpoints
3. ✅ Implement publish workflow
4. ✅ Add proper error handling and validation
5. ✅ Implement public curriculum endpoints
6. ✅ Add enrollment endpoints

**Estimated Time:** 8-10 hours

**Deliverables:**
- Updated `/app/api/admin/curricula/*` routes
- New `/app/api/curricula/*` routes
- API documentation updates

---

### Phase 4: Frontend Updates (Priority: MEDIUM)

**Goal:** Connect existing UI to new backend architecture

**Tasks:**
1. ✅ Update curriculum list page to use new API
2. ✅ Update curriculum editor to work with versions
3. ✅ Implement module-lesson picker component
4. ✅ Add version history viewer
5. ✅ Implement publish confirmation dialog
6. ✅ Add curriculum enrollment UI for users
7. ✅ Update navigation/sidebar to include curricula

**Estimated Time:** 10-12 hours

**Deliverables:**
- Updated admin pages
- New user-facing curriculum pages
- Reusable components

---

### Phase 5: Testing & Documentation (Priority: MEDIUM)

**Goal:** Ensure system stability and maintainability

**Tasks:**
1. ✅ Integration testing for workflows
2. ✅ Admin workflow testing
3. ✅ User enrollment testing
4. ✅ Update system architecture docs
5. ✅ Create admin user guide
6. ✅ Create API documentation

**Estimated Time:** 6-8 hours

**Deliverables:**
- Test coverage report
- Updated documentation
- Admin guide
- API reference

---

## 📈 Success Metrics

- ✅ Can create and edit draft curricula
- ✅ Can publish curricula with version history
- ✅ Can reuse lessons across multiple curricula
- ✅ Users can enroll in curricula and track progress
- ✅ Admins can deprecate old versions
- ✅ Zero data loss during migration
- ✅ No disruption to existing course system

---

## 🎓 Benefits of This Approach

1. **Clear Separation**: Curricula and courses are distinct entities
2. **Version Control**: Full audit trail of curriculum changes
3. **Reusability**: Lessons can be shared across curricula
4. **Flexibility**: Mix courses and standalone lessons
5. **Scalability**: Can handle complex learning paths
6. **Maintainability**: Clean architecture with service layer
7. **User Experience**: Better progress tracking and navigation

---

## 🚨 Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | HIGH | Complete backup, staged rollout, extensive testing |
| Breaking existing course features | HIGH | Separate schemas, backward compatibility layer |
| Performance issues with complex queries | MEDIUM | Database indexing, query optimization, caching |
| Learning curve for admins | MEDIUM | Comprehensive documentation, training materials |

---

## 📚 Next Steps

1. **Review this document** with stakeholders
2. **Approve database schema** design
3. **Begin Phase 1** (Database Migration)
4. **Set up development environment** with test data
5. **Establish rollback procedures**
6. **Begin implementation** following phased approach

---

## 📎 Appendices

### A. Current vs. Proposed Data Model

**Current (Makeshift) Model:**
```
Course (used for both courses and curricula)
  └── Chapter (used as module)
      └── Lesson
```

**Proposed Model:**
```
Curriculum
  └── CurriculumVersion
      └── CurriculumModule
          └── CurriculumItem
              ├── Course
              │   └── Chapter
              │       └── Lesson
              └── Lesson (standalone)
```

### B. Technology Stack

- **Database:** PostgreSQL (via Prisma ORM)
- **Backend:** Next.js API Routes
- **Frontend:** Next.js 15 + React + TypeScript
- **UI:** shadcn/ui + Tailwind CSS
- **Validation:** Zod
- **Auth:** Supabase Auth + JWT

### C. Related Documentation

- [Architecture Overview](./architecture.md)
- [Database Design](./database-design.md)
- [API Design](./api-design.md)
- [Database Setup](./database-setup.md)

---

**End of Document**
