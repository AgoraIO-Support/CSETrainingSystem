# Backend API 完整设计文档

## API 基础规范

### 1. 通用响应格式

#### 成功响应
```typescript
{
  success: true,
  data: T,  // 实际数据
  message?: string
}
```

#### 错误响应
```typescript
{
  success: false,
  error: {
    code: string,      // 错误代码
    message: string,   // 用户友好的错误消息
    details?: any      // 详细错误信息（开发环境）
  }
}
```

### 2. HTTP 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | OK | 成功获取资源 |
| 201 | Created | 成功创建资源 |
| 204 | No Content | 成功删除资源 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复注册） |
| 500 | Internal Server Error | 服务器错误 |

### 3. 认证方式

所有需要认证的 API 使用 Bearer Token：

```
Authorization: Bearer <JWT_TOKEN>
```

## API 端点清单

### 认证相关 (Authentication)

#### 1. 用户注册
```
POST /api/auth/register
```

**公开访问**: ✅ 是

**请求体**:
```typescript
{
  email: string;        // 必填，邮箱格式
  password: string;     // 必填，最少 8 位
  name: string;         // 必填
  department?: string;  // 可选
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    user: {
      id: string;
      email: string;
      name: string;
      role: 'USER' | 'ADMIN';
    },
    session: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  }
}
```

**错误情况**:
- `400`: 参数验证失败
- `409`: 邮箱已存在

---

#### 2. 用户登录
```
POST /api/auth/login
```

**公开访问**: ✅ 是

**请求体**:
```typescript
{
  email: string;
  password: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    user: User;
    session: Session;
  }
}
```

**错误情况**:
- `400`: 参数错误
- `401`: 邮箱或密码错误

---

#### 3. 刷新 Token
```
POST /api/auth/refresh
```

**请求体**:
```typescript
{
  refreshToken: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    accessToken: string;
    expiresIn: number;
  }
}
```

---

#### 4. 登出
```
POST /api/auth/logout
```

**认证**: ✅ 必需

**响应**:
```typescript
{
  success: true,
  message: "Logged out successfully"
}
```

---

#### 5. 获取当前用户
```
GET /api/auth/me
```

**认证**: ✅ 必需

**响应**:
```typescript
{
  success: true,
  data: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: UserRole;
    // ... 其他用户信息
  }
}
```

---

### 课程相关 (Courses)

#### 6. 获取课程列表
```
GET /api/courses
```

**公开访问**: ✅ 是

**查询参数**:
```typescript
{
  page?: number;          // 页码，默认 1
  limit?: number;         // 每页数量，默认 10
  category?: string;      // 分类筛选
  level?: CourseLevel;    // 难度筛选
  search?: string;        // 关键词搜索
  status?: CourseStatus;  // 状态（管理员可见）
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    courses: Course[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }
  }
}
```

---

#### 7. 获取课程详情
```
GET /api/courses/:id
```

**公开访问**: ✅ 是

**路径参数**:
- `id`: 课程 ID

**响应**:
```typescript
{
  success: true,
  data: {
    ...Course,
    chapters: Chapter[],    // 包含课时列表
    isEnrolled: boolean,    // 用户是否已注册
    progress?: number       // 用户进度（如已注册）
  }
}
```

---

#### 8. 注册课程
```
POST /api/courses/:id/enroll
```

**认证**: ✅ 必需  
**角色**: USER

**路径参数**:
- `id`: 课程 ID

**响应**:
```typescript
{
  success: true,
  data: {
    enrollment: Enrollment;
  },
  message: "Successfully enrolled in course"
}
```

**错误情况**:
- `404`: 课程不存在
- `409`: 已经注册过该课程

---

#### 9. 创建课程（管理员）
```
POST /api/courses
```

**认证**: ✅ 必需  
**角色**: ADMIN

**请求体**:
```typescript
{
  title: string;
  slug: string;
  description: string;
  thumbnail?: string;
  level: CourseLevel;
  category: string;
  tags: string[];
  instructorId: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: Course,
  message: "Course created successfully"
}
```

---

#### 10. 更新课程（管理员）
```
PATCH /api/courses/:id
```

**认证**: ✅ 必需  
**角色**: ADMIN

