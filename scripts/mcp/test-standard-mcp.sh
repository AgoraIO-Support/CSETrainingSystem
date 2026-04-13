#!/bin/zsh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api/mcp}"
INTERNAL_MCP_TOKEN="${INTERNAL_MCP_TOKEN:-testtoken}"
MCP_USER_EMAIL="${MCP_USER_EMAIL:-admin@agora.io}"

if [ -z "$INTERNAL_MCP_TOKEN" ]; then
  echo "ERROR: INTERNAL_MCP_TOKEN is required"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $INTERNAL_MCP_TOKEN"
USER_HEADER="x-sme-user-email: $MCP_USER_EMAIL"

json_pretty() {
  node -e '
    const fs = require("fs");
    const data = fs.readFileSync(0, "utf8");
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  '
}

echo "1) initialize"
curl -s "$BASE_URL" \
  -H "$AUTH_HEADER" \
  -H "$USER_HEADER" \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-03-26",
      "capabilities":{},
      "clientInfo":{"name":"local-smoke","version":"0.1.0"}
    }
  }' | json_pretty

echo
echo "2) notifications/initialized"
INIT_STATUS=$(curl -s -o /tmp/standard_mcp_initialized.out -w "%{http_code}" "$BASE_URL" \
  -H "$AUTH_HEADER" \
  -H "$USER_HEADER" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
)
printf 'HTTP %s\n' "$INIT_STATUS"

echo
echo "3) tools/list"
curl -s "$BASE_URL" \
  -H "$AUTH_HEADER" \
  -H "$USER_HEADER" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | json_pretty

echo
echo "4) tools/call list_my_workspace"
curl -s "$BASE_URL" \
  -H "$AUTH_HEADER" \
  -H "$USER_HEADER" \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"list_my_workspace",
      "arguments":{}
    }
  }' | json_pretty
