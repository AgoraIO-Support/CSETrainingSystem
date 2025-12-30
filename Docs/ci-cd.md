# CI/CD (Staging -> Production)

This repo uses Next.js (web) + a Fastify backend, deployed to EC2 with Podman + systemd services.
Recommended setup is:

- **CI** on every PR/push: lint + test + build + container builds.
- **CD** to **staging** on `main` updates.
- **CD** to **production** on Git tags (e.g. `v0.2.0`) with a manual approval gate.

## High-level flow

1) Developer opens PR → CI must pass.
2) Merge to `main` → auto deploy to **staging**.
3) Verify staging (smoke + optional manual checks).
4) Create/push a `v*` tag → deploy to **production** (protected environment).

## Security note (do NOT use long-lived AWS keys)

Use **GitHub Actions OIDC** to assume an IAM role in AWS.
Do not store `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as GitHub secrets for CI/CD.

## AWS prerequisites

### A) EC2 instances

Have two EC2 instances:

- staging
- production

Each instance should:

- have Podman installed
- have your repo checked out at the same path (e.g. `/opt/cselearning/app`)
- run systemd user services for the containers
- have an instance role that includes:
  - `AmazonSSMManagedInstanceCore` (for SSM deploy)
  - S3 permissions for your prefix (Put/Get/Delete + ListBucket with prefix condition)

### B) SSM connectivity

Ensure the instances are managed by Systems Manager (SSM).
If SSM is working, `aws ssm describe-instance-information` should list them.

### C) GitHub Actions deploy role (OIDC)

Create two IAM roles (recommended):

- `github-actions-cselearning-deploy-staging`
- `github-actions-cselearning-deploy-production`

Each role should trust GitHub OIDC for this repo and allow:

- `ssm:SendCommand`
- `ssm:GetCommandInvocation`
- `ssm:ListCommandInvocations`
- `ec2:DescribeInstances`

Limit each role to the target instance ID(s).

## GitHub configuration

Create two GitHub **Environments**:

- `staging` (no required reviewers)
- `production` (require reviewers)

Set environment variables / secrets used by `.github/workflows/deploy-*.yml`:

**Secrets**
- `AWS_ROLE_TO_ASSUME` (IAM role ARN)
- `EC2_INSTANCE_ID`

**Variables**
- `AWS_REGION` (e.g. `ap-southeast-1`)
- `DEPLOY_PATH` (e.g. `/opt/cselearning/app`)
- `SERVICE_USER` (e.g. `ubuntu`)
- `ENV_FILE` (e.g. `/home/ubuntu/cselearning.env`)
- `WEB_SERVICE` (e.g. `container-cselearning-web.service`)
- `BACKEND_SERVICE` (e.g. `container-cselearning-backend.service`)
- `SMOKE_URL` (e.g. `https://staging.cselearning.club/`)

## Workflows

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`

Deploys run via SSM using `scripts/deploy/ssm-deploy.sh`.