**请求体**: 同创建课程（所有字段可选）

---

#### 11. 删除课程（管理员）
```
DELETE /api/courses/:id
```

**认证**: ✅ 必需  
**角色**: ADMIN

---

### 课时与学习进度 (Lessons & Progress)

#### 12. 获取课时详情（含视频URL）
```
GET /api/lessons/:id
```

**认证**: ✅ 必需  
**角色**: USER（需已注册课程）

**响应**:
```typescript
{
  success: true,
  data: {
    ...Lesson,
    videoUrl: string,       // S3 签名 URL（1小时有效）
    subtitleUrl?: string,   // VTT 签名 URL
    transcript?: string,    // 字幕文本
    progress?: LessonProgress  // 用户学习进度
  }
}
```

---

#### 13. 更新学习进度
```
POST /api/progress/lessons/:lessonId
```

**认证**: ✅ 必需

**请求体**:
```typescript
{
  watchedDuration: number;   // 已观看时长（秒）
  lastTimestamp: number;     // 最后播放位置
  completed?: boolean;       // 是否完成
}
```

**响应**:
```typescript
{
  success: true,
  data: LessonProgress
}
```

---

#### 14. 获取课程进度
```
GET /api/progress/courses/:courseId
```

**认证**: ✅ 必需

**响应**:
```typescript
{
  success: true,
  data: {
    courseId: string;
    overallProgress: number;  // 总进度百分比
    completedLessons: number;
    totalLessons: number;
    lessonProgress: LessonProgress[];
    enrollment: Enrollment;
  }
}
```

---

### 测验系统 (Quizzes)

#### 15. 获取课程测验列表
```
GET /api/courses/:courseId/quizzes
```

**认证**: ✅ 必需

**响应**:
```typescript
{
  success: true,
  data: {
    quizzes: Quiz[];  // 不包含题目和答案
  }
}
```

---

#### 16. 开始测验
```
POST /api/quizzes/:id/start
```

**认证**: ✅ 必需

**响应**:
```typescript
{
  success: true,
  data: {
    quiz: {
      id: string;
      title: string;
      timeLimit?: number;
      questions: {
        id: string;
        type: QuestionType;
        question: string;
        options?: string[];  // 选项（不包含正确答案）
        points: number;
      }[];
    },
    attemptId: string;  // 答题记录 ID
    startedAt: Date;
  }
}
```

---

#### 17. 提交测验
```
POST /api/quizzes/:id/submit
```

**认证**: ✅ 必需

**请求体**:
```typescript
{
  attemptId: string;
  answers: {
    [questionId: string]: string | number;
  };
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    attempt: QuizAttempt;
    score: number;
    passed: boolean;
    feedback: {
      questionId: string;
      isCorrect: boolean;
      correctAnswer: string;
      explanation?: string;
    }[];
  }
}
```

---

#### 18. 获取测验结果
```
GET /api/quizzes/attempts/:attemptId
```

**认证**: ✅ 必需

**响应**: 同提交测验响应

---

### AI 助手 (AI Assistant)

#### 19. 创建 AI 对话
```
POST /api/ai/conversations
```

**认证**: ✅ 必需

**请求体**:
```typescript
{
  courseId?: string;
  lessonId?: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    conversation: AIConversation;
  }
}
```

---

#### 20. 发送消息给 AI
```
POST /api/ai/conversations/:id/messages
```

**认证**: ✅ 必需

**请求体**:
```typescript
{
  message: string;
  videoTimestamp?: number;  // 如果在观看视频时提问
  context?: any;            // 额外上下文
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    userMessage: AIMessage;
    assistantMessage: AIMessage;
    suggestions?: string[];  // AI 建议的后续问题
  }
}
```

---

#### 21. 获取对话历史
```
GET /api/ai/conversations/:id/messages
```

**认证**: ✅ 必需

**响应**:
```typescript
{
  success: true,
  data: {
    messages: AIMessage[];
  }
}
```

---

### 文件上传 (File Upload)

#### 22. 获取视频上传签名URL（管理员）
```
POST /api/upload/video/presigned-url
```

**认证**: ✅ 必需  
**角色**: ADMIN

