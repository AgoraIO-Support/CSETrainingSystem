# 🏗️ Agora CSE Training System - 系统架构文档

## 1. 总体架构说明

### 1.1 技术栈总览

```
┌─────────────────────────────────────────────────────────────┐
│                    技术栈 Tech Stack                          │
├─────────────────────────────────────────────────────────────┤
│ Frontend:   Next.js 15 + TypeScript + TailwindCSS           │
│ Backend:    Next.js API Routes (Server-side)                │
│ Database:   PostgreSQL (via Supabase)                       │
│ ORM:        Prisma                                           │
│ Auth:       Supabase Auth + JWT                             │
│ Storage:    AWS S3 + CloudFront (CDN)                       │
│ AI:         Agora Convo AI + OpenAI/Anthropic              │
│ Cache:      Redis (optional, for session/rate limit)        │
│ Deploy:     Podman + Vercel (optional)                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 系统分层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        客户端层 (Client Layer)                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React Components (Next.js App Router)                     │  │
│  │  - Pages (Dashboard, Courses, Video Player, Admin)        │  │
│  │  - UI Components (shadcn/ui)                              │  │
│  │  - State Management (React Hooks, SWR)                    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                    API 网关层 (API Gateway Layer)                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Next.js API Routes (/app/api/*)                          │  │
│  │  - Authentication Middleware                               │  │
│  │  - Rate Limiting                                          │  │
│  │  - Request Validation (Zod)                               │  │
│  │  - Error Handling                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    业务逻辑层 (Business Logic Layer)               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Services (lib/services/*)                                │  │
│  │  ┌──────────────┬──────────────┬──────────────┐           │  │
│  │  │ UserService  │CourseService │  AIService   │           │  │
│  │  ├──────────────┼──────────────┼──────────────┤           │  │
│  │  │QuizService   │ProgressSvc  │  FileService │           │  │
│  │  └──────────────┴──────────────┴──────────────┘           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    数据访问层 (Data Access Layer)                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Prisma Client (lib/prisma.ts)                            │  │
│  │  - Repository Pattern                                      │  │
│  │  - Query Optimization                                      │  │
│  │  - Transaction Management                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      基础设施层 (Infrastructure Layer)             │
│ ┌───────────────┐  ┌───────────────┐  ┌────────────────┐        │
│ │   Supabase    │  │   AWS S3 +    │  │  AI Services   │        │
│ │  PostgreSQL   │  │  CloudFront   │  │ - Agora Convo  │        │
│ │  + Auth       │  │  (Videos/VTT) │  │ - OpenAI/LLM   │        │
│ └───────────────┘  └───────────────┘  └────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 核心组件关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐        │
│  │  Dashboard   │  │   Courses    │  │  Video Player   │        │
│  │    Pages     │  │    Pages     │  │   + AI Chat     │        │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘        │
│         │                 │                    │                 │
│         └─────────────────┴────────────────────┘                 │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │ API Calls (fetch/axios)
┌───────────────────────────┼──────────────────────────────────────┐
│                   API Routes (/app/api/*)                         │
│  ┌────────────────────────┼──────────────────────────┐            │
│  │  Auth Middleware       ▼                          │            │
│  │    ┌────────────────────────────────────┐         │            │
│  │    │   /api/auth/*                      │         │            │
│  │    │   /api/courses/*                   │         │            │
│  │    │   /api/progress/*                  │         │            │
│  │    │   /api/quiz/*                      │         │            │
│  │    │   /api/ai/*                        │         │            │
│  │    │   /api/admin/*                     │         │            │
│  │    └────────────┬───────────────────────┘         │            │
│  └─────────────────┼─────────────────────────────────┘            │
└────────────────────┼──────────────────────────────────────────────┘
                     │
        ┌────────────┴───────────────┐
        │                            │
        ▼                            ▼
┌────────────────┐          ┌─────────────────┐
│   Services     │          │  External APIs  │
│  - UserService │          │  - AWS S3       │
│  - CourseServ. │          │  - Supabase     │
│  - QuizService │          │  - OpenAI       │
│  - AIService   │          │  - Agora Convo  │
└────────┬───────┘          └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Prisma Client   │
│  (ORM Layer)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Supabase      │
│   PostgreSQL    │
└─────────────────┘
```

