# Logging Guide (CSETrainingSystem)

本文档总结本项目（Web + Backend + Postgres）在 **Podman 容器**中的日志行为：日志从哪些代码文件产生、如何查看、以及常用过滤关键字/方法。

## 1. 日志从哪里来（代码文件）

### Web（`cselearning-web`，Next.js）

**结构化日志工具**
- `lib/logger.ts`：统一的结构化 JSON 日志输出（`log()` / `timeAsync()`）。
- `lib/prisma.ts`：可选 Prisma DB 操作日志（`category=DB message=prisma`）。

**常见会打日志的服务/模块（非穷举）**
- `lib/services/vtt-to-xml.service.ts`：VTT→XML 的 Step 1~5（`category=KnowledgeContext`）。
- `lib/services/knowledge-context.service.ts`：XML 生成/缓存/S3 写入/失效（`category=KnowledgeContext`）。
- `lib/services/file.service.ts`：S3 上传/删除（`category=S3`）。
- `lib/services/ai.service.ts`：AI assistant 运行模式选择 + OpenAI 调用（`category=AIService` / `OpenAI`）。
- `lib/services/exam-generation.service.ts`：生成题目（`category=OpenAI`）。
- `lib/services/exam-grading.service.ts`：AI essay 评分（`category=OpenAI`）。

### Worker（`cselearning-worker`，async jobs）

**脚本入口**
- `scripts/transcript-worker.ts`：后台异步任务 worker（同时处理两类 job）：
  - `TranscriptProcessingJob`（Legacy RAG/embeddings）
  - `KnowledgeContextJob`（VTT→XML→Knowledge Context）

**关键点（非常重要）**
- 当你点击 Admin 页面里的 **Upload and Process**：
  - Web 容器（`cselearning-web`）只负责 **enqueue job**（快速返回）。
  - 真正执行 VTT→XML、调用 OpenAI、写入 S3/DB 的日志会出现在 **worker 容器**里。
  - 所以要看 `category=KnowledgeContext` / `category=OpenAI`，通常应该看 `podman logs -f cselearning-worker`。

### Backend（`cselearning-backend`，Fastify）

**HTTP/请求日志（Fastify/pino）**
- `backend/src/app.ts`：`Fastify({ logger: true })`，自动输出 pino JSON（如 `msg:"incoming request"` / `msg:"request completed"` / `reqId` 等）。

**结构化业务日志工具**
- `backend/src/logger.ts`：与 Web 类似的 JSON 日志工具（`log()` / `timeAsync()`）。
- `backend/src/prisma.ts`：可选 Prisma DB 操作日志（`category=DB message=prisma`）。

### Postgres（`cselearning-postgres`）

由 Postgres 自身输出（启动、连接、错误、checkpoint 等）。

## 2. 日志格式（你会看到两种 JSON）

### 2.1 Web/Backend 自定义结构化日志（`lib/logger.ts` / `backend/src/logger.ts`）

每条日志是一行 JSON 字符串，形如：

```json
{
  "t": "2026-01-12T11:49:33.300Z",
  "level": "info",
  "category": "KnowledgeContext",
  "message": "VTTToXML Step 1: parsed VTT cues",
  "meta": { "...": "..." }
}
```

`category` 当前包含（Web 额外有 `AIService` / `KnowledgeContext`）：
- `API` / `DB` / `S3` / `OpenAI` / `AIService` / `KnowledgeContext`

> 安全：日志工具会对常见敏感字段做脱敏（例如 `authorization`、`password`、`aws_secret_access_key` 等）。

### 2.2 Backend Fastify/pino 请求日志（`backend/src/app.ts`）

也是 JSON，但字段风格不同，常见字段：
- `level`（数字）、`time`、`pid`、`hostname`
- `reqId`、`req`、`res`、`msg`

示例（真实输出类似你之前贴的）：
```json
{"level":30,"time":1767701073445,"pid":1,"hostname":"...","msg":"Server listening at http://0.0.0.0:8080"}
{"level":30,"time":...,"reqId":"req-1","req":{"method":"DELETE","url":"/api/admin/..."},"msg":"incoming request"}
```

## 3. 怎么查看日志（Podman）

### Web
- 实时跟随：`podman logs -f cselearning-web`
- 最近 200 行：`podman logs --tail 200 cselearning-web`

### Backend
- 实时跟随：`podman logs -f cselearning-backend`
- 最近 200 行：`podman logs --tail 200 cselearning-backend`

### Postgres
- 实时跟随：`podman logs -f cselearning-postgres`

### Worker（异步任务）
- 实时跟随：`podman logs -f cselearning-worker`
- 最近 200 行：`podman logs --tail 200 cselearning-worker`

### 重要提示：前端（浏览器）日志不在容器里

如果日志来自 React 组件的浏览器端代码（例如 `useEffect` 里的 `console.log`），它只会出现在 **Chrome DevTools Console**，不会出现在 `podman logs`。

`podman logs` 里能看到的主要是：
- Next.js **服务器端**（Route Handlers、Server Actions、Node 运行时）输出
- Fastify backend 输出

## 4. 常用过滤方式（推荐）

### 4.1 纯文本过滤（最快）

过滤出 KnowledgeContext：
- `podman logs -f cselearning-worker | rg '"category":"KnowledgeContext"'`

过滤出 OpenAI：
- `podman logs -f cselearning-worker | rg '"category":"OpenAI"'`
- `podman logs -f cselearning-backend | rg '"category":"OpenAI"'`

过滤出 S3：
- `podman logs -f cselearning-web | rg '"category":"S3"'`
- `podman logs -f cselearning-worker | rg '"category":"S3"'`

