  0) 前置

  - 安装 Podman（macOS 会用 VM）：podman machine start
  - 进入项目：cd /Users/zhonghuang/Documents/CSETrainingSystem

  1) 准备 AWS S3（必须）

     1. 在 AWS 创建一个 S3 bucket（例如 cse-training-bucket），确认 Region（例如 ap-southeast-1）。
     2. 给用于本地的 IAM 用户/凭证至少这些权限（bucket + prefix 范围即可）：
         - s3:PutObject, s3:GetObject, s3:DeleteObject, s3:ListBucket
     3. 配置 S3 CORS（否则浏览器用 presigned PUT 会被拦）：
         - AllowedOrigins：http://127.0.0.1:3000, http://localhost:3000
         - AllowedMethods：GET, PUT, HEAD
         - AllowedHeaders：至少包含 content-type, x-amz-server-side-encryption（最简单用 *）

  2) 启动本地 Postgres（带 pgvector）

    podman network create cselearning || true
    podman volume create cselearning-pgdata || true

    podman rm -f cselearning-postgres || true
    podman run -d --name cselearning-postgres --network cselearning \
      -e POSTGRES_DB='cselearning-database' \
      -e POSTGRES_USER='postgres' \
      -e POSTGRES_PASSWORD='postgres' \
      -v cselearning-pgdata:/var/lib/postgresql/data \
      docker.io/pgvector/pgvector:pg16

  3) 准备本地环境变量文件（不提交）
    创建 tmp/podman/local.env：

    mkdir -p tmp/podman
    cat > tmp/podman/local.env <<'EOF'
    NODE_ENV=production
    JWT_SECRET=local-dev-secret-change-me

    DATABASE_URL=postgresql://postgres:postgres@cselearning-postgres:5432/cselearning-database?schema=public

    AWS_REGION=ap-southeast-1
    AWS_S3_BUCKET_NAME=<YOUR_BUCKET>
    AWS_S3_ASSET_PREFIX=assets
    CSE_ASSET_DELIVERY_MODE=s3_presigned
    CSE_ASSET_URL_TTL_SECONDS=43200

    AWS_ACCESS_KEY_ID=<YOUR_KEY>
    AWS_SECRET_ACCESS_KEY=<YOUR_SECRET>

    NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
    EOF

    说明：

    - 本地推荐 CSE_ASSET_DELIVERY_MODE=s3_presigned，不需要 CloudFront key。
    - AWS_S3_ASSET_PREFIX 建议用 assets（更贴近生产 /assets/* 结构）。

  4) 构建镜像

    podman build -t cselearning-web:latest -f Containerfile .
    podman build -t cselearning-backend:latest -f backend/Containerfile .
    podman build --target migrator -t cselearning-migrator:latest -f Containerfile .

  5) 跑迁移 + Seed
    迁移：
    podman run --rm --network cselearning --env-file tmp/podman/local.env \
      cselearning-migrator:latest

    Seed（两种方式选一种）：

    - 只创建你指定的管理员（推荐）：

    podman run --rm --network cselearning --env-file tmp/podman/local.env \
      -e CSE_SEED_ADMIN_EMAIL='admin@agora.io' \
      -e CSE_SEED_ADMIN_PASSWORD='password123' \
      cselearning-migrator:latest npx prisma db seed

    - 创建默认测试用户（不推荐，但需要时可用）：

    podman run --rm --network cselearning --env-file tmp/podman/local.env \
      -e CSE_SEED_DEFAULT_USERS=1 \
      cselearning-migrator:latest npx prisma db seed

  6) 启动 Web 容器

    #Delete existing container if any
    podman rm -f cselearning-web || true
    #Run the web container. 本地运行，映射 3000 端口，挂载 AWS 凭证
    podman run -d --name cselearning-web --network cselearning -p 3000:3000 \
    --env-file tmp/podman/local.env \
    -v "$HOME/.aws:/root/.aws:ro" \
    -e AWS_PROFILE=default \
    -e AWS_SDK_LOAD_CONFIG=1 \
    localhost/cselearning-web:latest

    访问：http://127.0.0.1:3000/login

    # 必须和 web 用同一个 DB
    DATABASE_URL=postgresql://postgres:postgres@cselearning-postgres:5432/cselearning-database?schema=public

    # backend 也需要 JWT 校验（必须和 web 的 JWT_SECRET 一致）
    JWT_SECRET=local-dev-secret-change-me

    # S3（用于删除/清理等）
    AWS_REGION=ap-southeast-1
    AWS_S3_BUCKET_NAME=<YOUR_BUCKET>
    AWS_S3_ASSET_PREFIX=assets

    # CloudFront signed-cookie（backend 强制要求）
    CLOUDFRONT_DOMAIN=<your-cloudfront-domain>          # 例如 dxxxxx.cloudfront.net
    CLOUDFRONT_KEY_PAIR_ID=<your-key-pair-id>
    CLOUDFRONT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
    CLOUDFRONT_SIGNED_COOKIE_TTL_HOURS=12
    # COOKIE_DOMAIN= (可选)
    EOF

    如果你没有 CloudFront key pair/private key：先别启动 backend（否则必失败）；或者我可以帮你把 backend 改成 CloudFront 配置可选再启动。


  7) 运行 backend 容器
    podman rm -f cselearning-backend || true
    podman run -d --name cselearning-backend --network cselearning -p 8080:8080 \
        --env-file tmp/podman/local.env \
        -v "$HOME/.aws:/root/.aws:ro" \
        --memory=768m \
        --memory-reservation=512m \
        -e AWS_PROFILE=default \
        -e AWS_SDK_LOAD_CONFIG=1 \
        localhost/cselearning-backend:latest

  8) 让 web 容器能访问 backend（关键点）
    因为 web 在容器里，127.0.0.1:8080 不指向 backend；要用容器名：

    在 tmp/podman/local.env 里加/改：

    BACKEND_INTERNAL_URL=http://cselearning-backend:8080

    然后重启 web 容器：

    podman rm -f cselearning-web || true
    podman run -d --name cselearning-web --network cselearning -p 3000:3000 \
        --env-file tmp/podman/local.env \           
        -v "$HOME/.aws:/root/.aws:ro" \
        -e AWS_PROFILE=default \
        -e AWS_SDK_LOAD_CONFIG=1 \
        localhost/cselearning-web:latest

  9) 数据库相关操作：

    删除本地测试环境数据库+S3。注意：Script会去检查local.cleanup.env里的 AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY。这个文件必须设置在gitignore.
    ENV_FILE=tmp/podman/local.cleanup.env npm run cleanup:test-data:apply

    如果数据库有更新，migration SQL有更新，需要执行数据库迁移命令：
    podman exec -it <web容器名> sh -lc 'cd /app && npx prisma migrate deploy'

    进入PQSL环境：
    podman exec -it cselearning-postgres psql -U postgres -d cselearning-database
    💡 常用 PSQL 命令速查
    成功连接后，你可以使用以下基本命令：

    命令	作用	示例
    \l	列出所有数据库	\l
    \c <dbname>	切换到另一个数据库	\c postgres
    \dt	列出当前数据库的所有表	\dt
    \d <table>	描述表的结构（字段、类型）	\d users
    \x	切换扩展显示模式（查看宽结果时有用）	\x
    \q	退出 psql 客户端	\q

    SELECT * FROM courses;


