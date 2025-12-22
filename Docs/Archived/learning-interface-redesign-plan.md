# Learning Interface Redesign - Complete Implementation Plan

## Executive Summary

This document outlines the complete plan to redesign the user learning interface, removing mock data, implementing real data integration, and adding configurable AI assistant functionality.

## Current State Analysis

### What Exists:
1. ✅ Database schema with Course → Chapter → Lesson → CourseAsset → LessonAsset structure
2. ✅ Admin APIs for course/chapter/lesson/asset management
3. ✅ S3 upload infrastructure with presigned URLs
4. ✅ Basic learning page at `/learn/[courseId]/[lessonId]`
5. ✅ Video player component (VideoPlayer, CloudFrontPlayer)
6. ✅ AI conversation schema (AIConversation, AIMessage, AIPromptTemplate)
7. ✅ Course enrollment and progress tracking

### What Needs Improvement:
1. ❌ Learning page uses mock/placeholder data
2. ❌ No proper asset type handling (video vs documents)
3. ❌ No Video.js integration for MP4 playback
4. ❌ No document download functionality
5. ❌ AI assistant not fully integrated with admin-configurable prompts
6. ❌ Course view doesn't properly display all chapters/lessons with assets

---

## Implementation Plan

### **Phase 1: Backend API Enhancements**

#### 1.1 Enhance Course Detail API
**File:** `app/api/courses/[id]/route.ts`

**Goal:** Return complete course structure with all assets

**Changes:**
```typescript
GET /api/courses/:id

Response:
{
  success: true,
  data: {
    ...Course,
    isEnrolled: boolean,
    progress: number,
    chapters: [
      {
        ...Chapter,
        lessons: [
          {
            ...Lesson,
            assets: [
              {
                id: string,
                title: string,
                type: 'VIDEO' | 'DOCUMENT' | 'PRESENTATION' | 'TEXT' | 'AUDIO' | 'OTHER',
                url: string,           // CloudFront URL
                cloudfrontUrl: string,
                mimeType: string,
                contentType: string,
                description: string
              }
            ],
            progress?: {
              completed: boolean,
              watchedDuration: number,
              lastTimestamp: number
            }
          }
        ]
      }
    ],
    aiConfig?: {
      systemPrompt: string,
      contextInstructions: string,
      temperature: number,
      model: string
    }
  }
}
```

**Implementation Steps:**
1. Update CourseService.getCourse() to include nested assets
2. Add Prisma include for chapters → lessons → assets → courseAsset
3. Add AI configuration fetch for course-level prompts
4. Filter assets by enrolled status (return CloudFront URLs only for enrolled users)

**Files to Modify:**
- `lib/services/course.service.ts`
- `app/api/courses/[id]/route.ts`

---

#### 1.2 Create AI Configuration Management API
**New Files:** 
- `app/api/admin/courses/[id]/ai-config/route.ts`
- `lib/services/ai-config.service.ts`

**Endpoints:**

```typescript
// Get AI configuration for a course
GET /api/admin/courses/:courseId/ai-config

// Update/Create AI configuration
PUT /api/admin/courses/:courseId/ai-config
Body: {
  systemPrompt: string,
  contextInstructions: string,
  knowledgeBase: string[],  // Array of document references
  temperature: number,       // 0.0 - 1.0
  model: string,            // 'gpt-4', 'gpt-3.5-turbo', etc.
  maxTokens: number,
  enabled: boolean
}
```

**Database Schema Addition:**
Add new table or use JSON field in Course table:

```prisma
model CourseAIConfig {
  id                   String   @id @default(uuid())
  courseId             String   @unique
  course               Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  
  systemPrompt         String   @db.Text
  contextInstructions  String   @db.Text
  knowledgeBaseUrls    String[] // S3 keys of uploaded knowledge base documents
  temperature          Float    @default(0.7)
  model                String   @default("gpt-4")
  maxTokens            Int      @default(1000)
  enabled              Boolean  @default(true)
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  
  @@map("course_ai_configs")
}
```

**Implementation Steps:**
1. Create migration for CourseAIConfig table
2. Implement AI config service with CRUD operations
3. Create admin API routes
4. Add validation using Zod schemas

---

