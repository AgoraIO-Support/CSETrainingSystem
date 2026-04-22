#!/bin/zsh
set -euo pipefail
set +x +v 2>/dev/null || true
unsetopt xtrace verbose 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  zsh scripts/mcp/test-sme-mcp-v3.sh [--help]

Description:
  Run a focused SME MCP v3 smoke against the new SME-first tools.

Covered tools:
  - list_my_workspace
  - create_badge
  - create_series
  - create_event
  - create_course
  - design_course
  - create_exam
  - design_exam_questions
  - share_course_with_learners
  - publish_exam_for_learners
  - review_event_status

Environment variables:
  BASE_URL        Default: http://localhost:3001
  SME_EMAIL       Default: rtcsme@agora.io
  SME_PASSWORD    SME password. If omitted, the script will prompt.
  TARGET_DOMAIN   Preferred domain name or slug. Default: RTC
  TARGET_USER_EMAIL  Optional exact ACTIVE USER email for learner assignment/publish smoke.
  OUTPUT_MODE     summary | full

Examples:
  SME_PASSWORD='password123' zsh scripts/mcp/test-sme-mcp-v3.sh

  BASE_URL=http://127.0.0.1:3001 \
  SME_EMAIL=admin@agora.io \
  SME_PASSWORD='password123' \
  TARGET_DOMAIN=RTC \
  OUTPUT_MODE=summary \
  zsh scripts/mcp/test-sme-mcp-v3.sh
EOF
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    echo "ERROR: Unknown argument: $1"
    echo
    usage
    exit 1
    ;;
esac

BASE_URL="${BASE_URL:-http://localhost:3001}"
SME_EMAIL="${SME_EMAIL:-rtcsme@agora.io}"
SME_PASSWORD="${SME_PASSWORD:-}"
TARGET_DOMAIN="${TARGET_DOMAIN:-RTC}"
TARGET_USER_EMAIL="${TARGET_USER_EMAIL:-tester@agora.io}"
OUTPUT_MODE="${OUTPUT_MODE:-summary}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sme-mcp-v3-smoke.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -z "$SME_PASSWORD" ]; then
  read -s "SME_PASSWORD?SME password for ${SME_EMAIL}: "
  echo
fi

json_extract() {
  local expr="$1"
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync(0, 'utf8');
    const json = JSON.parse(raw);
    const value = (() => { return ${expr}; })();
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
  "
}

json_pretty() {
  node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8");
    console.log(JSON.stringify(JSON.parse(raw), null, 2));
  '
}

print_response() {
  local raw_json="$1"
  if [ "$OUTPUT_MODE" = "full" ]; then
    printf '%s' "$raw_json" | json_pretty
  else
    printf '%s' "$raw_json" | node -e '
      const fs = require("fs");
      const json = JSON.parse(fs.readFileSync(0, "utf8"));
      console.log(JSON.stringify({
        success: json.success,
        tool: json.tool ?? null,
        summary: json.summary ?? null,
        warnings: json.warnings ?? [],
        nextActions: json.nextActions ?? [],
        recommendedNextInputs: json.recommendedNextInputs ?? null,
        data: {
          id: json.data?.id ?? null,
          badgeId: json.data?.badge?.id ?? null,
          seriesId: json.data?.series?.id ?? null,
          eventId: json.data?.event?.id ?? null,
          courseId: json.data?.course?.id ?? null,
          examId: json.data?.exam?.id ?? null,
        },
      }, null, 2));
    '
  fi
}

assert_success() {
  local label="$1"
  node -e '
    const fs = require("fs");
    const label = process.argv[1];
    const raw = fs.readFileSync(0, "utf8");
    const json = JSON.parse(raw);
    if (json.success !== true) {
      console.error(`ERROR: ${label} failed`);
      console.error(JSON.stringify(json, null, 2));
      process.exit(1);
    }
  ' "$label"
}

api_get() {
  local endpoint="$1"
  curl -s "$BASE_URL$endpoint" -H "$AUTH_HEADER"
}

api_post() {
  local endpoint="$1"
  local body="$2"
  curl -s -X POST "$BASE_URL$endpoint" \
    -H "$AUTH_HEADER" \
    -H 'content-type: application/json' \
    -d "$body"
}

api_put() {
  local endpoint="$1"
  local body="$2"
  curl -s -X PUT "$BASE_URL$endpoint" \
    -H "$AUTH_HEADER" \
    -H 'content-type: application/json' \
    -d "$body"
}

