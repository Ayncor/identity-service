#!/usr/bin/env bash
# Quick Role & Permissions Verification Script (macOS / Linux)
# No database access required - uses API only.
# Usage: ./test-roles.sh [BASE_URL]
# Example: ./test-roles.sh http://localhost:3001

set -e

BASE_URL="${1:-http://localhost:3001}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Decode base64url (JWT payload); works on macOS (base64 -D) and Linux (base64 -d)
decode_base64url() {
  local raw="$1"
  local padded
  padded="$(printf '%s' "$raw" | tr '-_' '+/' | awk '{ n = length % 4; if (n) for (; n < 4; n++) $0 = $0 "="; print }')"
  if printf '%s' "$padded" | base64 -d 2>/dev/null; then
    return 0
  fi
  printf '%s' "$padded" | base64 -D 2>/dev/null
}

# Parse JSON field (requires python3)
json_get() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d.get(sys.argv[1])
    if v is None: pass
    elif isinstance(v, list): print('\n'.join(str(x) for x in v))
    else: print(v)
except Exception: pass
" "$key" 2>/dev/null
}

echo "${CYAN}=== Testing Role Model and Permissions ===${NC}"
echo ""

# 1. Login
echo "${YELLOW}1. Logging in...${NC}"
LOGIN_RESP="$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ayncor.local","password":"ayncor@123","org_slug":"ayncor"}')"
HTTP_CODE="$(echo "$LOGIN_RESP" | tail -n1)"
BODY="$(echo "$LOGIN_RESP" | sed '$d')"

if [ "$HTTP_CODE" != "200" ]; then
  echo "   ${RED}✗ Login failed (HTTP $HTTP_CODE): $BODY${NC}"
  exit 1
fi

ACCESS="$(json_get "$BODY" "access_token")"
REFRESH="$(json_get "$BODY" "refresh_token")"
if [ -z "$ACCESS" ]; then
  echo "   ${RED}✗ Login response missing access_token${NC}"
  exit 1
fi
echo "   ${GREEN}✓ Login successful${NC}"

# 2. Decode JWT
echo ""
echo "${YELLOW}2. Decoding JWT token...${NC}"
PARTS_1="$(echo "$ACCESS" | cut -d. -f1)"
PARTS_2="$(echo "$ACCESS" | cut -d. -f2)"
PARTS_3="$(echo "$ACCESS" | cut -d. -f3)"

if [ -z "$PARTS_2" ]; then
  echo "   ${RED}✗ Invalid JWT format${NC}"
  exit 1
fi

CLAIMS_RAW="$(decode_base64url "$PARTS_2")"
if [ -z "$CLAIMS_RAW" ]; then
  echo "   ${RED}✗ Failed to decode JWT payload${NC}"
  exit 1
fi
echo "   ${GREEN}✓ JWT decoded successfully${NC}"

# Display claims
echo ""
echo "${CYAN}=== JWT Claims ===${NC}"
SUB="$(json_get "$CLAIMS_RAW" "sub")"
ORG_ID="$(json_get "$CLAIMS_RAW" "org_id")"
MEM_ID="$(json_get "$CLAIMS_RAW" "membership_id")"
ROLE_ID="$(json_get "$CLAIMS_RAW" "role_id")"
JTI="$(json_get "$CLAIMS_RAW" "jti")"
echo "User ID (sub):        $SUB"
echo "Org ID:               $ORG_ID"
echo "Membership ID:        $MEM_ID"
echo "Role ID:              $ROLE_ID"
echo "JWT ID (jti):         $JTI"

# Permissions (may be multiple lines)
echo ""
echo "${CYAN}=== Permissions ===${NC}"
PERMS="$(json_get "$CLAIMS_RAW" "perms")"
if [ -n "$PERMS" ]; then
  PERM_COUNT="$(echo "$PERMS" | wc -l | tr -d ' ')"
  echo "${GREEN}✓ Permissions are included in JWT ($PERM_COUNT permissions)${NC}"
  echo ""
  echo "${YELLOW}Permissions list:${NC}"
  echo "$PERMS" | while read -r p; do [ -n "$p" ] && echo "  • $p"; done

  if echo "$PERMS" | grep -q "org:manage_members"; then
    echo ""
    echo "${GREEN}✓ User has ORG_ADMIN permissions${NC}"
  elif echo "$PERMS" | grep -q "org:read"; then
    echo ""
    echo "${GREEN}✓ User has ORG_MEMBER permissions${NC}"
  fi
else
  echo "${RED}✗ Permissions are missing!${NC}"
fi

# Verify jti
echo ""
echo "${CYAN}=== JWT ID (jti) ===${NC}"
if [ -n "$JTI" ]; then
  echo "${GREEN}✓ JWT ID (jti) is included: $JTI${NC}"
else
  echo "${RED}✗ JWT ID (jti) is missing!${NC}"
fi

# 3. Test refresh token
echo ""
echo "${YELLOW}3. Testing refresh token...${NC}"
REFRESH_RESP="$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}")"
REFRESH_CODE="$(echo "$REFRESH_RESP" | tail -n1)"
REFRESH_BODY="$(echo "$REFRESH_RESP" | sed '$d')"

if [ "$REFRESH_CODE" != "200" ]; then
  echo "   ${RED}✗ Refresh failed (HTTP $REFRESH_CODE): $REFRESH_BODY${NC}"
else
  NEW_ACCESS="$(json_get "$REFRESH_BODY" "access_token")"
  NEW_PAYLOAD="$(echo "$NEW_ACCESS" | cut -d. -f2)"
  NEW_CLAIMS="$(decode_base64url "$NEW_PAYLOAD")"
  NEW_PERMS="$(json_get "$NEW_CLAIMS" "perms")"
  NEW_JTI="$(json_get "$NEW_CLAIMS" "jti")"
  echo "   ${GREEN}✓ Refresh successful${NC}"
  if [ -n "$NEW_PERMS" ]; then
    echo "   ${GREEN}✓ New JWT has perms: true${NC}"
  else
    echo "   ${RED}✗ New JWT has perms: false${NC}"
  fi
  if [ -n "$NEW_JTI" ]; then
    echo "   ${GREEN}✓ New JWT has jti: true${NC}"
  else
    echo "   ${RED}✗ New JWT has jti: false${NC}"
  fi
fi

# Summary
echo ""
echo "${CYAN}=== Summary ===${NC}"
ALL_GOOD=0
[ -z "$PERMS" ] && { echo "${RED}✗ Permissions missing in JWT${NC}"; ALL_GOOD=1; }
[ -z "$JTI" ]   && { echo "${RED}✗ JWT ID (jti) missing${NC}"; ALL_GOOD=1; }
[ -z "$ROLE_ID" ] && { echo "${RED}✗ Role ID missing${NC}"; ALL_GOOD=1; }

if [ "$ALL_GOOD" -eq 0 ]; then
  echo "${GREEN}✓ All checks passed! Role model and permissions are working correctly.${NC}"
else
  echo "${YELLOW}⚠ Some checks failed. Please review the output above.${NC}"
  exit 1
fi