#### 1.3 Enhance AI Chat API
**File:** `app/api/ai/conversations/[id]/messages/route.ts`

**Changes:**
1. Load course-specific AI configuration
2. Use custom system prompt from admin settings
3. Include knowledge base context in prompts
4. Support video timestamp context
5. Return streaming responses for better UX

**Updated Endpoint:**
```typescript
POST /api/ai/conversations/:conversationId/messages
Body: {
  message: string,
  videoTimestamp?: number,
  lessonId?: string,
  courseId?: string
}

Response: (SSE Stream or regular JSON)
{
  success: true,
  data: {
    messageId: string,
    content: string,
    suggestions: string[],
    relatedAssets: Asset[]
  }
}
```

**Implementation Steps:**
1. Modify AI service to accept custom prompts
2. Implement knowledge base context injection
3. Add conversation history management
4. Implement streaming response support
5. Add error handling and fallbacks

**Files to Modify:**
- `lib/services/ai.service.ts`
- `app/api/ai/conversations/[id]/messages/route.ts`

---

#### 1.4 Asset Download API
**New File:** `app/api/assets/[assetId]/download/route.ts`

**Endpoint:**
```typescript
GET /api/assets/:assetId/download

Response:
- For S3 assets: Redirect to presigned download URL (1 hour expiry)
- For CloudFront: Return CloudFront URL with signed cookies
```

**Implementation Steps:**
1. Verify user enrollment in course
2. Generate S3 presigned URL or CloudFront signed URL
3. Track download analytics
4. Return appropriate redirect or download URL

---

### **Phase 2: Database Schema Updates**

#### 2.1 Migration for AI Configuration
**New File:** `prisma/migrations/YYYYMMDD_add_course_ai_config/migration.sql`

```sql
-- Add CourseAIConfig table
CREATE TABLE "course_ai_configs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL UNIQUE,
  "systemPrompt" TEXT NOT NULL,
  "contextInstructions" TEXT NOT NULL,
  "knowledgeBaseUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "model" TEXT NOT NULL DEFAULT 'gpt-4',
  "maxTokens" INTEGER NOT NULL DEFAULT 1000,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_ai_configs_courseId_fkey" FOREIGN KEY ("courseId") 
    REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "course_ai_configs_courseId_idx" ON "course_ai_configs"("courseId");
```

#### 2.2 Update Prisma Schema
**File:** `prisma/schema.prisma`

Add the CourseAIConfig model and relation to Course model.

---

### **Phase 3: Frontend Component Development**

#### 3.1 Install Video.js
**Command:**
```bash
npm install video.js @types/video.js
npm install videojs-contrib-quality-levels videojs-http-source-selector
```

#### 3.2 Create Enhanced Video Player Component
**New File:** `components/video/videojs-player.tsx`

**Features:**
- Video.js integration with HLS support
- Quality selection
- Playback speed control
- Keyboard shortcuts
- Progress persistence (auto-save every 10 seconds)
- Resume from last position
- Fullscreen support
- Subtitle/caption support

**Component Structure:**
```typescript
interface VideoJsPlayerProps {
  src: string;              // CloudFront URL
  subtitles?: string;       // VTT file URL
  poster?: string;
  onTimeUpdate: (time: number) => void;
  onComplete: () => void;
  initialTime?: number;
  lessonId: string;
  courseId: string;
}

export function VideoJsPlayer({ ... }: VideoJsPlayerProps) {
  // Implementation with Video.js initialization
  // Auto-save progress
  // Handle completion detection
}
```

---

#### 3.3 Create Asset Viewer Component
**New File:** `components/learn/asset-viewer.tsx`

**Purpose:** Intelligent asset rendering based on type

```typescript
interface AssetViewerProps {
  asset: CourseAsset;
  lessonId: string;
  courseId: string;
}

export function AssetViewer({ asset, lessonId, courseId }: AssetViewerProps) {
  // Render based on asset type and MIME type:
  
  // VIDEO -> VideoJsPlayer
  if (asset.type === 'VIDEO' || asset.mimeType?.startsWith('video/')) {
    return <VideoJsPlayer src={asset.cloudfrontUrl} ... />;
  }
  
  // DOCUMENT/PDF -> Preview + Download
  if (asset.mimeType === 'application/pdf') {
    return <PDFViewer src={asset.cloudfrontUrl} downloadUrl={...} />;
  }
  
  // OTHER -> Download button with icon
  return <AssetDownloadCard asset={asset} />;
}
```