call_sme_mcp() {
  local tool="$1"
  local input="$2"
  api_post "/api/sme/mcp" "{
    \"tool\":\"$tool\",
    \"input\":$input
  }"
}

echo "0) Check SME MCP route exists"
STATUS=$(curl -s -o "$TMP_DIR/sme_mcp_probe.out" -w "%{http_code}" -X POST "$BASE_URL/api/sme/mcp" \
  -H 'content-type: application/json' \
  -d '{"tool":"list_my_workspace","input":{}}')

if [ "$STATUS" = "404" ]; then
  echo "ERROR: $BASE_URL/api/sme/mcp returned 404"
  cat "$TMP_DIR/sme_mcp_probe.out"
  exit 1
fi

echo "1) Login as SME"
LOGIN_JSON=$(
  curl -s -X POST "$BASE_URL/api/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$SME_EMAIL\",\"password\":\"$SME_PASSWORD\"}"
)
printf '%s' "$LOGIN_JSON" | assert_success "login"

TOKEN=$(printf '%s' "$LOGIN_JSON" | json_extract 'json?.data?.session?.accessToken')
SME_USER_ID=$(printf '%s' "$LOGIN_JSON" | json_extract 'json?.data?.user?.id')
AUTH_HEADER="Authorization: Bearer $TOKEN"
echo "TOKEN acquired"
echo "SME_USER_ID=$SME_USER_ID"

echo
echo "2) Resolve learner fixture"
USERS_JSON=$(api_get "/api/admin/users?limit=200&status=ACTIVE&role=USER")
LEARNER_USER_ID=$(printf '%s' "$USERS_JSON" | json_extract '(json.data?.users || []).find(x => x.email?.toLowerCase() === "'"${TARGET_USER_EMAIL:l}"'")?.id' || true)

if [ -z "$LEARNER_USER_ID" ]; then
  echo "ERROR: TARGET_USER_EMAIL was not found among ACTIVE USER accounts: $TARGET_USER_EMAIL"
  exit 1
fi

echo "TARGET_USER_EMAIL=$TARGET_USER_EMAIL"
echo "LEARNER_USER_ID=$LEARNER_USER_ID"

RUN_SUFFIX="$(date +%Y%m%d-%H%M%S)"
BADGE_THRESHOLD=$((500 + ($(date +%s) % 400)))

echo
echo "3) list_my_workspace"
WORKSPACE_JSON=$(call_sme_mcp "list_my_workspace" '{}')
printf '%s' "$WORKSPACE_JSON" | assert_success "list_my_workspace"
print_response "$WORKSPACE_JSON"

DOMAIN_NAME=$(
  printf '%s' "$WORKSPACE_JSON" | TARGET_DOMAIN="$TARGET_DOMAIN" node -e '
    const fs = require("fs");
    const target = (process.env.TARGET_DOMAIN || "").trim().toLowerCase();
    const json = JSON.parse(fs.readFileSync(0, "utf8"));
    const domains = json.data?.domains || [];
    const match = domains.find((d) =>
      d.slug?.toLowerCase() === target || d.name?.toLowerCase() === target
    ) || domains[0];
    if (!match?.name) process.exit(1);
    process.stdout.write(match.name);
  '
)
echo "DOMAIN_NAME=$DOMAIN_NAME"

BADGE_NAME="${DOMAIN_NAME} V3 Badge ${RUN_SUFFIX}"
SERIES_NAME="${DOMAIN_NAME} V3 Series ${RUN_SUFFIX}"
EVENT_TITLE="${DOMAIN_NAME} V3 Event ${RUN_SUFFIX}"
COURSE_TITLE="${EVENT_TITLE} Course"
EXAM_TITLE="${EVENT_TITLE} Assessment"
LESSON_TITLE_ONE="Audio Flow Basics"
LESSON_TITLE_TWO="Troubleshooting Checklist"

echo
echo "4) create_badge"
CREATE_BADGE_JSON=$(call_sme_mcp "create_badge" "{
  \"name\":\"$BADGE_NAME\",
  \"domain\":\"$DOMAIN_NAME\",
  \"thresholdStars\":$BADGE_THRESHOLD,
  \"icon\":\"READY\",
  \"description\":\"Badge created by SME MCP v3 smoke.\",
  \"active\":true
}")
printf '%s' "$CREATE_BADGE_JSON" | assert_success "create_badge"
print_response "$CREATE_BADGE_JSON"
BADGE_ID=$(printf '%s' "$CREATE_BADGE_JSON" | json_extract 'json.data?.badge?.id')

