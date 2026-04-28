#!/usr/bin/env bash
# .github/scripts/smoke-api.sh — Phase 28 (DEPLOY-03 pre-push gate).
# Asserts Phase 25 D-19 invariants #3 (non-root UID), #4 (ffmpeg present),
# #5 (tini installed) on a built api image BEFORE it ships to GHCR.
# Called by .github/workflows/build-images.yml after `docker buildx build --load`.
#
# Usage: bash .github/scripts/smoke-api.sh <image-ref>
# Exit 0 = all assertions pass (image safe to push).
# Exit non-zero = at least one assertion failed (build job fails, no push).

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <image-ref>" >&2
  exit 64
fi

IMAGE="$1"

echo "[smoke-api] 1/3 non-root UID check (Phase 25 D-19 #3)"
ACTUAL_UID="$(docker run --rm --entrypoint /usr/bin/id "$IMAGE" -u)"
if [ "$ACTUAL_UID" != "1001" ]; then
  echo "[smoke-api] FAIL: expected uid 1001, got '$ACTUAL_UID'" >&2
  exit 1
fi

echo "[smoke-api] 2/3 ffmpeg present (Phase 25 D-19 #4)"
if ! docker run --rm --entrypoint /usr/bin/ffmpeg "$IMAGE" -version | grep -qE 'ffmpeg version (5|6|7)\.'; then
  echo "[smoke-api] FAIL: ffmpeg version 5/6/7 not detected" >&2
  exit 1
fi

echo "[smoke-api] 3/3 tini installed (Phase 25 D-19 #5)"
if ! docker run --rm --entrypoint /usr/bin/tini "$IMAGE" --version | grep -qE '^tini version '; then
  echo "[smoke-api] FAIL: /usr/bin/tini --version did not report a version line" >&2
  exit 1
fi

echo "[smoke-api] PASS: all assertions met for $IMAGE"