**Sub-components:**
- `VideoJsPlayer` - Video playback
- `PDFViewer` - Inline PDF preview (using iframe or react-pdf)
- `AssetDownloadCard` - Download button with file info

---

#### 3.4 Redesign Lesson Learning Page
**File:** `app/learn/[courseId]/[lessonId]/page.tsx`

**New Layout Structure:**

```
┌─────────────────────────────────────────────────────────┐
│  Course Header (Course Title, Progress, Back Button)   │
├─────────────────────────────────┬───────────────────────┤
│                                 │                       │
│    Main Content Area            │   AI Chat Assistant   │
│                                 │   (Collapsible)       │
│  ┌──────────────────────────┐  │   ┌─────────────────┐ │
│  │                          │  │   │ Chat Header     │ │
│  │   Asset Viewer           │  │   ├─────────────────┤ │
│  │   (Video/Document/etc)   │  │   │ Messages        │ │
│  │                          │  │   │                 │ │
│  └──────────────────────────┘  │   │                 │ │
│                                 │   │                 │ │
│  Chapter/Lesson Info            │   │                 │ │
│  Lesson Title, Description      │   ├─────────────────┤ │
│                                 │   │ Input Box       │ │
│  ┌──────────────────────────┐  │   └─────────────────┘ │
│  │  Tabs:                   │  │                       │
│  │  - Overview              │  │                       │
│  │  - Materials (All Assets)│  │                       │
│  │  - Notes                 │  │                       │
│  │  - Transcript            │  │                       │
│  └──────────────────────────┘  │                       │
│                                 │                       │
│  [Previous] [Next] [Complete]  │                       │
└─────────────────────────────────┴───────────────────────┘
```

**Key Features:**
1. Primary asset viewer (largest asset or first video)
2. Tabbed interface for different content types
3. Materials tab showing all downloadable assets
4. AI chat panel (can be collapsed/expanded)
5. Progress bar and completion tracking
6. Navigation to previous/next lessons

---

#### 3.5 Create Materials List Component
**New File:** `components/learn/materials-list.tsx`

**Purpose:** Display all lesson assets with actions

```typescript
interface MaterialsListProps {
  assets: CourseAsset[];
  lessonId: string;
  courseId: string;
  onSelectAsset: (asset: CourseAsset) => void;
}

export function MaterialsList({ assets, onSelectAsset }: MaterialsListProps) {
  return (
    <div className="space-y-2">
      {assets.map(asset => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onClick={() => onSelectAsset(asset)}
        />
      ))}
    </div>
  );
}

// AssetCard shows: icon, title, type badge, size, download button
```

---

#### 3.6 Create AI Chat Panel Component
**New File:** `components/learn/ai-chat-panel.tsx`

**Features:**
- Message history
- Typing indicators
- Markdown support for AI responses
- Video timestamp context (e.g., "At 5:32 in the video...")
- Suggested questions
- Collapsible sidebar
- Auto-scroll to latest message

```typescript
interface AIChatPanelProps {
  courseId: string;
  lessonId: string;
  currentVideoTime?: number;
  isVisible: boolean;
  onToggle: () => void;
}

export function AIChatPanel({ ... }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const sendMessage = async (text: string) => {
    // Create or get conversation
    // Send message with context (video time, lesson info)
    // Handle streaming response
    // Update messages
  };
  
  return (
    <div className={`flex flex-col h-full ${isVisible ? '' : 'hidden'}`}>
      <ChatHeader onClose={onToggle} />
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
```

---

#### 3.7 Create Course View Page
**File:** `app/courses/[id]/page.tsx`

**Purpose:** Display full course structure before learning

