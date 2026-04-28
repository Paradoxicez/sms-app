#!/usr/bin/env bash
# .github/scripts/smoke-web.sh — Phase 28 (DEPLOY-03 pre-push gate).
# Asserts Phase 25 D-19 invariants #1 (non-root UID), #7 (boot), #8
# (/api/health serves) on a built web image BEFORE it ships to GHCR.
# Boots a real container (web has no external deps) so a regression in
# Phase 25 D-18 outputFileTracingRoot would manifest as boot failure here.
# Called by .github/workflows/build-images.yml after `docker buildx build --load`.
#
# Usage: bash .github/scripts/smoke-web.sh <image-ref>
# Exit 0 = boot + health probe pass (image safe to push).
# Exit non-zero = at least one assertion failed.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <image-ref>" >&2
  exit 64
fi

IMAGE="$1"

echo "[smoke-web] 1/2 non-root UID check (Phase 25 D-19 #1)"
ACTUAL_UID="$(docker run --rm --entrypoint /usr/bin/id "$IMAGE" -u)"
if [ "$ACTUAL_UID" != "1001" ]; then
  echo "[smoke-web] FAIL: expected uid 1001, got '$ACTUAL_UID'" >&2
  exit 1
fi

echo "[smoke-web] 2/2 boot + /api/health probe (Phase 25 D-19 #7, #8)"
CID="$(docker run -d -p 3000:3000 "$IMAGE")"
cleanup() { docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -fsS http://localhost:3000/api/health 2>/dev/null | grep -q '"ok":true'; then
    echo "[smoke-web] PASS: /api/health returned ok=true after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "[smoke-web] FAIL: /api/health did not return ok=true within 30s" >&2
echo "[smoke-web] container logs (last 50 lines):" >&2
docker logs --tail 50 "$CID" >&2 || true
exit 1
