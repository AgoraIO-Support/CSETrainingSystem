# Deployment Guide (Local + AWS EC2)

This project is a **Next.js app (App Router)** with server-side API routes and a PostgreSQL database (Prisma).
It is deployed as a **single web container** (Next.js standalone output) and uses **AWS S3** for assets (MP4, VTT, XML knowledge contexts).

There is also an optional **Fastify backend** in `backend/` that is currently used for:

- CloudFront signed-cookie endpoint for the course materials page: `GET /api/materials/:courseId/cf-cookie`
- Admin delete operations (Next.js proxies to the backend for these endpoints):
  - `DELETE /api/admin/courses/:id`
  - `DELETE /api/admin/courses/:id/chapters/:chapterId`

## Contents

- Local deployment (Podman)
- AWS EC2 deployment (Podman + systemd)
- Optional: Fastify backend deployment
- Database migrations (Prisma)
- CloudFront + S3 private assets (optional but recommended)
- Troubleshooting

---

## 1) Local Deployment (Podman, recommended for “prod-like” testing)

### Prerequisites

- Podman installed (macOS needs Podman VM): `podman machine start`
- AWS credentials in env if you want real S3 assets (optional)

### 1.1 Start Postgres (with pgvector)

Prisma migrations require the `vector` extension. Use the pgvector image:

```bash
podman machine start

podman network create cselearning || true
podman rm -f cselearning-postgres || true
podman run -d --name cselearning-postgres --network cselearning \
  -e POSTGRES_DB='cselearning-database' \
  -e POSTGRES_USER='postgres' \
  -e POSTGRES_PASSWORD='postgres' \
  docker.io/pgvector/pgvector:pg16
```

### 1.2 Build images

```bash
podman build -t cselearning-web:latest -f Containerfile .
podman build --target migrator -t cselearning-migrator:latest -f Containerfile .
```

### 1.3 Create a local env file (do NOT commit secrets)

Create `tmp/podman/local.env` (already ignored by `.gitignore`):

```bash
mkdir -p tmp/podman
cat > tmp/podman/local.env <<'EOF'
NODE_ENV=production
JWT_SECRET=local-dev-secret-change-me

DATABASE_URL=postgresql://postgres:postgres@cselearning-postgres:5432/cselearning-database?schema=public

# Optional: real S3 access for assets/XML (recommended for E2E)
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET_NAME=cse-training-bucket
AWS_S3_ASSET_PREFIX=CSETraining
CSE_ASSET_DELIVERY_MODE=s3_presigned
CSE_ASSET_URL_TTL_SECONDS=43200
AWS_ACCESS_KEY_ID=REPLACE_ME
AWS_SECRET_ACCESS_KEY=REPLACE_ME

# Optional: AI (only needed if you will use AI endpoints)
OPENAI_API_KEY=REPLACE_ME
OPENAI_MODEL=gpt-4o-mini
EOF
```

### 1.4 Run migrations + seed

```bash
podman run --rm --network cselearning --env-file tmp/podman/local.env \
  cselearning-migrator:latest

podman run --rm --network cselearning --env-file tmp/podman/local.env \
  cselearning-migrator:latest npx tsx prisma/seed.ts
```

### 1.5 Run the web container

```bash
podman rm -f cselearning-web || true
podman run -d --name cselearning-web --network cselearning \
  -p 3000:3000 \
  --env-file tmp/podman/local.env \
  cselearning-web:latest
```

Open:

- `http://127.0.0.1:3000/login`
  - User: `user@agora.io` / `password123`
  - Admin: `admin@agora.io` / `password123`

### 1.6 Optional: run the Fastify backend locally

Only needed if you use:

- `/courses/:id/materials` (CloudFront signed cookies)
- Admin delete actions that proxy to the backend

Build the backend image:

```bash
podman build -t cselearning-backend:latest -f backend/Containerfile .
```

Run it on `:8080`:

```bash
podman rm -f cselearning-backend || true
podman run -d --name cselearning-backend --network cselearning \
  -p 8080:8080 \
  --env-file tmp/podman/local.env \
  -e PORT=8080 \
  -e CLOUDFRONT_DOMAIN=d1la0fzxo5jnb.cloudfront.net \
  -e CLOUDFRONT_KEY_PAIR_ID=REPLACE_ME \
  -e CLOUDFRONT_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n' \
  cselearning-backend:latest
```

