#!/bin/zsh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
SME_EMAIL="${SME_EMAIL:-rtcsme@agora.io}"
SME_PASSWORD="${SME_PASSWORD:-}"

if [ -z "$SME_PASSWORD" ]; then
  read -s "SME_PASSWORD?SME password for ${SME_EMAIL}: "
  echo
fi

assert_deprecated() {
  local tool_name="$1"
  local payload="$2"

  RESPONSE=$(
    curl -s "$BASE_URL/api/sme/mcp" \
      -H "$AUTH_HEADER" \
      -H 'content-type: application/json' \
      -d "$payload"
  )

  printf '%s' "$RESPONSE" | node -e '
    const fs = require("fs");
    const j = JSON.parse(fs.readFileSync(0, "utf8"));
    if (j?.error?.code !== "MCP_TOOL_DEPRECATED") {
      console.error(JSON.stringify(j, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({
      code: j.error.code,
      message: j.error.message
    }, null, 2));
  '

  echo "Verified deprecated tool: $tool_name"
}

echo "1) Login as SME"
LOGIN_JSON=$(
  curl -s -X POST "$BASE_URL/api/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$SME_EMAIL\",\"password\":\"$SME_PASSWORD\"}"
)

TOKEN=$(printf '%s' "$LOGIN_JSON" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); if(!j?.data?.session?.accessToken){ console.error(JSON.stringify(j,null,2)); process.exit(1);} process.stdout.write(j.data.session.accessToken);')
AUTH_HEADER="Authorization: Bearer $TOKEN"
echo "TOKEN acquired"

echo
echo "2) Deprecated exam question tool should be rejected"
assert_deprecated "create_exam_question" '{
  "tool":"create_exam_question",
  "input":{
    "examId":"00000000-0000-0000-0000-000000000000",
    "data":{
      "type":"SINGLE_CHOICE",
      "question":"Deprecated MCP tool?",
      "points":10
    }
  }
}'

echo
echo "3) Deprecated course editor tool should be rejected"
assert_deprecated "list_course_editor_state" '{
  "tool":"list_course_editor_state",
  "input":{
    "courseId":"00000000-0000-0000-0000-000000000000"
  }
}'

echo
echo "Done. Deprecated MCP tools are no longer exposed in SME MCP v2."
