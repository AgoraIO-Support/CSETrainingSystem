#!/bin/zsh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api/mcp}"
INTERNAL_MCP_TOKEN="${INTERNAL_MCP_TOKEN:-testtoken}"
MCP_USER_EMAIL="${MCP_USER_EMAIL:-admin@agora.io}"

show_help() {
  cat <<'EOF'
Usage:
  zsh scripts/mcp/test-standard-mcp.sh [--help]

Environment variables:
  BASE_URL             Standard MCP endpoint. Default: http://localhost:3001/api/mcp
  INTERNAL_MCP_TOKEN   Required bearer token for the MCP server.
  MCP_USER_EMAIL       SME/ADMIN email passed through x-sme-user-email.

Example:
  BASE_URL=https://your-domain/api/mcp \
  INTERNAL_MCP_TOKEN=your-token \
  MCP_USER_EMAIL=rtcsme@agora.io \
  zsh scripts/mcp/test-standard-mcp.sh
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

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

LEGACY_TOOLS_JSON='["assign_course_invitations","publish_exam_with_invitations","get_event_execution_status","set_course_ai_template","create_case_study_bundle","link_existing_course_to_event","link_existing_exam_to_event"]'

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
TOOLS_LIST_JSON=$(curl -s "$BASE_URL" \
  -H "$AUTH_HEADER" \
  -H "$USER_HEADER" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
printf '%s' "$TOOLS_LIST_JSON" | json_pretty

printf '%s' "$TOOLS_LIST_JSON" | node -e '
  const fs = require("fs");
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const tools = payload?.result?.tools?.map((tool) => tool.name) ?? [];
  const legacy = JSON.parse(process.argv[1]);
  const found = legacy.filter((name) => tools.includes(name));
  if (found.length > 0) {
    console.error(`ERROR: legacy tools are still exposed: ${found.join(", ")}`);
    process.exit(1);
  }
  console.log("Legacy tool exposure check passed.");
' "$LEGACY_TOOLS_JSON"

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
