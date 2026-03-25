#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

usage() {
  cat <<'EOF'
Build CSE Training images with consistent platform-aware tags.

Usage:
  ./scripts/podman/build-images.sh [options]

Options:
  --profile <dev|prod>         Tag profile. Default: dev
  --platform <linux/arm64|linux/amd64>
                               Build target platform. Default:
                               dev  -> linux/arm64
                               prod -> linux/amd64
  --registry <name>            Image registry/prefix. Default: localhost
  --tag-base <name>            Image name prefix. Default: cselearning
  --latest-alias               Also tag each image as :latest
  --web-only                   Build only the web image
  --worker-only                Build only the worker image
  --migrator-only              Build only the migrator image
  --help                       Show this help

Examples:
  ./scripts/podman/build-images.sh --profile dev --latest-alias
  ./scripts/podman/build-images.sh --profile prod --platform linux/amd64
  ./scripts/podman/build-images.sh --profile prod --platform linux/amd64 --web-only
EOF
}

PROFILE="dev"
PLATFORM=""
REGISTRY="${CSE_IMAGE_REGISTRY:-localhost}"
TAG_BASE="${CSE_TAG_BASE:-cselearning}"
LATEST_ALIAS=0
BUILD_WEB=1
BUILD_WORKER=1
BUILD_MIGRATOR=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:?missing profile}"
      shift 2
      ;;
    --platform)
      PLATFORM="${2:?missing platform}"
      shift 2
      ;;
    --registry)
      REGISTRY="${2:?missing registry}"
      shift 2
      ;;
    --tag-base)
      TAG_BASE="${2:?missing tag base}"
      shift 2
      ;;
    --latest-alias)
      LATEST_ALIAS=1
      shift
      ;;
    --web-only)
      BUILD_WEB=1
      BUILD_WORKER=0
      BUILD_MIGRATOR=0
      shift
      ;;
    --worker-only)
      BUILD_WEB=0
      BUILD_WORKER=1
      BUILD_MIGRATOR=0
      shift
      ;;
    --migrator-only)
      BUILD_WEB=0
      BUILD_WORKER=0
      BUILD_MIGRATOR=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "${PROFILE}" in
  dev|prod) ;;
  *)
    echo "Invalid profile: ${PROFILE}. Use dev or prod." >&2
    exit 2
    ;;
esac

if [[ -z "${PLATFORM}" ]]; then
  if [[ "${PROFILE}" == "prod" ]]; then
    PLATFORM="linux/amd64"
  else
    PLATFORM="linux/arm64"
  fi
fi

case "${PLATFORM}" in
  linux/arm64)
    ARCH_TAG="arm64"
    ;;
  linux/amd64)
    ARCH_TAG="amd64"
    ;;
  *)
    echo "Unsupported platform: ${PLATFORM}" >&2
    exit 2
    ;;
esac

IMAGE_PREFIX="${REGISTRY}/${TAG_BASE}"
TAG_SUFFIX="${PROFILE}-${ARCH_TAG}"

build_image() {
  local name="$1"
  local target="$2"
  local primary_tag="${IMAGE_PREFIX}-${name}:${TAG_SUFFIX}"
  local latest_tag="${IMAGE_PREFIX}-${name}:latest"

  echo "==> Building ${primary_tag} (target=${target}, platform=${PLATFORM})"
  podman build \
    --platform "${PLATFORM}" \
    --target "${target}" \
    -t "${primary_tag}" \
    -f "${ROOT}/Containerfile" \
    "${ROOT}"

  if [[ "${LATEST_ALIAS}" -eq 1 ]]; then
    echo "==> Tagging ${latest_tag}"
    podman tag "${primary_tag}" "${latest_tag}"
  fi
}

if [[ "${BUILD_WEB}" -eq 1 ]]; then
  build_image "web" "web"
fi

if [[ "${BUILD_WORKER}" -eq 1 ]]; then
  build_image "worker" "worker"
fi

if [[ "${BUILD_MIGRATOR}" -eq 1 ]]; then
  build_image "migrator" "migrator"
fi

echo "==> Done"