Then set the frontend env (for local dev) so the browser can reach it:

- `BACKEND_INTERNAL_URL=http://127.0.0.1:8080`

### 1.7 Optional E2E checks

- UI smoke (browser):
  ```bash
  E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/e2e/learn-ui-smoke.ts
  ```
- Real S3 chain (DB + S3 CopyObject + Range GET):
  ```bash
  E2E_BASE_URL=http://127.0.0.1:3000 \
  DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/cselearning-database?schema=public' \
  npx tsx scripts/e2e/real-s3-asset-delivery.ts
  ```

---

## 2) AWS EC2 Deployment (Podman + systemd, CloudFront → EC2)

This is the low-ops option you chose:

- EC2 (public) with EIP
- Podman runs the `cselearning-web` container
- RDS PostgreSQL in the same VPC (recommended)
- CloudFront in front of EC2 (recommended)

### 2.1 AWS resources checklist (ap-southeast-1)

- EC2 instance (Amazon Linux 2023 or Ubuntu)
- Elastic IP associated to EC2
- RDS PostgreSQL (Single-AZ to save cost)
  - DB name: `cselearning-database`
  - Username: `postgres`
- Security Groups:
  - EC2 SG: allow `80/443` from internet (or corporate IP), allow `22` from your IP only
  - RDS SG: allow `5432` from EC2 SG only
- S3 bucket: `cse-training-bucket` (private)

### 2.2 Install Podman + git (example)

On the EC2 host:

```bash
sudo yum update -y
sudo yum install -y podman git
podman --version
```

### 2.3 Pull your repo

```bash
git clone <YOUR_GITHUB_REPO_URL> cselearning
cd cselearning
```

### 2.4 Create production env file on EC2

Create `/opt/cselearning.env` (permissions: root-only):

```bash
sudo tee /opt/cselearning.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# RDS (example; adjust host/db)
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@<RDS_ENDPOINT>:5432/cselearning-database?schema=public&sslmode=require

JWT_SECRET=<GENERATE_A_STRONG_RANDOM_SECRET>

# AWS S3
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET_NAME=cse-training-bucket
AWS_S3_ASSET_PREFIX=CSETraining

# If you deploy the Fastify backend, the browser will call it using this base URL.
# This is server-only. Keep the backend private and only reachable from the Next.js server.
BACKEND_INTERNAL_URL=http://127.0.0.1:8080

# Asset delivery mode:
# - For production with private assets: cloudfront_signed
# - If you temporarily allow public S3/CF access: public (not recommended)
CSE_ASSET_DELIVERY_MODE=cloudfront_signed
CSE_ASSET_URL_TTL_SECONDS=43200

# CloudFront signed URL (required when cloudfront_signed)
CLOUDFRONT_KEY_PAIR_ID=<YOUR_KEY_PAIR_ID>
CLOUDFRONT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# Fastify backend CloudFront config (used for signed cookies)
CLOUDFRONT_DOMAIN=cselearning.club

# AI
OPENAI_API_KEY=<YOUR_OPENAI_KEY>
OPENAI_MODEL=gpt-4o-mini
EOF

sudo chmod 600 /opt/cselearning.env
```

Important:

- Do not store AWS access keys on EC2 if you can avoid it. Prefer an **IAM Instance Role** with S3 permissions.
- If you do use keys temporarily, put them in `/opt/cselearning.env` and lock file permissions.

### 2.5 Build image on EC2

```bash
podman build -t cselearning-web:latest -f Containerfile .
podman build --target migrator -t cselearning-migrator:latest -f Containerfile .
```

Notes:

- The `CAP_* operation not permitted` warnings are normal for rootless Podman.
- If `next build` fails by type-checking `backend/`, ensure you pulled the latest code where:
  - `tsconfig.json` excludes `backend`
  - `Containerfile` no longer copies `backend/` into the Next build stage

### 2.6 Run Prisma migrations (one-off)

```bash
podman run --rm --env-file /opt/cselearning.env cselearning-migrator:latest
```

### 2.7 Run the web container

Run on port 3000 (later you can put Nginx in front on 80/443):

```bash
podman rm -f cselearning-web || true
podman run -d --name cselearning-web \
  --env-file /opt/cselearning.env \
  -p 3000:3000 \
  cselearning-web:latest
podman logs --tail 100 cselearning-web
```

### 2.8 systemd autostart (recommended)

