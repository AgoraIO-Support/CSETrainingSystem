#!/usr/bin/env bash
set -euo pipefail

# Run cleanup-test-data.ts inside the Podman network so it uses the same DATABASE_URL
# hostname resolution as the app containers (e.g., `cselearning-postgres`).
#
# Note: this script mounts ONLY `/scripts` (not the repo root) to avoid accidentally
# using host `node_modules` (darwin) inside the Linux container, which breaks Prisma.
#
# Usage:
#   ./scripts/podman/cleanup-test-data.sh --scope=all
#   ./scripts/podman/cleanup-test-data.sh --scope=all --apply --confirm=WIPE_LOCAL_TEST_DATA
#   ENV_FILE=/opt/cselearning/app/.env.prod ./scripts/podman/cleanup-test-data.sh --allow-remote=true --scope=all --apply --confirm=WIPE_LOCAL_TEST_DATA
#
# Environment overrides:
#   CSE_PODMAN_NETWORK=cselearning   (optional; if missing on host, wrapper skips --network)
#   ENV_FILE=/absolute/or/relative/path/to/.env
#   CSE_ENV_FILE=tmp/podman/local.env     (legacy alias)
#   CSE_TOOL_IMAGE=cselearning-migrator:latest

NETWORK="${CSE_PODMAN_NETWORK:-cselearning}"
DEFAULT_ENV_FILE="${ENV_FILE:-${CSE_ENV_FILE:-tmp/podman/local.env}}"
IMAGE="${CSE_TOOL_IMAGE:-cselearning-migrator:latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required" >&2
  exit 1
fi

HAS_ENV_FILE_ARG=0
SCRIPT_ENV_FILE=""
for ARG in "$@"; do
  case "$ARG" in
    --env-file|--env-file=*)
      HAS_ENV_FILE_ARG=1
      if [[ "$ARG" == "--env-file" ]]; then
        SCRIPT_ENV_FILE="__NEXT__"
      else
        SCRIPT_ENV_FILE="${ARG#--env-file=}"
      fi
      break
      ;;
  esac
done

if [[ "${SCRIPT_ENV_FILE}" == "__NEXT__" ]]; then
  # shellcheck disable=SC2034
  : # value is provided as next arg; we resolve it later
fi

ARGS=("$@")
if [[ "${HAS_ENV_FILE_ARG}" -ne 1 ]]; then
  SCRIPT_ENV_FILE="${DEFAULT_ENV_FILE}"
else
  if [[ "${SCRIPT_ENV_FILE}" == "__NEXT__" ]]; then
    for ((i=0; i<${#ARGS[@]}; i++)); do
      if [[ "${ARGS[$i]}" == "--env-file" ]]; then
        if (( i + 1 >= ${#ARGS[@]} )); then
          echo "Missing value for --env-file" >&2
          exit 1
        fi
        SCRIPT_ENV_FILE="${ARGS[$((i+1))]}"
        break
      fi
    done
  fi
fi

HOST_ENV_FILE="${SCRIPT_ENV_FILE}"
if [[ "${HOST_ENV_FILE}" != /* ]]; then
  HOST_ENV_FILE="${ROOT}/${HOST_ENV_FILE}"
fi

if [[ ! -f "${HOST_ENV_FILE}" ]]; then
  echo "Env file not found: ${HOST_ENV_FILE}" >&2
  exit 1
fi

# Podman network is only needed for local container hostname resolution (e.g. cselearning-postgres).
# In production, DATABASE_URL is typically a remote host, so we can safely omit --network if it doesn't exist.
NETWORK_ARG=()
if [[ -n "${NETWORK}" ]]; then
  if podman network exists "${NETWORK}" >/dev/null 2>&1; then
    NETWORK_ARG=(--network "${NETWORK}")
  else
    echo "Warning: podman network '${NETWORK}' not found; running without --network." >&2
  fi
fi

# Strip any user-provided --env-file so we can mount it and pass a stable in-container path.
STRIPPED_ARGS=()
for ((i=0; i<${#ARGS[@]}; i++)); do
  if [[ "${ARGS[$i]}" == "--env-file" ]]; then
    i=$((i+1))
    continue
  fi
  case "${ARGS[$i]}" in
    --env-file=*)
      continue
      ;;
  esac
  STRIPPED_ARGS+=("${ARGS[$i]}")
done
ARGS=(--env-file /workspace/.cleanup.env "${STRIPPED_ARGS[@]}")

EXTRA_ENV=()
for VAR in AWS_S3_ASSET_PREFIX AWS_S3_BUCKET_NAME AWS_S3_ASSET_BUCKET_NAME AWS_REGION AWS_DEFAULT_REGION; do
  if [[ -n "${!VAR:-}" ]]; then
    EXTRA_ENV+=(-e "${VAR}=${!VAR}")
  fi
done

PODMAN_CMD=(
  podman run --rm
  "${NETWORK_ARG[@]}"
  --env-file "${HOST_ENV_FILE}"
  -v "${ROOT}/scripts:/workspace/scripts:ro"
  -v "${HOST_ENV_FILE}:/workspace/.cleanup.env:ro"
  -w /workspace
  -e NODE_PATH=/app/node_modules
)

if (( ${#EXTRA_ENV[@]} > 0 )); then
  PODMAN_CMD+=("${EXTRA_ENV[@]}")
fi

PODMAN_CMD+=(
  "${IMAGE}"
  node /app/node_modules/tsx/dist/cli.mjs /workspace/scripts/cleanup-test-data.ts --allow-container-host=true "${ARGS[@]}"
)

"${PODMAN_CMD[@]}"