## 2. 数据流架构

### 2.1 用户认证流程

```
┌──────────┐                ┌──────────┐              ┌───────────┐
│  Client  │                │   API    │              │ Supabase  │
│ (Browser)│                │  Routes  │              │   Auth    │
└────┬─────┘                └────┬─────┘              └─────┬─────┘
     │                           │                          │
     │  POST /api/auth/login     │                          │
     ├──────────────────────────>│                          │
     │  { email, password }      │                          │
     │                           │  supabase.auth.signIn()  │
     │                           ├─────────────────────────>│
     │                           │                          │
     │                           │  { user, session, jwt }  │
     │                           │<─────────────────────────┤
     │                           │                          │
     │  { accessToken, refresh } │                          │
     │<──────────────────────────┤                          │
     │                           │                          │
     │  Subsequent API calls     │                          │
     │  Authorization: Bearer    │                          │
     ├──────────────────────────>│                          │
     │                           │  Verify JWT              │
     │                           ├─────────────────────────>│
     │                           │  { valid, user }         │
     │                           │<─────────────────────────┤
     │                           │                          │
     │  Response                 │                          │
     │<──────────────────────────┤                          │
```

### 2.2 视频学习流程

```
┌──────┐        ┌─────────┐       ┌──────────┐      ┌───────┐
│Client│        │Next API │       │ Supabase │      │AWS S3 │
└───┬──┘        └────┬────┘       └────┬─────┘      └───┬───┘
    │                │                 │                 │
    │ GET /api/courses/:id/lessons/:lid                 │
    ├───────────────>│                 │                 │
    │                │ Check enrollment│                 │
    │                ├────────────────>│                 │
    │                │ { enrolled }    │                 │
    │                │<────────────────┤                 │
    │                │                                   │
    │                │ Generate S3 Signed URL            │
    │                ├──────────────────────────────────>│
    │                │ { signedUrl, vttUrl }             │
    │                │<──────────────────────────────────┤
    │                │                                   │
    │ { videoUrl, transcript, aiContext }               │
    │<───────────────┤                                   │
    │                                                    │
    │ Stream video from CloudFront                       │
    ├───────────────────────────────────────────────────>│
```

### 2.3 AI 助手交互流程

```
┌──────┐      ┌─────────┐     ┌──────────┐     ┌────────┐
│Client│      │Next API │     │ Supabase │     │LLM API │
└───┬──┘      └────┬────┘     └────┬─────┘     └───┬────┘
    │              │               │               │
    │ POST /api/ai/chat             │               │
    │ { message, videoId, timestamp}│               │
    ├─────────────>│               │               │
    │              │ Get video context             │
    │              ├──────────────>│               │
    │              │ { transcript, metadata }      │
    │              │<──────────────┤               │
    │              │                               │
    │              │ Build context + prompt        │
    │              ├──────────────────────────────>│
    │              │ { completion }                │
    │              │<──────────────────────────────┤
    │              │                               │
    │              │ Store conversation            │
    │              ├──────────────>│               │
    │              │                               │
    │ { response, suggestions }    │               │
    │<─────────────┤                               │
```

## 3. 安全架构

### 3.1 认证与授权

```
┌────────────────────────────────────────────────────────┐
│                 Authentication Flow                     │
├────────────────────────────────────────────────────────┤
│  1. User Login → Supabase Auth                         │
│  2. Get JWT (Access Token) + Refresh Token            │
│  3. Store tokens in httpOnly cookies                  │
│  4. Each API call validates JWT                        │
│  5. Role-based access control (RBAC)                  │
│     - User: courses, progress, quizzes                │
│     - Admin: + course mgmt, user mgmt, analytics      │
└────────────────────────────────────────────────────────┘
```

### 3.2 数据保护

