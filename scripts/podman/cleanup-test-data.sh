#!/usr/bin/env bash
set -euo pipefail

# Run cleanup-test-data.ts inside the Podman network so it uses the same DATABASE_URL
# hostname resolution as the app containers (e.g., `cselearning-postgres`).
#
# Usage:
#   ./scripts/podman/cleanup-test-data.sh --scope=all
#   ./scripts/podman/cleanup-test-data.sh --scope=all --apply --confirm=WIPE_LOCAL_TEST_DATA
#
# Environment overrides:
#   CSE_PODMAN_NETWORK=cselearning
#   CSE_ENV_FILE=tmp/podman/local.env
#   CSE_TOOL_IMAGE=cselearning-migrator:latest

NETWORK="${CSE_PODMAN_NETWORK:-cselearning}"
ENV_FILE="${CSE_ENV_FILE:-tmp/podman/local.env}"
IMAGE="${CSE_TOOL_IMAGE:-cselearning-migrator:latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required" >&2
  exit 1
fi

if [[ ! -f "${ROOT}/${ENV_FILE}" ]]; then
  echo "Env file not found: ${ROOT}/${ENV_FILE}" >&2
  exit 1
fi

podman run --rm \
  --network "${NETWORK}" \
  --env-file "${ROOT}/${ENV_FILE}" \
  -v "${ROOT}:/workspace:ro" \
  -w /workspace \
  -e NODE_PATH=/app/node_modules \
  "${IMAGE}" \
  node /app/node_modules/tsx/dist/cli.mjs scripts/cleanup-test-data.ts "$@"