**Layout:**
```
┌────────────────────────────────────────────┐
│  Course Header                             │
│  Title, Thumbnail, Description             │
│  [Enroll / Continue Learning] Button       │
├────────────────────────────────────────────┤
│  Course Info Tabs:                         │
│  - Overview (description, outcomes, etc)   │
│  - Curriculum (chapters/lessons)           │
│  - Reviews                                 │
│  - Instructor                              │
├────────────────────────────────────────────┤
│                                            │
│  Curriculum Tab Content:                   │
│  ┌──────────────────────────────────────┐ │
│  │ Chapter 1: Introduction              │ │
│  │   ✓ Lesson 1.1: Overview (Video)     │ │
│  │   ◯ Lesson 1.2: Setup (Video + PDF)  │ │
│  │                                      │ │
│  │ Chapter 2: Advanced Topics          │ │
│  │   ◯ Lesson 2.1: Concepts (Video)     │ │
│  │   ◯ Lesson 2.2: Practice (Document) │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  Progress: [████████░░] 45%               │
└────────────────────────────────────────────┘
```

**Implementation:**
- Show all chapters and lessons
- Display asset type icons (video, document, etc.)
- Show completion status (checkmark or circle)
- Click lesson to navigate to learn page
- Show progress bar
- Enrollment check (show enroll button if not enrolled)

---

### **Phase 4: Admin Interface Enhancements**

#### 4.1 Add AI Configuration Tab to Course Edit Page
**File:** `app/admin/courses/[id]/edit/page.tsx`

**New Tab:** "AI Assistant Configuration"

**Fields:**
- System Prompt (textarea, large)
- Context Instructions (textarea)
- Knowledge Base Files (file upload list)
- Temperature (0-1 slider)
- Model Selection (dropdown: gpt-4, gpt-3.5-turbo, etc.)
- Max Tokens (number input)
- Enabled (toggle switch)

**UI Components:**
```typescript
<Tabs>
  <TabsList>
    <TabsTrigger value="basic">Basic Info</TabsTrigger>
    <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
    <TabsTrigger value="ai-config">AI Assistant</TabsTrigger>
  </TabsList>
  
  <TabsContent value="ai-config">
    <AIConfigForm courseId={courseId} />
  </TabsContent>
</Tabs>
```

#### 4.2 Create AI Config Form Component
**New File:** `components/admin/ai-config-form.tsx`

**Features:**
- Form with all AI configuration fields
- Knowledge base file upload (with preview)
- Template prompts (pre-defined examples)
- Test chat interface (admin can test AI responses)
- Save/Reset buttons

---

### **Phase 5: Integration & Data Flow**

#### 5.1 Remove Mock Data
**Files to Clean:**
- `app/learn/[courseId]/[lessonId]/page.tsx` - Remove hardcoded video URLs
- `app/courses/[id]/page.tsx` - Remove mock course data
- `lib/mock-data.ts` - Review and remove unused mocks

**Replace with:**
- Real API calls to fetch course structure
- CloudFront URLs from database
- Actual user enrollment and progress data

#### 5.2 Update API Client
**File:** `lib/api-client.ts`

**Add new methods:**
```typescript
class ApiClient {
  // ... existing methods ...
  
  // AI Configuration
  async getAIConfig(courseId: string) { ... }
  async updateAIConfig(courseId: string, config: AIConfig) { ... }
  
  // AI Chat
  async createConversation(courseId: string, lessonId?: string) { ... }
  async sendMessage(conversationId: string, message: string, context?: any) { ... }
  async getConversationHistory(conversationId: string) { ... }
  
  // Asset Download
  async getAssetDownloadUrl(assetId: string) { ... }
}
```

---

### **Phase 6: Testing & Validation**

#### 6.1 Test Data Setup
**Script:** `scripts/seed-test-data.ts`

Create script to:
1. Create test admin user
2. Create test course with chapters/lessons
3. Upload sample video file to S3
4. Create course assets (video + documents)
5. Link assets to lessons
6. Create AI configuration for course
7. Create test user and enroll in course

#### 6.2 Integration Tests
**Test Scenarios:**
1. Admin creates course with assets
2. Admin configures AI assistant
3. User enrolls in course
4. User navigates to course view (sees all chapters/lessons)
5. User clicks lesson to start learning
6. Video player loads from CloudFront
7. Progress is tracked automatically
8. User downloads document asset
9. User chats with AI assistant
10. AI uses custom prompts from admin config