**请求体**:
```typescript
{
  filename: string;
  contentType: string;  // video/mp4
  lessonId?: string;    // 关联的课时ID
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    uploadUrl: string;     // S3 预签名上传 URL
    key: string;           // S3 对象 key
    expiresIn: number;     // URL 有效期（秒）
  }
}
```

---

#### 23. 确认文件上传
```
POST /api/upload/video/confirm
```

**认证**: ✅ 必需  
**角色**: ADMIN

**请求体**:
```typescript
{
  key: string;
  lessonId: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    lesson: Lesson;
    videoUrl: string;  // CloudFront URL
  }
}
```

---

### 管理员功能 (Admin)

#### 24. 获取系统分析数据
```
GET /api/admin/analytics
```

**认证**: ✅ 必需  
**角色**: ADMIN

**查询参数**:
```typescript
{
  startDate?: string;  // ISO 日期
  endDate?: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    totalUsers: number;
    activeUsers: number;
    totalCourses: number;
    totalEnrollments: number;
    completionRate: number;
    recentActivity: SystemAnalytics[];
  }
}
```

---

#### 25. 用户管理列表
```
GET /api/admin/users
```

**认证**: ✅ 必需  
**角色**: ADMIN

**查询参数**: 支持分页和搜索

**响应**:
```typescript
{
  success: true,
  data: {
    users: User[];
    pagination: Pagination;
  }
}
```

---

#### 26. 更新用户角色/状态
```
PATCH /api/admin/users/:id
```

**认证**: ✅ 必需  
**角色**: ADMIN

**请求体**:
```typescript
{
  role?: UserRole;
  status?: UserStatus;
}
```

---

### 通知系统 (Notifications)

#### 27. 获取用户通知
```
GET /api/notifications
```

**认证**: ✅ 必需

**查询参数**:
```typescript
{
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    notifications: Notification[];
    unreadCount: number;
    pagination: Pagination;
  }
}
```

---

#### 28. 标记通知为已读
```
PATCH /api/notifications/:id/read
```

**认证**: ✅ 必需

---

### 报告生成 (Reports)

#### 29. 生成学习报告
```
POST /api/reports/generate
```

**认证**: ✅ 必需

**请求体**:
```typescript
{
  courseId: string;
}
```

**响应**:
```typescript
{
  success: true,
  data: {
    report: LearningReport;
    pdfUrl?: string;
    htmlContent?: string;
  }
}
```

---

## 错误代码表

| 错误代码 | HTTP状态 | 描述 |
|---------|---------|------|
| `AUTH_001` | 401 | 未提供认证令牌 |
| `AUTH_002` | 401 | 令牌无效或已过期 |
| `AUTH_003` | 403 | 权限不足 |
| `AUTH_004` | 409 | 邮箱已存在 |
| `AUTH_005` | 401 | 用户名或密码错误 |
| `COURSE_001` | 404 | 课程不存在 |
| `COURSE_002` | 409 | 已注册该课程 |
| `COURSE_003` | 403 | 未注册课程，无法访问 |
| `QUIZ_001` | 404 | 测验不存在 |
| `QUIZ_002` | 400 | 测验时间已到 |
| `UPLOAD_001` | 400 | 文件类型不支持 |
| `UPLOAD_002` | 413 | 文件过大 |
| `SYSTEM_001` | 500 | 服务器内部错误 |

## 实现优先级

### Phase 1 - 核心功能（MVP）
- ✅ 认证系统（注册、登录、Token）
- ✅ 课程 CRUD
- ✅ 课程注册与进度追踪
- ✅ 视频访问控制

### Phase 2 - 测验与评估
- ✅ 测验系统
- ✅ 自动判卷
- ✅ 成绩记录

### Phase 3 - AI 功能
- ✅ AI 对话
- ✅ 上下文理解
- ✅ 推荐系统

### Phase 4 - 扩展功能
- ✅ 报告生成
- ✅ 通知系统
- ✅ 讨论区
- ✅ 管理员分析

## 下一步

本文档提供完整的 API 设计。接下来将：
1. ✅ 实现认证中间件
2. ✅ 实现各 API 路由
3. ✅ 集成 AWS S3
4. ✅ 集成 AI 服务
