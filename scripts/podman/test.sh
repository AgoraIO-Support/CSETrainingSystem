#!/usr/bin/env bash
set -euo pipefail

# Run Jest inside the Podman network so DATABASE_URL like `...@cselearning-postgres:5432/...` works.
# Also masks the host `node_modules` to avoid Prisma engine mismatches (darwin host vs linux container).
#
# Usage:
#   ENV_FILE=tmp/podman/local.env npm run test:podman
#   ENV_FILE=tmp/podman/local.env npm run test:podman -- __tests__/unit/videojs-player-subtitles.test.tsx
#
# Environment overrides:
#   ENV_FILE=/path/to/.env            (default: tmp/podman/local.env)
#   CSE_PODMAN_NETWORK=cselearning    (optional; skipped if missing on host)
#   CSE_TOOL_IMAGE=cselearning-migrator:latest

NETWORK="${CSE_PODMAN_NETWORK:-cselearning}"
ENV_FILE="${ENV_FILE:-tmp/podman/local.env}"
IMAGE="${CSE_TOOL_IMAGE:-cselearning-migrator:latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

HOST_ENV_FILE="${ENV_FILE}"
if [[ "${HOST_ENV_FILE}" != /* ]]; then
  HOST_ENV_FILE="${ROOT}/${HOST_ENV_FILE}"
fi

if [[ ! -f "${HOST_ENV_FILE}" ]]; then
  echo "Env file not found: ${HOST_ENV_FILE}" >&2
  exit 1
fi

NETWORK_ARG=()
if [[ -n "${NETWORK}" ]]; then
  if podman network exists "${NETWORK}" >/dev/null 2>&1; then
    NETWORK_ARG=(--network "${NETWORK}")
  else
    echo "Warning: podman network '${NETWORK}' not found; running without --network." >&2
  fi
fi

# Mask host node_modules (darwin) so Prisma + deps resolve from the image (linux).
WORKSPACE_NODE_MODULES_VOLUME="cselearning-workspace-node_modules"

PODMAN_CMD=(
  podman run --rm
  --env-file "${HOST_ENV_FILE}"
  -v "${ROOT}:/workspace:ro"
  -v "${WORKSPACE_NODE_MODULES_VOLUME}:/workspace/node_modules"
  -w /workspace
  -e NODE_PATH=/app/node_modules
  -e PATH="/app/node_modules/.bin:${PATH}"
)

if (( ${#NETWORK_ARG[@]} > 0 )); then
  PODMAN_CMD+=("${NETWORK_ARG[@]}")
fi

PODMAN_CMD+=("${IMAGE}" jest "$@")

"${PODMAN_CMD[@]}"