#### 6.3 Manual Testing Checklist
- [ ] Admin can upload video files
- [ ] Admin can upload document files
- [ ] Admin can configure AI prompts
- [ ] Course view displays all chapters/lessons correctly
- [ ] Video player works with S3/CloudFront URLs
- [ ] Document download works
- [ ] AI chat responds with custom prompts
- [ ] Progress tracking updates correctly
- [ ] Lesson navigation (prev/next) works
- [ ] Completion status updates

---

### **Phase 7: Deployment & Optimization**

#### 7.1 Performance Optimizations
1. **Lazy Loading:** Components load on demand
2. **Image Optimization:** Use Next.js Image component
3. **Video Preloading:** Intelligent preloading of next lesson
4. **API Caching:** SWR for course data caching
5. **Code Splitting:** Route-based code splitting

#### 7.2 Error Handling
1. Network error fallbacks
2. S3/CloudFront URL expiry handling
3. AI service timeout handling
4. Graceful degradation for unsupported file types

#### 7.3 Monitoring
1. Track video playback metrics
2. Monitor AI response times
3. Log asset download analytics
4. Track user progress completion rates

---

## Implementation Timeline

### Week 1: Backend Foundation
- Day 1-2: Database schema updates and migrations
- Day 3-4: AI Configuration APIs
- Day 5: Enhanced course detail API

### Week 2: Frontend Components
- Day 1-2: Video.js player integration
- Day 3: Asset viewer components
- Day 4-5: AI chat panel component

### Week 3: Page Redesign
- Day 1-2: Course view page redesign
- Day 3-4: Lesson learning page redesign
- Day 5: Admin AI config interface

### Week 4: Integration & Testing
- Day 1-2: Remove mock data, integrate real APIs
- Day 3: Create test data and scenarios
- Day 4-5: Testing, bug fixes, optimization

---

## Success Metrics

1. **User Experience:**
   - Lesson page loads in < 2 seconds
   - Video starts playing in < 1 second
   - AI response time < 3 seconds

2. **Functionality:**
   - 100% of asset types properly handled
   - AI assistant responds with course-specific knowledge
   - Progress tracking accuracy > 99%

3. **Admin Usability:**
   - AI configuration takes < 5 minutes to set upp
   - Asset upload success rate > 95%

---

## Technical Considerations

### Security
1. Validate all file uploads (type, size)
2. Sanitize AI prompts to prevent injection
3. Ensure CloudFront signed URLs/cookies are properly implemented
4. Rate limit AI API calls

### Scalability
1. Use CloudFront caching for assets
2. Implement conversation history pagination
3. Compress large documents before upload
4. Use worker threads for heavy processing

### Browser Compatibility
1. Test Video.js on Chrome, Firefox, Safari, Edge
2. Ensure file download works on all browsers
3. Test responsive design on mobile devices

---

## Rollout Plan

### Phase 1: Internal Testing (Week 4)
- Deploy to staging environment
- Test with internal team (5-10 users)
- Gather feedback

### Phase 2: Beta Launch (Week 5)
- Deploy to production
- Invite 20-30 beta users
- Monitor performance and errors

### Phase 3: General Availability (Week 6)
- Open to all users
- Announce new features
- Provide training materials

---

## Documentation Updates

### User Documentation
1. Create video tutorial: "How to Learn a Course"
2. FAQ document for common issues
3. AI assistant usage guide

### Admin Documentation
1. Course creation guide with AI configuration
2. Best practices for AI prompts
3. Asset upload guidelines

### Developer Documentation
1. API documentation updates
2. Component library documentation
3. Architecture decision records

---

## Maintenance Plan

### Regular Tasks
- Monitor S3 storage usage and costs
- Review AI API usage and costs
- Update Video.js and dependencies
- Backup database regularly

### Quarterly Reviews
- Analyze user engagement metrics
- Review AI assistant conversation quality
- Update AI prompts based on feedback
- Optimize performance bottlenecks

---

## Conclusion

This comprehensive plan provides a step-by-step approach to redesigning the learning interface with real data integration, enhanced video playback, proper asset handling, and configurable AI assistance. The implementation is structured to minimize risks, ensure quality, and deliver a production-ready feature set within 4-6 weeks.
