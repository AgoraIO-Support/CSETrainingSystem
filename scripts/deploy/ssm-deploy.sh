#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?}"
: "${EC2_INSTANCE_ID:?}"

DEPLOY_PATH="${DEPLOY_PATH:-/opt/cselearning/app}"
SERVICE_USER="${SERVICE_USER:-ubuntu}"
ENV_FILE="${ENV_FILE:-/home/ubuntu/cselearning.env}"
WEB_SERVICE="${WEB_SERVICE:-container-cselearning-web.service}"
WORKER_SERVICE="${WORKER_SERVICE:-container-cselearning-worker.service}"
DEPLOY_REF="${DEPLOY_REF:-}"
SMOKE_URL="${SMOKE_URL:-}"

if [[ -z "${DEPLOY_REF}" ]]; then
  echo "DEPLOY_REF is required (commit sha or tag)"
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required on the runner"
  exit 2
fi

remote_script=$(cat <<'EOS'
set -euo pipefail

echo "==> Host: $(hostname)"
echo "==> User: $(whoami)"
echo "==> Date: $(date -Is)"
EOS
)

remote_script+=$'\n'
remote_script+="DEPLOY_PATH='${DEPLOY_PATH}'"$'\n'
remote_script+="SERVICE_USER='${SERVICE_USER}'"$'\n'
remote_script+="ENV_FILE='${ENV_FILE}'"$'\n'
remote_script+="WEB_SERVICE='${WEB_SERVICE}'"$'\n'
remote_script+="WORKER_SERVICE='${WORKER_SERVICE}'"$'\n'
remote_script+="DEPLOY_REF='${DEPLOY_REF}'"$'\n'
remote_script+="SMOKE_URL='${SMOKE_URL}'"$'\n'

remote_script+=$'\n'
remote_script+=$(cat <<'EOS'

echo "==> Deploy path: ${DEPLOY_PATH}"
cd "${DEPLOY_PATH}"

echo "==> Git fetch"
git fetch --all --tags --prune

echo "==> Git checkout ${DEPLOY_REF}"
git checkout -f "${DEPLOY_REF}"

echo "==> Git status"
git rev-parse --short HEAD
git status --porcelain || true

echo "==> Build images"
./scripts/podman/build-images.sh --profile prod --platform linux/amd64 --latest-alias

echo "==> Run DB migrations"
podman run --rm --env-file "${ENV_FILE}" localhost/cselearning-migrator:latest

echo "==> Restart services (systemd --user)"
runuser -l "${SERVICE_USER}" -c "systemctl --user restart ${WEB_SERVICE} ${WORKER_SERVICE}"

echo "==> Show service status"
runuser -l "${SERVICE_USER}" -c "systemctl --user --no-pager --full status ${WEB_SERVICE} ${WORKER_SERVICE} | sed -n '1,120p'"

if [[ -n "${SMOKE_URL}" ]]; then
  echo "==> Smoke check ${SMOKE_URL}"
  curl -fsSI "${SMOKE_URL}" | sed -n '1,20p'
fi

echo "==> Done"
EOS
)

params_json=$(jq -n --arg script "$remote_script" '{commands: [$script]}')

echo "==> Sending SSM command to ${EC2_INSTANCE_ID} (${AWS_REGION})"
command_id=$(
  aws ssm send-command \
    --region "${AWS_REGION}" \
    --instance-ids "${EC2_INSTANCE_ID}" \
    --document-name "AWS-RunShellScript" \
    --comment "cselearning deploy ${DEPLOY_REF}" \
    --parameters "${params_json}" \
    --query "Command.CommandId" \
    --output text
)
echo "SSM CommandId: ${command_id}"

echo "==> Waiting for command to finish"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${EC2_INSTANCE_ID}"

echo "==> Fetching command output"
aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${command_id}" \
  --instance-id "${EC2_INSTANCE_ID}" \
  --query "{Status:Status,ResponseCode:ResponseCode,Stdout:StandardOutputContent,Stderr:StandardErrorContent}" \
  --output json
