# 数据库 ERD 设计

## 实体关系图 (ASCII)

```
┌─────────────┐
│    User     │
├─────────────┤
│ id (PK)     │
│ email       │
│ name        │
│ role        │
│ status      │
└──────┬──────┘
       │
       │ 1:N
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│ Enrollment  │    │   Course    │
├─────────────┤    ├─────────────┤
│ id (PK)     │N:1 │ id (PK)     │
│ userId (FK) ├───→│ title       │
│ courseId(FK)│    │ slug        │
│ progress    │    │ level       │
│ status      │    │ status      │
└─────────────┘    └──────┬──────┘
                          │
                          │ 1:N
                          │
┌─────────────┐           │
│ LessonProg  │           ▼
├─────────────┤    ┌─────────────┐
│ id (PK)     │    │  Chapter    │
│ userId (FK) │    ├─────────────┤
│ lessonId(FK)│    │ id (PK)     │
│ completed   │    │ courseId(FK)│
│ timestamp   │    │ title       │
└─────────────┘    │ order       │
                   └──────┬──────┘
                          │
                          │ 1:N
                          │
                          ▼
                   ┌─────────────┐
                   │   Lesson    │
                   ├─────────────┤
                   │ id (PK)     │
                   │ chapterId   │
                   │ title       │
                   │ videoUrl    │
                   │ subtitleUrl │
                   │ transcript  │
                   └─────────────┘

┌─────────────┐
│    Quiz     │
├─────────────┤
│ id (PK)     │
│ courseId(FK)│
│ title       │
│ passingScore│
└──────┬──────┘
       │
       │ 1:N
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐ ┌─────────────┐
│  Question   │ │ QuizAttempt │
├─────────────┤ ├─────────────┤
│ id (PK)     │ │ id (PK)     │
│ quizId (FK) │ │ userId (FK) │
│ type        │ │ quizId (FK) │
│ question    │ │ answers     │
│ correctAns  │ │ score       │
└─────────────┘ │ passed      │
                └─────────────┘

┌──────────────┐
│AIConversation│
├──────────────┤
│ id (PK)      │
│ userId (FK)  │
│ courseId     │
│ lessonId     │
└──────┬───────┘
       │
       │ 1:N
       │
       ▼
┌──────────────┐
│  AIMessage   │
├──────────────┤
│ id (PK)      │
│ convId (FK)  │
│ role         │
│ content      │
│ timestamp    │
└──────────────┘

┌──────────────┐
│ Achievement  │
├──────────────┤
│ id (PK)      │
│ title        │
│ criteria     │
└──────┬───────┘
       │
       │ N:M
       │
       ▼
┌──────────────┐
│UserAchievement│
├──────────────┤
│ userId (FK)  │
│ achievId(FK) │
│ earnedAt     │
└──────────────┘
```

## 核心表说明

### 用户相关 (User Domain)
1. **users** - 用户基础信息
2. **enrollments** - 用户课程注册
3. **lesson_progress** - 课时学习进度
4. **user_achievements** - 用户成就

### 课程相关 (Course Domain)
1. **courses** - 课程主表
2. **chapters** - 课程章节
3. **lessons** - 课时（包含视频、字幕）
4. **course_reviews** - 课程评价

### 测验相关 (Quiz Domain)
1. **quizzes** - 测验主表
2. **questions** - 题目
3. **quiz_attempts** - 答题记录

### AI 助手 (AI Domain)
1. **ai_conversations** - AI 对话会话
2. **ai_messages** - 对话消息
3. **ai_prompt_templates** - 提示词模板

### 讨论区 (Discussion Domain)
1. **discussions** - 讨论帖子（支持嵌套回复）

### 分析报告 (Analytics Domain)
1. **learning_reports** - 个性化学习报告
2. **system_analytics** - 系统分析数据
3. **certificates** - 证书

### 通知 (Notification Domain)
1. **notifications** - 系统通知

## 关键索引策略

### 高频查询优化
```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Course browsing
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_category ON courses(category);
CREATE INDEX idx_courses_slug ON courses(slug);

-- Progress tracking
CREATE INDEX idx_enrollments_user_course ON enrollments(userId, courseId);
CREATE INDEX idx_lesson_progress_user ON lesson_progress(userId);

-- Quiz performance
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(userId);
CREATE INDEX idx_quiz_attempts_quiz ON quiz_attempts(quizId);

-- AI conversations
CREATE INDEX idx_ai_conv_user ON ai_conversations(userId);
CREATE INDEX idx_ai_msg_conv ON ai_messages(conversationId);
```

## 数据完整性约束

### 外键约束
- **CASCADE DELETE**: 删除课程时级联删除章节、课时
- **CASCADE DELETE**: 删除用户时级联删除进度、答题记录
- **RESTRICT**: 删除讲师前需先解除课程关联

### 唯一约束
- `users.email` - 邮箱唯一
- `courses.slug` - 课程 slug 唯一
- `enrollments.(userId, courseId)` - 用户不能重复注册同一课程
- `lesson_progress.(userId, lessonId)` - 每个课时只有一条进度记录

### 检查约束
- `quiz_attempts.score` - 0 到 100 之间
- `course_reviews.rating` - 1 到 5 之间
- `courses.rating` - 0 到 5 之间

## 数据容量估算

假设系统规模：
- 1000 用户
- 50 门课程
- 每门课程 20 课时 = 1000 课时
- 每用户平均注册 5 门课程

### 预估存储需求

| 表名 | 预估行数 | 平均行大小 | 总存储 |
|------|---------|-----------|--------|
| users | 1,000 | 1 KB | 1 MB |
| courses | 50 | 2 KB | 100 KB |
| chapters | 250 | 500 B | 125 KB |
| lessons | 1,000 | 5 KB | 5 MB |
| enrollments | 5,000 | 500 B | 2.5 MB |
| lesson_progress | 50,000 | 300 B | 15 MB |
| quiz_attempts | 10,000 | 1 KB | 10 MB |
| ai_messages | 100,000 | 500 B | 50 MB |
| **总计** | | | **~85 MB** |

> **备注**: 实际生产环境需考虑索引占用（约 30-50% 额外空间）

## Migration 策略

### 初始化步骤
```bash
# 1. 安装 Prisma
npm install prisma @prisma/client

# 2. 初始化 Prisma（已完成）
npx prisma init

# 3. 生成迁移
npx prisma migrate dev --name init

# 4. 生成 Prisma Client
npx prisma generate

# 5. 填充种子数据（可选）
npx prisma db seed
```

### 后续迁移
```bash
# 修改 schema 后
npx prisma migrate dev --name <migration_name>

# 生产环境部署
npx prisma migrate deploy
```

## 备份策略

### Supabase 自动备份
- Supabase Pro: 每日自动备份
- 保留 7 天备份

### 手动备份
```bash
# 使用 pg_dump
pg_dump -h db.[project-ref].supabase.co \
        -U postgres \
        -d postgres \
        > backup_$(date +%Y%m%d).sql
```

## 性能优化建议

1. **连接池**: 使用 Prisma 内置连接池（默认配置良好）
2. **查询优化**: 使用 `select` 只获取需要的字段
3. **批量操作**: 使用 `createMany`, `updateMany` 减少数据库往返
4. **缓存**: 热门课程数据使用 Redis 缓存
5. **分页**: 所有列表查询使用分页（`skip` + `take`）

## 下一步

数据库设计已完成。接下来将：
1. ✅ 实现 API 路由
2. ✅ 集成 Supabase Auth
3. ✅ 实现文件上传服务
4. ✅ 创建种子数据