- **密码**: Supabase 自动使用 bcrypt 哈希
- **JWT**: 使用 HS256/RS256 签名，设置合理过期时间   (Access: 15min, Refresh: 7d)
- **API Rate Limiting**: 防止暴力攻击
- **Input Validation**: 所有输入使用 Zod 验证
- **S3 Signed URLs**: 视频访问使用临时签名 URL（1小时有效）
- **CORS**: 严格的跨域策略
- **SQL Injection**: Prisma ORM 自动防护

## 4. 可扩展性设计

### 4.1 横向扩展

```
┌──────────────────────────────────────────────────────┐
│         Load Balancer (AWS ALB / Nginx)              │
└──────────────────┬───────────────────────────────────┘
                   │
        ┌──────────┴──────────┬──────────┐
        ▼                     ▼          ▼
┌──────────────┐      ┌──────────────┐  ...
│  Next.js     │      │  Next.js     │
│  Instance 1  │      │  Instance 2  │
└──────┬───────┘      └──────┬───────┘
       │                     │
       └──────────┬──────────┘
                  ▼
          ┌───────────────┐
          │   Supabase    │
          │  (Connection  │
          │    Pooling)   │
          └───────────────┘
```

### 4.2 缓存策略

- **CDN**: CloudFront 缓存静态视频内容
- **API Response**: SWR (stale-while-revalidate) 客户端缓存
- **Database**: Prisma query caching
- **Redis** (可选): Session store, rate limiting

## 5. 监控与可观测性

```
┌────────────────────────────────────────────────┐
│  Application Monitoring                        │
├────────────────────────────────────────────────┤
│  - Logs: Structured JSON logging              │
│  - Metrics: API latency, error rates          │
│  - Tracing: Request flow tracking             │
│  - Alerts: Error thresholds, performance      │
│                                                │
│  Tools (建议):                                  │
│  - Vercel Analytics (if deployed on Vercel)   │
│  - Sentry (Error tracking)                    │
│  - Supabase Dashboard (DB metrics)            │
│  - AWS CloudWatch (S3, CloudFront)            │
└────────────────────────────────────────────────┘
```

## 6. 部署架构

### 6.1 Podman 容器化部署

```
┌──────────────────────────────────────────────────────────┐
│                    Podman Pod                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Next.js Application Container            │  │
│  │  - Port: 3000                                      │  │
│  │  - Env: DATABASE_URL, AWS_*, SUPABASE_*           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Redis Container (optional)                 │  │
│  │  - Port: 6379                                      │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌────────────────────┐
              │  External Services │
              │  - Supabase        │
              │  - AWS S3          │
              │  - OpenAI/Agora    │
              └────────────────────┘
```

### 6.2 生产环境架构（可选）

```
Internet
   │
   ▼
┌──────────────┐
│ CloudFlare / │  ← DDoS protection, CDN
│  AWS Route53 │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Vercel     │  ← Next.js hosting (recommended)
│   or         │
│   AWS ECS    │  ← Container hosting (Podman → Docker)
└──────┬───────┘
       │
       ├──────────> Supabase (Database + Auth)
       ├──────────> AWS S3 + CloudFront (Files)
       └──────────> OpenAI / Agora APIs
```

## 7. 成本估算

| 服务 | 预估成本 (月) | 说明 |
|------|--------------|------|
| Supabase (Pro) | $25 | 包含 8GB 数据库 + Auth + 100GB 传输 |
| AWS S3 | $5-20 | 取决于视频存储量 |
| CloudFront | $10-50 | 取决于流量 |
| Vercel (Pro) | $20 | Next.js 托管 (或自托管 $0) |
| OpenAI API | $10-100 | 取决于 AI 交互量 |
| Agora Convo AI | 按使用计费 | 参考 Agora 定价 |
| **总计** | **$70-215/月** | 初期小规模 |

## 下一步

本文档提供系统架构总览。接下来将生成：
1. ✅ 完整 Prisma Schema
2. ✅ API 端点详细设计
3. ✅ 实现代码
4. ✅ 部署配置