echo
echo "5) create_series"
CREATE_SERIES_JSON=$(call_sme_mcp "create_series" "{
  \"name\":\"$SERIES_NAME\",
  \"seriesType\":\"CASE_STUDY\",
  \"productDomain\":\"$DOMAIN_NAME\",
  \"seriesOwner\":\"current_user\",
  \"cadence\":\"Weekly\",
  \"description\":\"Series created by SME MCP v3 smoke.\",
  \"active\":true,
  \"contributesToDomainBadges\":true
}")
printf '%s' "$CREATE_SERIES_JSON" | assert_success "create_series"
print_response "$CREATE_SERIES_JSON"
SERIES_ID=$(printf '%s' "$CREATE_SERIES_JSON" | json_extract 'json.data?.series?.id')

echo
echo "6) create_event"
CREATE_EVENT_JSON=$(call_sme_mcp "create_event" "{
  \"title\":\"$EVENT_TITLE\",
  \"learningSeries\":\"$SERIES_NAME\",
  \"format\":\"CASE_STUDY\",
  \"host\":\"current_user\",
  \"description\":\"Event created by SME MCP v3 smoke.\",
  \"countsTowardPerformance\":false,
  \"starValue\":2
}")
printf '%s' "$CREATE_EVENT_JSON" | assert_success "create_event"
print_response "$CREATE_EVENT_JSON"
EVENT_ID=$(printf '%s' "$CREATE_EVENT_JSON" | json_extract 'json.data?.event?.id')

echo
echo "7) create_course"
CREATE_COURSE_JSON=$(call_sme_mcp "create_course" "{
  \"title\":\"$COURSE_TITLE\",
  \"event\":\"$EVENT_TITLE\",
  \"description\":\"Course created by SME MCP v3 smoke.\",
  \"whatYouWillLearn\":[\"Understand RTC audio flow\",\"Follow the first troubleshooting steps\"],
  \"requirements\":[\"Basic RTC familiarity\"],
  \"level\":\"BEGINNER\",
  \"instructor\":\"current_user\",
  \"tags\":[\"mcp\",\"v3\",\"smoke\"]
}")
printf '%s' "$CREATE_COURSE_JSON" | assert_success "create_course"
print_response "$CREATE_COURSE_JSON"
COURSE_ID=$(printf '%s' "$CREATE_COURSE_JSON" | json_extract 'json.data?.course?.id')

echo
echo "8) design_course"
DESIGN_COURSE_JSON=$(call_sme_mcp "design_course" "{
  \"course\":\"$COURSE_TITLE\",
  \"mode\":\"manual_outline\",
  \"chapters\":[
    {
      \"title\":\"Foundation\",
      \"description\":\"Core RTC audio troubleshooting concepts.\",
      \"lessons\":[
        {
          \"title\":\"$LESSON_TITLE_ONE\",
          \"objective\":\"Explain the RTC audio path.\",
          \"summary\":\"Introduce the main audio flow in RTC troubleshooting.\"
        },
        {
          \"title\":\"$LESSON_TITLE_TWO\",
          \"objective\":\"Apply a first-pass troubleshooting checklist.\",
          \"summary\":\"Walk through basic checks before deeper analysis.\"
        }
      ]
    }
  ],
  \"assetPlan\":[
    {
      \"lessonRef\":\"$LESSON_TITLE_ONE\",
      \"assetType\":\"VIDEO\",
      \"title\":\"Audio Flow Demo\",
      \"sourceKind\":\"upload\",
      \"transcriptNeeded\":true
    }
  ],
  \"transcriptPlan\":[
    {
      \"lessonRef\":\"$LESSON_TITLE_ONE\",
      \"languageCode\":\"en\",
      \"setAsDefaultSubtitle\":true,
      \"setAsPrimaryForAI\":true
    }
  ]
}")
printf '%s' "$DESIGN_COURSE_JSON" | assert_success "design_course"
print_response "$DESIGN_COURSE_JSON"

echo
echo "9) create_exam"
CREATE_EXAM_JSON=$(call_sme_mcp "create_exam" "{
  \"title\":\"$EXAM_TITLE\",
  \"event\":\"$EVENT_TITLE\",
  \"description\":\"Exam created by SME MCP v3 smoke.\",
  \"instructions\":\"Read each question carefully before answering.\",
  \"examType\":\"PRACTICE\",
  \"totalScore\":100,
  \"passingScore\":80,
  \"maxAttempts\":3
}")
printf '%s' "$CREATE_EXAM_JSON" | assert_success "create_exam"
print_response "$CREATE_EXAM_JSON"
EXAM_ID=$(printf '%s' "$CREATE_EXAM_JSON" | json_extract 'json.data?.exam?.id')

