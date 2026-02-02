# Local Deployment (Podman)

## Architecture

```
cselearning-web (Next.js)  ──┬──► PostgreSQL (pgvector)
cselearning-worker (Node.js) ┘
```

The application consists of two containers:
- **cselearning-web**: Next.js application with API routes
- **cselearning-worker**: Background worker for transcript/knowledge processing

## Prerequisites

- Podman installed (macOS needs Podman VM): `podman machine start`
- Enter project directory: `cd /Users/zhonghuang/Documents/CSETrainingSystem`

## 1) Prepare AWS S3 (Required)

1. Create an S3 bucket in AWS (e.g., `cse-training-bucket`), confirm Region (e.g., `ap-southeast-1`)
2. Give your IAM user/credentials at least these permissions (bucket + prefix scope):
   - `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket`
3. Configure S3 CORS (required for browser presigned PUT uploads):
   - AllowedOrigins: `http://127.0.0.1:3000`, `http://localhost:3000`
   - AllowedMethods: `GET`, `PUT`, `HEAD`
   - AllowedHeaders: at least `content-type`, `x-amz-server-side-encryption` (or use `*`)

## 2) Start Local Postgres (with pgvector)

```bash
podman network create cselearning || true
podman volume create cselearning-pgdata || true

podman rm -f cselearning-postgres || true
podman run -d --name cselearning-postgres --network cselearning \
  -e POSTGRES_DB='cselearning-database' \
  -e POSTGRES_USER='postgres' \
  -e POSTGRES_PASSWORD='postgres' \
  -v cselearning-pgdata:/var/lib/postgresql/data \
  docker.io/pgvector/pgvector:pg16
```

## 3) Prepare Local Environment File

Create `tmp/podman/local.env` (not committed to git):

```bash
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
```

Notes:
- Local dev recommends `CSE_ASSET_DELIVERY_MODE=s3_presigned` (no CloudFront key needed)
- `AWS_S3_ASSET_PREFIX` should be `assets` to match production `/assets/*` structure

### Optional: CloudFront Signed Cookies

If you want to test CloudFront signed cookies for course materials:

```bash
# Add to tmp/podman/local.env
CLOUDFRONT_DOMAIN=<your-cloudfront-domain>
CLOUDFRONT_KEY_PAIR_ID=<your-key-pair-id>
CLOUDFRONT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CLOUDFRONT_SIGNED_COOKIE_TTL_HOURS=12
# COOKIE_DOMAIN= (optional)
```

## 4) Build Images

```bash
podman build -t cselearning-web:latest -f Containerfile .
podman build --target migrator -t cselearning-migrator:latest -f Containerfile .
podman build --target worker -t cselearning-worker:latest -f Containerfile .
```

## 5) Run Migrations + Seed

Migration:
```bash
podman run --rm --network cselearning --env-file tmp/podman/local.env \
  cselearning-migrator:latest
```

Seed (choose one):

- Create a specific admin (recommended):
```bash
podman run --rm --network cselearning --env-file tmp/podman/local.env \
  -e CSE_SEED_ADMIN_EMAIL='admin@agora.io' \
  -e CSE_SEED_ADMIN_PASSWORD='password123' \
  cselearning-migrator:latest npx prisma db seed
```

- Create default test users (local dev only):
```bash
podman run --rm --network cselearning --env-file tmp/podman/local.env \
  -e CSE_SEED_DEFAULT_USERS=1 \
  cselearning-migrator:latest npx prisma db seed
```

## 6) Start Web Container

```bash
podman rm -f cselearning-web || true
podman run -d --name cselearning-web --network cselearning -p 3000:3000 \
  --env-file tmp/podman/local.env \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=default \
  -e AWS_SDK_LOAD_CONFIG=1 \
  localhost/cselearning-web:latest
```

Access: http://127.0.0.1:3000/login

## 7) Start Worker Container (Optional)

Required for VTT-to-knowledge-context processing:

```bash
podman rm -f cselearning-worker 2>/dev/null || true
podman run -d --name cselearning-worker --network cselearning \
  --env-file tmp/podman/local.env \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=default \
  -e AWS_SDK_LOAD_CONFIG=1 \
  -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing \
  -e CSE_OPENAI_LOG_CONTENT=1 \
  localhost/cselearning-worker:latest
```

## 8) Database Operations

Delete local test data (requires `local.cleanup.env` with AWS credentials):
```bash
ENV_FILE=tmp/podman/local.cleanup.env npm run cleanup:test-data:apply
```

Database migration (if schema changed):
```bash
podman exec -it <web-container-name> sh -lc 'cd /app && npx prisma migrate deploy'
```

Enter PSQL:
```bash
podman exec -it cselearning-postgres psql -U postgres -d cselearning-database
```

Common PSQL commands:
| Command | Purpose |
|---------|---------|
| `\l` | List all databases |
| `\c <dbname>` | Switch database |
| `\dt` | List tables |
| `\d <table>` | Describe table |
| `\x` | Toggle expanded display |
| `\q` | Quit |

## Quick Reference

### Build all images:
```bash
podman build -t cselearning-web:latest -f Containerfile .
podman build --target migrator -t cselearning-migrator:latest -f Containerfile .
podman build --target worker -t cselearning-worker:latest -f Containerfile .
```

### Stop all containers:
```bash
podman rm -f cselearning-worker
podman rm -f cselearning-postgres || true
podman rm -f cselearning-web || true
```

### Start fresh environment:
```bash
# Start postgres
podman run -d --name cselearning-postgres --network cselearning \
  -e POSTGRES_DB='cselearning-database' \
  -e POSTGRES_USER='postgres' \
  -e POSTGRES_PASSWORD='postgres' \
  -v cselearning-pgdata:/var/lib/postgresql/data \
  docker.io/pgvector/pgvector:pg16

# Run migration
podman run --rm --network cselearning --env-file tmp/podman/local.env cselearning-migrator:latest

# Start web
podman run -d --name cselearning-web --network cselearning -p 3000:3000 \
  --env-file tmp/podman/local.env \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing \
  -e AWS_PROFILE=default \
  -e AWS_SDK_LOAD_CONFIG=1 \
  localhost/cselearning-web:latest

# Start worker (optional)
podman run -d --name cselearning-worker --network cselearning \
  --env-file tmp/podman/local.env \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=default \
  -e AWS_SDK_LOAD_CONFIG=1 \
  -e CSE_LOG=api,db,s3,knowledgecontext,openai,worker,transcriptprocessing \
  localhost/cselearning-worker:latest
```

### View logs:
```bash
podman logs -f cselearning-web
podman logs -f cselearning-worker
```