过滤后端某个请求：
- `podman logs -f cselearning-backend | rg 'reqId|incoming request|request completed'`

### 4.2 JSON 过滤（需要 jq；兼容混合输出）

如果你安装了 `jq`，推荐用 `fromjson?` 兼容非 JSON 行：

只看 KnowledgeContext：
- `podman logs -f cselearning-web | jq -R 'fromjson? | select(.category=="KnowledgeContext")'`

只看 OpenAI error：
- `podman logs -f cselearning-web | jq -R 'fromjson? | select(.category=="OpenAI" and .level=="error")'`

## 5. 关键字/关键分类（排查时用）

### Web 常见关键字

- **VTT→XML（Knowledge Context）**
  - `category=KnowledgeContext`
  - `message` 常见：
    - `VTTToXML Step 1:` / `Step 2:` / `Step 3:` / `Step 4:` / `Step 5:`
    - `Starting XML generation`
    - `Stored XML to S3`
    - `Context invalidated`

- **OpenAI 调用**
  - `category=OpenAI`
  - `message` 常见：
    - `chat.completions request`
    - `chat.completions response`
    - `chat.completions error`
    - `exam-generation chat.completions request/response`
    - `exam-grading chat.completions request/response`

- **S3 操作**
  - `category=S3`
  - `message` 常见：
    - `deleteObject` / `deleteObjects` / `listObjectsV2`
    - `deleteObjects batch`（如果你看到这个，说明确实在尝试删除对象）

- **DB（Prisma）**
  - `category=DB`
  - `message=prisma`
  - `meta.model` / `meta.action` / `meta.durationMs`

### Backend 常见关键字

- **HTTP 请求链路**
  - pino：`incoming request` / `request completed`
  - `reqId`：定位单个请求的完整生命周期

## 6. 关键环境变量（控制输出）

### 通用（Web 与 Backend 都适用）

- `CSE_LOG`
  - 默认：`NODE_ENV!=production` 时为 `all`；生产默认 `none`
  - 可选值：
    - `all` / `on` / `1`：输出所有 category
    - `none` / `off` / `0`：关闭
    - `api,db,s3,openai,aiservice,knowledgecontext`：只输出指定分类（逗号分隔，大小写不敏感）

- `CSE_LOG_MAX_CHARS`
  - 控制 `meta` 输出长度（默认 4000 字符；`0` 表示不截断）。

### DB 日志
- `CSE_DB_LOG=1`：强制开启 Prisma 中间件日志（`category=DB message=prisma`）。
- `CSE_DB_QUERY_LOG=1`：在开发模式下增加 Prisma query log（注意会非常吵）。

### OpenAI 内容级日志（慎用）
- `CSE_OPENAI_LOG_CONTENT=1`
  - 会输出请求体/响应体/`message.content`（可能包含敏感内容、成本较高、日志量很大）。
  - 仅建议在本地短时间开启排查。

## 7. 快速排查模板（最常用）

### 7.1 “按钮点了但一直 Pending / 没动静”
1. 先确认请求落到哪个服务：
   - Next API → 看 `podman logs -f cselearning-web`
   - Fastify API → 看 `podman logs -f cselearning-backend`（应出现 `incoming request`）
   - **异步任务**（VTT→XML/OpenAI/S3/DB）→ 看 `podman logs -f cselearning-worker`
2. 过滤关键分类：
   - VTT/Knowledge Context：`'"category":"KnowledgeContext"'`
   - S3：`'"category":"S3"'`
   - DB：`'"category":"DB"'`

### 7.2 “S3 没删干净 / 403 / credential error”
1. 过滤 S3：`podman logs -f cselearning-web | rg '"category":"S3"'`
2. 看 `meta.bucket / meta.prefix / meta.keysCount / meta.error`。



本地运行时，Example:
podman run -d --name cselearning-web --network cselearning -p 3000:3000 \
--env-file tmp/podman/local.env \
-v "$HOME/.aws:/root/.aws:ro" \
-e AWS_PROFILE=default \
-e AWS_SDK_LOAD_CONFIG=1 \
-e CSE_LOG=api,db,s3,knowledgecontext,openai \
-e CSE_OPENAI_LOG_CONTENT=1 \
-e CSE_DB_LOG=1 \
localhost/cselearning-web:latest


# Worker（把任务日志留在 Podman 里，便于 `podman logs` 查看）
# 说明：
# - worker 需要执行 `tsx scripts/transcript-worker.ts`
# - 推荐复用 `cselearning-migrator:latest`（包含 dev deps + tsx），并把源码挂载到 /workspace
podman run -d --name cselearning-worker --network cselearning \
  --env-file tmp/podman/local.env \
  -v "$PWD:/workspace:ro" \
  -v cselearning-workspace-node_modules:/workspace/node_modules \
  -w /workspace \
  -e NODE_PATH=/app/node_modules \
  -e PATH="/app/node_modules/.bin:$PATH" \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=default \
  -e AWS_SDK_LOAD_CONFIG=1 \
  -e CSE_LOG=api,db,s3,knowledgecontext,openai \
  -e CSE_OPENAI_LOG_CONTENT=1 \
  cselearning-migrator:latest tsx scripts/transcript-worker.ts


podman logs -f cselearning-web | rg '"category":"KnowledgeContext"|\"category\":\"S3\"|\"category\":\"DB\"|\"category\":\"API\"'
podman logs -f cselearning-worker | rg '"category":"KnowledgeContext"|\"category\":\"OpenAI\"|\"category\":\"S3\"|\"category\":\"DB\"'