```bash
sudo mkdir -p /etc/systemd/system
podman generate systemd --name cselearning-web --files --new
sudo mv container-cselearning-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now container-cselearning-web.service
sudo systemctl status container-cselearning-web.service
```

### 2.9 Optional: deploy the Fastify backend on EC2

Build the backend image (context is the repo root):

```bash
podman build -t cselearning-backend:latest -f backend/Containerfile .
```

Run it on port `8080`:

```bash
podman rm -f cselearning-backend || true
### Copy env file for ubuntu user
sudo install -m 600 -o ubuntu -g ubuntu /opt/cselearning.env /home/ubuntu/cselearning.env

podman run -d --name cselearning-backend \
    --env-file /home/ubuntu/cselearning.env \
    -p 127.0.0.1:8080:8080 \
    -e PORT=8080 \
    cselearning-backend:latest

podman logs --tail 100 cselearning-backend

Manage the backend container with Podman commands:
  - 停止：podman stop cselearning-backend
  - 启动（停止后再启动）：podman start cselearning-backend
  - 重启：podman restart cselearning-backend
  - 查看日志：podman logs -f cselearning-backend
  - 停止并删除容器（下次要重新 podman run）：podman rm -f cselearning-backend

```




systemd autostart:

```bash
podman generate systemd --name cselearning-backend --files --new
sudo mv container-cselearning-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now container-cselearning-backend.service
sudo systemctl status container-cselearning-backend.service

如果你已经按文档做了 systemd 自启动（container-cselearning-backend.service），用 systemd 管：

  - 停止：sudo systemctl stop container-cselearning-backend.service
  - 启动：sudo systemctl start container-cselearning-backend.service
  - 重启：sudo systemctl restart container-cselearning-backend.service
  - 看状态：sudo systemctl status container-cselearning-backend.service
  - 取消开机自启：sudo systemctl disable --now container-cselearning-backend.service

  你现在有没有执行过 podman generate systemd ... 并 systemctl enable --now ...？如果有，建议优先用 systemd 管，避免手动 podman 和 systemd “打架”。

```

Notes:

- With the current frontend refactor, the browser never calls the backend directly. Next.js proxies the backend for:
  - CloudFront signed cookies: `GET /api/materials/:courseId/cf-cookie`
  - Admin deletes
- Recommended: run both containers in the same Podman pod so `BACKEND_INTERNAL_URL=http://127.0.0.1:8080` works and port 8080 is not exposed publicly.

---

## 3) CloudFront + S3 private assets (recommended)

If you want private access to S3 assets (MP4/VTT/XML) while keeping the app public:

### 3.1 CloudFront behaviors (example)

Two-origins setup:

- Origin A: EC2 (or Nginx on EC2) for the app
  - Default behavior: `/*` → EC2 origin
- Origin B: S3 bucket for assets
  - Behavior: `/CSETraining/*` → S3 origin (OAC enabled)
  - Require Signed URL (Key Group)

### 3.2 App configuration

Use:

- `AWS_S3_ASSET_PREFIX=CSETraining`
- `CSE_ASSET_DELIVERY_MODE=cloudfront_signed`
- `AWS_CLOUDFRONT_DOMAIN=cselearning.club` (or your CF domain)
- `CLOUDFRONT_KEY_PAIR_ID` + `CLOUDFRONT_PRIVATE_KEY`

The API returns time-limited signed URLs so the browser can fetch MP4/VTT/XML.

---

## 4) Troubleshooting

### EC2: `Cannot find module 'fastify'` during `next build`

Cause: Next.js typecheck scanned `backend/` but backend deps aren’t installed in the web image.
Fix: pull latest code where:

- `tsconfig.json` excludes `backend`
- `Containerfile` does not copy `backend/` into the Next build stage

### Local/EC2: `Invalid supabaseUrl` or “Missing Supabase environment variables”

Use local auth (no Supabase env vars), or ensure Supabase env vars are valid URLs without extra quotes.
For containers, prefer a dedicated env-file (no surrounding quotes).

### Course materials page cannot obtain CloudFront cookie

Symptoms:

- `/courses/:id/materials` videos don’t play
- Browser console shows the `cf-cookie` request failing

Checks:

- Ensure the Fastify backend is running and reachable at `NEXT_PUBLIC_BACKEND_URL`
- Ensure backend has: `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`
- If backend is on a different origin, ensure backend CORS allows `https://cselearning.club`