echo
echo "10) design_exam_questions"
DESIGN_QUESTIONS_JSON=$(call_sme_mcp "design_exam_questions" "{
  \"exam\":\"$EXAM_TITLE\",
  \"mode\":\"manual_payload\",
  \"questions\":[
    {
      \"type\":\"MULTIPLE_CHOICE\",
      \"difficulty\":\"MEDIUM\",
      \"question\":\"What should you check first in a basic RTC no-audio investigation?\",
      \"options\":[\"Audio device routing\",\"Video bitrate\",\"Screen resolution\",\"Frame rate\"],
      \"correctAnswer\":\"0\",
      \"points\":100,
      \"explanation\":\"Basic endpoint routing and device checks should come before deeper media analysis.\",
      \"topic\":\"RTC Audio\",
      \"tags\":[\"rtc\",\"audio\",\"troubleshooting\"]
    }
  ]
}")
printf '%s' "$DESIGN_QUESTIONS_JSON" | assert_success "design_exam_questions"
print_response "$DESIGN_QUESTIONS_JSON"

echo
echo "11) Move exam to APPROVED"
PENDING_REVIEW_JSON=$(api_post "/api/admin/exams/$EXAM_ID/status" '{"status":"PENDING_REVIEW"}')
printf '%s' "$PENDING_REVIEW_JSON" | assert_success "move exam to pending review"
print_response "$PENDING_REVIEW_JSON"

APPROVE_JSON=$(api_post "/api/admin/exams/$EXAM_ID/status" '{"status":"APPROVED"}')
printf '%s' "$APPROVE_JSON" | assert_success "approve exam"
print_response "$APPROVE_JSON"

echo
echo "12) Publish course fixture"
PUBLISH_COURSE_JSON=$(api_put "/api/admin/courses/$COURSE_ID" '{
  "status":"PUBLISHED",
  "sendNotification":false
}')
printf '%s' "$PUBLISH_COURSE_JSON" | assert_success "publish course"
print_response "$PUBLISH_COURSE_JSON"

echo
echo "13) share_course_with_learners"
SHARE_COURSE_JSON=$(call_sme_mcp "share_course_with_learners" "{
  \"course\":\"$COURSE_TITLE\",
  \"userIds\":[\"$LEARNER_USER_ID\"],
  \"sendNotification\":false
}")
printf '%s' "$SHARE_COURSE_JSON" | assert_success "share_course_with_learners"
print_response "$SHARE_COURSE_JSON"

echo
echo "14) publish_exam_for_learners"
PUBLISH_EXAM_JSON=$(call_sme_mcp "publish_exam_for_learners" "{
  \"exam\":\"$EXAM_TITLE\",
  \"userIds\":[\"$LEARNER_USER_ID\"],
  \"sendNotification\":false
}")
printf '%s' "$PUBLISH_EXAM_JSON" | assert_success "publish_exam_for_learners"
print_response "$PUBLISH_EXAM_JSON"

echo
echo "15) review_event_status"
REVIEW_STATUS_JSON=$(call_sme_mcp "review_event_status" "{
  \"event\":\"$EVENT_TITLE\"
}")
printf '%s' "$REVIEW_STATUS_JSON" | assert_success "review_event_status"
print_response "$REVIEW_STATUS_JSON"

printf '%s' "$REVIEW_STATUS_JSON" | node -e '
  const fs = require("fs");
  const json = JSON.parse(fs.readFileSync(0, "utf8"));
  const data = json.data || {};
  console.log(JSON.stringify({
    linkedCourses: data.courses?.length ?? 0,
    linkedExams: data.exams?.length ?? 0,
    lessonStates: data.lessonStates?.length ?? 0,
    blockers: data.blockers ?? [],
    nextActions: json.nextActions ?? [],
  }, null, 2));
'

echo
echo "Done."
echo "Created IDs:"
echo "  BADGE_ID=$BADGE_ID"
echo "  SERIES_ID=$SERIES_ID"
echo "  EVENT_ID=$EVENT_ID"
echo "  COURSE_ID=$COURSE_ID"
echo "  EXAM_ID=$EXAM_ID"
echo "  LEARNER_USER_ID=$LEARNER_USER_ID"
