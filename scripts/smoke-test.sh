#!/usr/bin/env bash
#
# Smoke test for Flinders Collab application.
# Usage:
#   ./scripts/smoke-test.sh [BASE_URL]
#
# BASE_URL defaults to http://localhost:3001 if not provided.

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
PASS=0
FAIL=0
SKIP=0

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

report() {
  echo ""
  echo "=============================="
  echo " Smoke Test Results"
  echo "=============================="
  green  " PASSED:  $PASS"
  red    " FAILED:  $FAIL"
  yellow " SKIPPED: $SKIP"
  echo "=============================="
  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}

trap report EXIT

echo "Smoke testing against: $BASE_URL"
echo ""

# -------------------------------------------------------------------
# 1. Health check
# -------------------------------------------------------------------
echo "1. Checking /api/health ..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  green "   PASS - /api/health returned 200"
  PASS=$((PASS + 1))
else
  red "   FAIL - /api/health returned $HTTP_CODE (expected 200)"
  FAIL=$((FAIL + 1))
fi

# -------------------------------------------------------------------
# 2. Client build check
# -------------------------------------------------------------------
echo "2. Checking client build ..."
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -d "$PROJECT_ROOT/client" ]; then
  # Check if dist already exists or try building
  if [ -f "$PROJECT_ROOT/client/dist/index.html" ]; then
    green "   PASS - client/dist/index.html exists"
    PASS=$((PASS + 1))
  else
    echo "   Building client (npm run build) ..."
    if (cd "$PROJECT_ROOT/client" && npm run build --silent 2>&1); then
      if [ -f "$PROJECT_ROOT/client/dist/index.html" ]; then
        green "   PASS - client build succeeded"
        PASS=$((PASS + 1))
      else
        red "   FAIL - build ran but dist/index.html not found"
        FAIL=$((FAIL + 1))
      fi
    else
      red "   FAIL - client build failed"
      FAIL=$((FAIL + 1))
    fi
  fi
else
  red "   FAIL - client/ directory not found at $PROJECT_ROOT/client"
  FAIL=$((FAIL + 1))
fi

# -------------------------------------------------------------------
# 3. Auth flow - attempt signup/login
# -------------------------------------------------------------------
echo "3. Testing auth endpoint ..."
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com","password":"smokeTestPass123!"}' \
  2>/dev/null || echo "000")

if [ "$AUTH_CODE" = "000" ]; then
  yellow "   SKIP - server not reachable, cannot test auth"
  SKIP=$((SKIP + 1))
elif [ "$AUTH_CODE" = "200" ] || [ "$AUTH_CODE" = "201" ]; then
  green "   PASS - auth endpoint returned $AUTH_CODE"
  PASS=$((PASS + 1))
elif [ "$AUTH_CODE" = "400" ] || [ "$AUTH_CODE" = "401" ] || [ "$AUTH_CODE" = "422" ]; then
  green "   PASS - auth endpoint reachable (returned $AUTH_CODE, expected for invalid/test creds)"
  PASS=$((PASS + 1))
elif [ "$AUTH_CODE" = "404" ]; then
  yellow "   SKIP - /api/auth/login not found (auth may use Supabase client-side)"
  SKIP=$((SKIP + 1))
else
  red "   FAIL - auth endpoint returned unexpected $AUTH_CODE"
  FAIL=$((FAIL + 1))
fi

# -------------------------------------------------------------------
# 4. Rooms endpoint
# -------------------------------------------------------------------
echo "4. Testing rooms endpoint ..."
ROOMS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/rooms" \
  2>/dev/null || echo "000")

if [ "$ROOMS_CODE" = "000" ]; then
  yellow "   SKIP - server not reachable"
  SKIP=$((SKIP + 1))
elif [ "$ROOMS_CODE" = "200" ]; then
  green "   PASS - /api/rooms returned 200"
  PASS=$((PASS + 1))
elif [ "$ROOMS_CODE" = "401" ] || [ "$ROOMS_CODE" = "403" ]; then
  green "   PASS - /api/rooms returned $ROOMS_CODE (auth required, endpoint exists)"
  PASS=$((PASS + 1))
else
  red "   FAIL - /api/rooms returned $ROOMS_CODE"
  FAIL=$((FAIL + 1))
fi

# -------------------------------------------------------------------
# 5. Socket.IO availability
# -------------------------------------------------------------------
echo "5. Checking Socket.IO endpoint ..."
SIO_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/socket.io/?EIO=4&transport=polling" \
  2>/dev/null || echo "000")

if [ "$SIO_CODE" = "000" ]; then
  yellow "   SKIP - server not reachable"
  SKIP=$((SKIP + 1))
elif [ "$SIO_CODE" = "200" ] || [ "$SIO_CODE" = "400" ]; then
  green "   PASS - Socket.IO endpoint reachable (returned $SIO_CODE)"
  PASS=$((PASS + 1))
else
  red "   FAIL - Socket.IO endpoint returned $SIO_CODE"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Done."
