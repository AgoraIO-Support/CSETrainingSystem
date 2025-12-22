# Agora CSE Training System - 部署指南

## 🐳 Podman 部署

### 前置要求

- Podman 已安装 ([安装指南](https://podman.io/getting-started/installation))
- Podman Compose 已安装: `pip3 install podman-compose`
- 已配置 Supabase 数据库
- 已配置 AWS S3 存储桶

### 步骤 1: 环境变量配置

复制环境变量模板并填写实际值：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下必需配置：

```env
# Supabase Database
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# AWS S3
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKI..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET_NAME="agora-cse-training-videos"
AWS_CLOUDFRONT_DOMAIN="xxx.cloudfront.net"

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET="your-secret-key-here"

# AI Service (optional)
OPENAI_API_KEY="sk-..."

# Application
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

### 步骤 2: 构建镜像

使用 Podman 构建应用镜像：

```bash
podman build -t cse-training-system:latest .
```

检查构建的镜像：

```bash
podman images | grep cse-training
```

### 步骤 3: 运行容器

#### 方式 A: 使用 Podman Compose（推荐）

```bash
# 启动所有服务
podman-compose up -d

# 查看日志
podman-compose logs -f app

# 停止服务
podman-compose down
```

#### 方式 B: 直接使用 Podman

```bash
# 创建网络
podman network create cse-training-network

# 运行 Redis
podman run -d \
  --name cse-training-redis \
  --network cse-training-network \
  -v redis-data:/data \
  redis:7-alpine

# 运行应用
podman run -d \
  --name cse-training-app \
  --network cse-training-network \
  -p 3000:3000 \
  --env-file .env \
  cse-training-system:latest
```

### 步骤 4: 运行数据库迁移

应用首次启动时会自动运行迁移。如需手动运行：

```bash
podman exec -it cse-training-app npx prisma migrate deploy
```

### 步骤 5: 验证部署

```bash
# 检查容器状态
podman ps

# 查看应用日志
podman logs cse-training-app

# 健康检查
curl http://localhost:3000/api/health
```

访问应用：http://localhost:3000

## 🚀 生产环境部署

### 使用 Podman Generate Kube

生成 Kubernetes YAML 文件用于生产部署：

```bash
# 生成 Pod 配置
podman generate kube cse-training-app > k8s-deployment.yaml

# 使用 kubectl 部署（如果你有 K8s 集群）
kubectl apply -f k8s-deployment.yaml
```

### 使用 Systemd 管理

创建 systemd 服务以自动启动：

```bash
# 生成 systemd 服务文件
podman generate systemd --new --name cse-training-app > /etc/systemd/system/cse-training.service

# 启用服务
systemctl enable cse-training
systemctl start cse-training
systemctl status cse-training
```

## ☁️ Vercel 部署（替代方案）

Next.js 应用也可直接部署到 Vercel：

### 步骤 1: 连接到 GitHub

1. 将代码推送到 GitHub
2. 登录 [Vercel](https://vercel.com)
3. 导入 GitHub 仓库

### 步骤 2: 配置环境变量

在 Vercel 项目设置中添加所有环境变量（与 .env 相同）

### 步骤 3: 配置构建设置

```
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm install && npx prisma generate
```

### 步骤 4: 部署

Vercel 会自动部署，每次推送到 main 分支都会触发部署。

## 🔧 维护操作

### 更新应用

```bash
# 拉取最新代码
git pull

# 重新构建镜像
podman build -t cse-training-system:latest .

# 重启容器
podman-compose down
podman-compose up -d
```

### 数据库迁移

```bash
# 开发环境 - 创建迁移
npm run prisma:migrate

# 生产环境 - 应用迁移
podman exec cse-training-app npx prisma migrate deploy
```

### 查看 Prisma Studio

```bash
# 在容器中运行 Prisma Studio
podman exec -it cse-training-app npx prisma studio
```

### 备份数据

Supabase 提供自动备份。手动备份：

```bash
# 使用 pg_dump
PGPASSWORD=[password] pg_dump -h db.[project-ref].supabase.co \
  -U postgres -d postgres > backup_$(date +%Y%m%d).sql
```

## 🔍 故障排查

### 容器无法启动

```bash
# 查看详细日志
podman logs cse-training-app --tail 100

# 检查环境变量
podman exec cse-training-app env | grep DATABASE_URL
```

### 数据库连接失败

1. 检查 DATABASE_URL 是否正确
2. 确认 Supabase 项目允许外部连接
3. 检查防火墙设置

### Prisma 错误

```bash
# 重新生成 Prisma Client
podman exec cse-training-app npx prisma generate

# 检查数据库状态
podman exec cse-training-app npx prisma db push
```

## 📊 监控

### 日志查看

```bash
# 实时日志
podman logs -f cse-training-app

# 最近 100 行
podman logs --tail 100 cse-training-app
```

### 资源使用

```bash
# 查看容器资源使用
podman stats cse-training-app
```

### 健康检查

```bash
# API 健康检查
curl http://localhost:3000/api/health

# 数据库连接测试
podman exec cse-training-app npx prisma db execute --stdin < /dev/null
```

## 🔐 安全最佳实践

1. **永远不要提交 .env 文件到版本控制**
2. **使用强密码和密钥**：
   ```bash
   # 生成 JWT Secret
   openssl rand -hex 32
   ```
3. **配置 HTTPS**：使用 Nginx/Caddy 作为反向代理
4. **限制数据库访问**：仅允许应用服务器 IP
5. **定期更新依赖**：
   ```bash
   npm audit
   npm update
   ```
6. **使用环境特定的配置**：开发、测试、生产分开

## 🌐 反向代理配置（可选）

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name training.agora.io;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy 配置示例

```
training.agora.io {
    reverse_proxy localhost:3000
}
```

## 📈 性能优化

1. **启用压缩**（在反向代理配置）
2. **使用 CDN**：CloudFront 已配置用于视频
3. **Redis 缓存**：启用 Redis 用于会话和频繁查询
4. **数据库索引**：Prisma schema 已包含必要索引
5. **Next.js 优化**：
   - Image optimization
   - Static generation where possible
   - Code splitting

## 🛠️ 开发环境设置

```bash
# 安装依赖
npm install

# 生成 Prisma Client
npm run prisma:generate

# 运行迁移
npm run prisma:migrate

# 启动开发服务器
npm run dev
```

## 📝 附加资源

- [Next.js 文档](https://nextjs.org/docs)
- [Prisma 文档](https://www.prisma.io/docs)
- [Supabase 文档](https://supabase.com/docs)
- [Podman 文档](https://docs.podman.io/)
- [AWS S3 文档](https://docs.aws.amazon.com/s3/)

## 💡 技术支持

如遇问题，请查看：
1. 应用日志 (`podman logs`)
2. Supabase Dashboard
3. AWS CloudWatch (S3/CloudFront 日志)
4. 项目 Documentation
