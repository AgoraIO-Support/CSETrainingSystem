这个文件目录是你生成的整个前端应用代码（基于 Next.js）。  
从现在开始，请你根据这个前端项目，帮我构建完整的后端系统。

以下是目前项目信息：
- 项目名称：internal-training-LMS
- 技术栈偏好：Node.js + TypeScript
- 框架优先：Express 或 Next.js API Routes（我指定为：____）
- 数据库：PostgreSQL（托管方式：RDS / Supabase / Planetscale，请问你建议哪种？）
- ORM：Prisma
- 需要的核心后端功能：
  1. 用户登录注册 + 鉴权
  2. 课程管理
  3. 培训视频播放权限控制
  4. 培训考试（题库、试卷、判卷）
  5. 用户学习进度跟踪
  6. 管理员后台 API
  7. 支持未来扩展（知识库、RAG、AI Assistant）

这个目录CSETrainingSystem是前端项目，
你的任务：
1. 阅读我提供的前端代码结构。
2. 定义完整后端目录结构（/server 或 /api）。
3. 生成：Express/Next.js API 服务的代码模板。
4. 生成：Prisma schema，包括所有模型（User, Course, Lesson, Exam, Question, Progress ……）
5. 生成：数据库迁移命令、开发环境启动命令。
6. 给出：后端最佳实践说明。
7. 持续跟进我的后续需求并保持一致。

所有回答请以工程可执行的方式输出。
