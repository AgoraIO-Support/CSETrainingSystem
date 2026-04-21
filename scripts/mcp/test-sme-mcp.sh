#!/bin/zsh
set -euo pipefail
set +x +v 2>/dev/null || true
unsetopt xtrace verbose 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  zsh scripts/mcp/test-sme-mcp.sh [--help]

Description:
  Run the SME MCP v2 end-to-end smoke test against the current environment.

What this script covers:
  - login as SME
  - list_my_workspace
  - create_case_study_bundle
  - create chapter / lesson / lesson assets
  - set_course_ai_template
  - link_existing_course_to_event
  - link_existing_exam_to_event
  - create exam questions
  - publish course + assign_course_invitations
  - prepare_transcript_upload + process_transcript_knowledge
  - publish_exam_with_invitations
  - get_event_execution_status

Environment variables:
  BASE_URL                         Default: http://localhost:3001
  SME_EMAIL                        Default: rtcsme@agora.io
  SME_PASSWORD                     SME password. If omitted, the script will prompt.
  TARGET_USER_EMAIL                Optional. Exact ACTIVE USER email for course/exam invitation smoke.
  TRANSCRIPT_LESSON_ID             Optional. Override lesson used for transcript tools.
  TRANSCRIPT_VIDEO_ASSET_ID        Optional. Override video asset used for transcript tools.
  TRANSCRIPT_VTT_FILE              Default: scripts/mcp/transcript-smoke.vtt
  TRANSCRIPT_POLL_INTERVAL_SECONDS Default: 5
  TRANSCRIPT_POLL_TIMEOUT_SECONDS  Default: 90
  OUTPUT_MODE                      full | quiet | summary | compact

Examples:
  SME_PASSWORD='password123' zsh scripts/mcp/test-sme-mcp.sh

  BASE_URL=http://127.0.0.1:3001 \
  SME_EMAIL=admin@agora.io \
  SME_PASSWORD='password123' \
  OUTPUT_MODE=quiet \
  zsh scripts/mcp/test-sme-mcp.sh

  BASE_URL=http://127.0.0.1:3001 \
  SME_EMAIL=admin@agora.io \
  SME_PASSWORD='password123' \
  TARGET_USER_EMAIL='learner@example.com' \
  OUTPUT_MODE=quiet \
  zsh scripts/mcp/test-sme-mcp.sh
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
TARGET_USER_EMAIL="${TARGET_USER_EMAIL:-tester@agora.io}"
TRANSCRIPT_LESSON_ID="${TRANSCRIPT_LESSON_ID:-}"
TRANSCRIPT_VIDEO_ASSET_ID="${TRANSCRIPT_VIDEO_ASSET_ID:-}"
TRANSCRIPT_VTT_FILE="${TRANSCRIPT_VTT_FILE:-$SCRIPT_DIR/transcript-smoke.vtt}"
TRANSCRIPT_POLL_INTERVAL_SECONDS="${TRANSCRIPT_POLL_INTERVAL_SECONDS:-5}"
TRANSCRIPT_POLL_TIMEOUT_SECONDS="${TRANSCRIPT_POLL_TIMEOUT_SECONDS:-90}"
OUTPUT_MODE="${OUTPUT_MODE:-full}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sme-mcp-smoke.XXXXXX")"
DOC_FIXTURE_FILE="$TMP_DIR/smoke-training-notes.txt"
VIDEO_FIXTURE_FILE="$TMP_DIR/smoke-training-video.mp4"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -z "$SME_PASSWORD" ]; then
  read -s "SME_PASSWORD?SME password for ${SME_EMAIL}: "
  echo
fi

if [ ! -f "$TRANSCRIPT_VTT_FILE" ]; then
  echo "ERROR: Transcript VTT fixture not found: $TRANSCRIPT_VTT_FILE"
  exit 1
fi

write_fixture_files() {
  cat > "$DOC_FIXTURE_FILE" <<'EOF'
SME MCP smoke training notes

- This lesson verifies chapter creation
- This lesson verifies lesson creation
- This lesson verifies lesson asset upload
- This lesson provides fixture content for transcript and knowledge processing
EOF

  # Minimal fake MP4 payload for upload smoke. The backend only needs a valid asset row and uploaded bytes.
  printf '\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free\x00\x00\x00\x08mdat' > "$VIDEO_FIXTURE_FILE"
}

json_extract() {
  local expr="$1"
  node -e "
    const fs = require('fs');
    const data = fs.readFileSync(0, 'utf8');
    const json = JSON.parse(data);
    const value = (() => { return ${expr}; })();
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
  "
}

json_pretty() {
  node -e '
    const fs = require("fs");
    const data = fs.readFileSync(0, "utf8");
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  '
}

is_quiet_mode() {
  case "$OUTPUT_MODE" in
    quiet|summary|compact)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

print_response() {
  local raw_json="$1"
  if is_quiet_mode; then
    printf '%s' "$raw_json" | node -e '
      const fs = require("fs");
      const json = JSON.parse(fs.readFileSync(0, "utf8"));
      const summary = {
        success: json.success,
        tool: json.tool ?? null,
        summary: json.summary ?? null,
        id: json.data?.id ?? null,
        eventId: json.data?.event?.id ?? null,
        courseId: json.data?.course?.id ?? null,
        examId: json.data?.exam?.id ?? null,
        lessonId: json.data?.lessonId ?? null,
        transcriptId: json.data?.transcriptId ?? json.data?.transcriptAsset?.id ?? null,
        uploadPrepared: Boolean(json.data?.uploadUrl),
        nextActions: json.nextActions ?? null,
        warnings: json.warnings ?? null,
      };
      console.log(JSON.stringify(summary, null, 2));
    '
  else
    printf '%s' "$raw_json" | json_pretty
  fi
}

print_poll_snapshot() {
  local raw_json="$1"
  local lesson_id="$2"
  if is_quiet_mode; then
    printf '%s' "$raw_json" | node -e '
      const fs = require("fs");
      const j = JSON.parse(fs.readFileSync(0, "utf8"));
      const lesson = (j.data?.lessonStates || []).find((entry) => entry.lessonId === process.argv[1]) || null;
      console.log(JSON.stringify({
        transcriptReady: lesson?.transcript?.status,
        knowledgeReady: lesson?.knowledge?.status,
        transcriptJob: lesson?.transcript?.latestJob?.state ?? null,
        knowledgeJob: lesson?.knowledge?.latestJob?.state ?? null,
      }, null, 2));
    ' "$lesson_id"
  else
    printf '%s' "$raw_json" | node -e '
      const fs = require("fs");
      const j = JSON.parse(fs.readFileSync(0, "utf8"));
      const lesson = (j.data?.lessonStates || []).find((entry) => entry.lessonId === process.argv[1]) || null;
      console.log(JSON.stringify({
        transcriptStatus: j.data?.transcriptStatus,
        knowledgeStatus: j.data?.knowledgeStatus,
        lesson,
      }, null, 2));
    ' "$lesson_id"
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

slugify() {
  local value="$1"
  printf '%s' "$value" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
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

api_patch() {
  local endpoint="$1"
  local body="$2"
  curl -s -X PATCH "$BASE_URL$endpoint" \
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

upload_to_presigned_url() {
  local upload_url="$1"
  local content_type="$2"
  local file_path="$3"

  local upload_status
  upload_status=$(
    curl -s -o "$TMP_DIR/upload.out" -w "%{http_code}" -X PUT "$upload_url" \
      -H "content-type: $content_type" \
      -H 'x-amz-server-side-encryption: AES256' \
      --upload-file "$file_path"
  )

  echo "UPLOAD_STATUS=$upload_status"
  if [ "$upload_status" -lt 200 ] || [ "$upload_status" -ge 300 ]; then
    echo "ERROR: Upload failed"
    cat "$TMP_DIR/upload.out"
    exit 1
  fi
}

confirm_lesson_asset_upload() {
  local course_id="$1"
  local chapter_id="$2"
  local lesson_id="$3"
  local upload_session_id="$4"

  api_post "/api/admin/courses/$course_id/chapters/$chapter_id/lessons/$lesson_id/assets/confirm" "{
    \"uploadSessionId\":\"$upload_session_id\"
  }"
}

poll_transcript_completion() {
  set +x +v 2>/dev/null || true
  unsetopt xtrace verbose 2>/dev/null || true
  local event_id="$1"
  local lesson_id="$2"
  local deadline=$((SECONDS + TRANSCRIPT_POLL_TIMEOUT_SECONDS))
  local ready="0"

  while [ "$SECONDS" -lt "$deadline" ]; do
    local status_json
    status_json=$(
      api_post "/api/sme/mcp" "{
        \"tool\":\"get_event_execution_status\",
        \"input\":{
          \"eventId\":\"$event_id\"
        }
      }"
    )
    printf '%s' "$status_json" | assert_success "get_event_execution_status (poll transcript)"

    print_poll_snapshot "$status_json" "$lesson_id"

    ready="$(printf '%s' "$status_json" | node -e '
      const fs = require("fs");
      const j = JSON.parse(fs.readFileSync(0, "utf8"));
      const lesson = (j.data?.lessonStates || []).find((entry) => entry.lessonId === process.argv[1]) || null;
      const ok = lesson?.transcript?.status === "READY" && lesson?.knowledge?.status === "READY";
      process.stdout.write(ok ? "1" : "0");
    ' "$lesson_id")"

    if [ "$ready" = "1" ]; then
      return 0
    fi

    local failed
    failed="$(printf '%s' "$status_json" | node -e '
      const fs = require("fs");
      const j = JSON.parse(fs.readFileSync(0, "utf8"));
      const lesson = (j.data?.lessonStates || []).find((entry) => entry.lessonId === process.argv[1]) || null;
      const hasFailed =
        lesson?.transcript?.status === "FAILED" ||
        lesson?.knowledge?.status === "FAILED" ||
        lesson?.transcript?.latestJob?.state === "FAILED" ||
        lesson?.knowledge?.latestJob?.state === "FAILED";
      process.stdout.write(hasFailed ? "1" : "0");
    ' "$lesson_id")"

    if [ "$failed" = "1" ]; then
      echo "ERROR: Transcript or knowledge processing failed for lesson $lesson_id"
      exit 1
    fi

    sleep "$TRANSCRIPT_POLL_INTERVAL_SECONDS"
  done

  echo "ERROR: Timed out waiting for transcript processing to complete for lesson $lesson_id"
  exit 1
}

write_fixture_files
RUN_SUFFIX="$(date +%Y%m%d-%H%M%S)"

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
echo "2) Resolve RTC domain + series + learner"
DOMAIN_JSON=$(api_get "/api/sme/training-ops/domains")
SERIES_JSON=$(api_get "/api/sme/training-ops/series")
USERS_JSON=$(api_get "/api/admin/users?limit=200&status=ACTIVE&role=USER")

DOMAIN_ID=$(printf '%s' "$DOMAIN_JSON" | json_extract '(json.data || []).find(x => x.slug === "rtc" || /rtc/i.test(x.name))?.id')
SERIES_ID=$(printf '%s' "$SERIES_JSON" | json_extract '(json.data || []).find(x => x.slug === "rtc-weekly-case-study" || /rtc/i.test(x.name))?.id')

if [ -n "$TARGET_USER_EMAIL" ]; then
  LEARNER_USER_ID=$(printf '%s' "$USERS_JSON" | json_extract '(json.data?.users || []).find(x => x.email?.toLowerCase() === "'"${TARGET_USER_EMAIL:l}"'")?.id' || true)
else
  LEARNER_USER_ID=$(printf '%s' "$USERS_JSON" | json_extract '(json.data?.users || []).find(x => x.email !== "'"$SME_EMAIL"'")?.id' || true)
fi

echo "DOMAIN_ID=$DOMAIN_ID"
echo "SERIES_ID=$SERIES_ID"
echo "LEARNER_USER_ID=$LEARNER_USER_ID"
if [ -n "$TARGET_USER_EMAIL" ]; then
  echo "TARGET_USER_EMAIL=$TARGET_USER_EMAIL"
fi

if [ -z "$LEARNER_USER_ID" ]; then
  if [ -n "$TARGET_USER_EMAIL" ]; then
    echo "ERROR: TARGET_USER_EMAIL was not found among ACTIVE USER accounts: $TARGET_USER_EMAIL"
  else
    echo "ERROR: No ACTIVE USER available for invitation smoke"
  fi
  exit 1
fi

echo
echo "3) list_my_workspace"
WORKSPACE_JSON=$(
  api_post "/api/sme/mcp" '{"tool":"list_my_workspace","input":{}}'
)
printf '%s' "$WORKSPACE_JSON" | assert_success "list_my_workspace"
printf '%s' "$WORKSPACE_JSON" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  console.log(JSON.stringify({
    success: j.success,
    summary: j.summary,
    domains: j.data?.domains?.length,
    series: j.data?.series?.length,
    pendingEvents: j.data?.pendingEvents?.length,
    draftCourses: j.data?.draftCourses?.length,
    draftExams: j.data?.draftExams?.length
  }, null, 2));
'

echo
echo "4) create_case_study_bundle"
BUNDLE_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"create_case_study_bundle\",
    \"input\":{
      \"domainId\":\"$DOMAIN_ID\",
      \"seriesId\":\"$SERIES_ID\",
      \"title\":\"RTC Weekly Case Study - MCP v2 Smoke $RUN_SUFFIX\",
      \"description\":\"Created from SME MCP v2 smoke test\",
      \"starValue\":2,
      \"assessmentKind\":\"PRACTICE\",
      \"countsTowardPerformance\":false
    }
  }"
)
printf '%s' "$BUNDLE_JSON" | assert_success "create_case_study_bundle"
print_response "$BUNDLE_JSON"

EVENT_ID=$(printf '%s' "$BUNDLE_JSON" | json_extract 'json.data?.event?.id')
COURSE_ID=$(printf '%s' "$BUNDLE_JSON" | json_extract 'json.data?.course?.id')
EXAM_ID=$(printf '%s' "$BUNDLE_JSON" | json_extract 'json.data?.exam?.id')

echo "EVENT_ID=$EVENT_ID"
echo "COURSE_ID=$COURSE_ID"
echo "EXAM_ID=$EXAM_ID"

echo
echo "5) get_event_execution_status"
STATUS_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"get_event_execution_status\",
    \"input\":{
      \"eventId\":\"$EVENT_ID\"
    }
  }"
)
printf '%s' "$STATUS_JSON" | assert_success "get_event_execution_status"
printf '%s' "$STATUS_JSON" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  console.log(JSON.stringify({
    success: j.success,
    summary: j.summary,
    linkedCourses: j.data?.courses?.length,
    linkedExams: j.data?.exams?.length,
    transcriptStatus: j.data?.transcriptStatus,
    knowledgeStatus: j.data?.knowledgeStatus,
    nextActions: j.nextActions,
    warnings: j.warnings || []
  }, null, 2));
'

echo
echo "6) Create Chapter + Lesson + lesson assets"
CHAPTER_JSON=$(
  api_post "/api/admin/courses/$COURSE_ID/chapters" "{
    \"title\":\"MCP Smoke Chapter $RUN_SUFFIX\",
    \"description\":\"Fixture chapter created by SME MCP smoke script\"
  }"
)
printf '%s' "$CHAPTER_JSON" | assert_success "create chapter"
print_response "$CHAPTER_JSON"
CHAPTER_ID=$(printf '%s' "$CHAPTER_JSON" | json_extract 'json.data?.id')

LESSON_JSON=$(
  api_post "/api/admin/courses/$COURSE_ID/chapters/$CHAPTER_ID/lessons" "{
    \"title\":\"MCP Smoke Lesson $RUN_SUFFIX\",
    \"description\":\"Fixture lesson created by SME MCP smoke script\",
    \"durationMinutes\":5,
    \"lessonType\":\"VIDEO\",
    \"learningObjectives\":[
      \"Validate chapter and lesson creation\",
      \"Validate asset upload and transcript processing\"
    ],
    \"completionRule\":\"VIEW_ASSETS\"
  }"
)
printf '%s' "$LESSON_JSON" | assert_success "create lesson"
print_response "$LESSON_JSON"
LESSON_ID=$(printf '%s' "$LESSON_JSON" | json_extract 'json.data?.id')

DOC_UPLOAD_JSON=$(
  api_post "/api/admin/courses/$COURSE_ID/chapters/$CHAPTER_ID/lessons/$LESSON_ID/assets/upload" "{
    \"filename\":\"mcp-smoke-notes.txt\",
    \"contentType\":\"text/plain\",
    \"type\":\"DOCUMENT\"
  }"
)
printf '%s' "$DOC_UPLOAD_JSON" | assert_success "prepare document upload"
print_response "$DOC_UPLOAD_JSON"
DOC_UPLOAD_URL=$(printf '%s' "$DOC_UPLOAD_JSON" | json_extract 'json.data?.uploadUrl')
DOC_UPLOAD_SESSION_ID=$(printf '%s' "$DOC_UPLOAD_JSON" | json_extract 'json.data?.uploadSessionId')
upload_to_presigned_url "$DOC_UPLOAD_URL" "text/plain" "$DOC_FIXTURE_FILE"
DOC_CONFIRM_JSON=$(confirm_lesson_asset_upload "$COURSE_ID" "$CHAPTER_ID" "$LESSON_ID" "$DOC_UPLOAD_SESSION_ID")
printf '%s' "$DOC_CONFIRM_JSON" | assert_success "confirm document upload"
print_response "$DOC_CONFIRM_JSON"
DOC_ASSET_ID=$(printf '%s' "$DOC_CONFIRM_JSON" | json_extract 'json.data?.asset?.id')

VIDEO_UPLOAD_JSON=$(
  api_post "/api/admin/courses/$COURSE_ID/chapters/$CHAPTER_ID/lessons/$LESSON_ID/assets/upload" "{
    \"filename\":\"mcp-smoke-video.mp4\",
    \"contentType\":\"video/mp4\",
    \"type\":\"VIDEO\"
  }"
)
printf '%s' "$VIDEO_UPLOAD_JSON" | assert_success "prepare video upload"
print_response "$VIDEO_UPLOAD_JSON"
VIDEO_UPLOAD_URL=$(printf '%s' "$VIDEO_UPLOAD_JSON" | json_extract 'json.data?.uploadUrl')
VIDEO_UPLOAD_SESSION_ID=$(printf '%s' "$VIDEO_UPLOAD_JSON" | json_extract 'json.data?.uploadSessionId')
upload_to_presigned_url "$VIDEO_UPLOAD_URL" "video/mp4" "$VIDEO_FIXTURE_FILE"
VIDEO_CONFIRM_JSON=$(confirm_lesson_asset_upload "$COURSE_ID" "$CHAPTER_ID" "$LESSON_ID" "$VIDEO_UPLOAD_SESSION_ID")
printf '%s' "$VIDEO_CONFIRM_JSON" | assert_success "confirm video upload"
print_response "$VIDEO_CONFIRM_JSON"
VIDEO_ASSET_ID=$(printf '%s' "$VIDEO_CONFIRM_JSON" | json_extract 'json.data?.asset?.id')

LESSONS_LIST_JSON=$(api_get "/api/admin/courses/$COURSE_ID/chapters/$CHAPTER_ID/lessons")
printf '%s' "$LESSONS_LIST_JSON" | assert_success "list lessons"
printf '%s' "$LESSONS_LIST_JSON" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  const lessons = j.data || [];
  console.log(JSON.stringify({
    lessonCount: lessons.length,
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      lessonType: lesson.lessonType,
      assetCount: Array.isArray(lesson.assets) ? lesson.assets.length : 0,
    })),
  }, null, 2));
'

if [ -z "$TRANSCRIPT_LESSON_ID" ]; then
  TRANSCRIPT_LESSON_ID="$LESSON_ID"
fi
if [ -z "$TRANSCRIPT_VIDEO_ASSET_ID" ]; then
  TRANSCRIPT_VIDEO_ASSET_ID="$VIDEO_ASSET_ID"
fi

echo "CHAPTER_ID=$CHAPTER_ID"
echo "LESSON_ID=$LESSON_ID"
echo "DOC_ASSET_ID=$DOC_ASSET_ID"
echo "VIDEO_ASSET_ID=$VIDEO_ASSET_ID"
echo "TRANSCRIPT_LESSON_ID=$TRANSCRIPT_LESSON_ID"
echo "TRANSCRIPT_VIDEO_ASSET_ID=$TRANSCRIPT_VIDEO_ASSET_ID"

echo
echo "7) set_course_ai_template"
TEMPLATES_JSON=$(api_get "/api/admin/ai/prompt-templates?useCase=AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM")
TEMPLATE_ID=$(printf '%s' "$TEMPLATES_JSON" | json_extract '(json.data || []).find(x => x.isActive)?.id' || true)

if [ -n "${TEMPLATE_ID:-}" ]; then
  SET_TEMPLATE_JSON=$(
    api_post "/api/sme/mcp" "{
      \"tool\":\"set_course_ai_template\",
      \"input\":{
        \"courseId\":\"$COURSE_ID\",
        \"templateId\":\"$TEMPLATE_ID\",
        \"enabled\":true
      }
    }"
  )
else
  SET_TEMPLATE_JSON=$(
    api_post "/api/sme/mcp" "{
      \"tool\":\"set_course_ai_template\",
      \"input\":{
        \"courseId\":\"$COURSE_ID\",
        \"useDefault\":true
      }
    }"
  )
fi
printf '%s' "$SET_TEMPLATE_JSON" | assert_success "set_course_ai_template"
print_response "$SET_TEMPLATE_JSON"

echo
echo "8) list_my_series_badges"
BADGES_JSON=$(
  api_post "/api/sme/mcp" '{"tool":"list_my_series_badges","input":{}}'
)
printf '%s' "$BADGES_JSON" | assert_success "list_my_series_badges"
printf '%s' "$BADGES_JSON" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  console.log(JSON.stringify({
    success: j.success,
    summary: j.summary,
    series: j.data?.series?.length,
    ladders: j.data?.seriesLadders?.length,
    recentUnlocks: j.data?.recentUnlocks?.length
  }, null, 2));
'

echo
echo "9) link_existing_course_to_event"
SECONDARY_COURSE_SLUG="$(slugify "mcp-linked-course-$RUN_SUFFIX")"
SECONDARY_COURSE_JSON=$(
  api_post "/api/admin/courses" "{
    \"title\":\"MCP Linked Course $RUN_SUFFIX\",
    \"slug\":\"$SECONDARY_COURSE_SLUG\",
    \"description\":\"Secondary unlinked course fixture for link_existing_course_to_event smoke\",
    \"level\":\"INTERMEDIATE\",
    \"category\":\"RTC\",
    \"tags\":[\"mcp\",\"smoke\",\"rtc\"],
    \"learningOutcomes\":[\"Verify linking an existing course to an event\"],
    \"requirements\":[\"SME MCP v2 enabled\"],
    \"instructorId\":\"$SME_USER_ID\",
    \"status\":\"DRAFT\"
  }"
)
printf '%s' "$SECONDARY_COURSE_JSON" | assert_success "create secondary course"
print_response "$SECONDARY_COURSE_JSON"
SECONDARY_COURSE_ID=$(printf '%s' "$SECONDARY_COURSE_JSON" | json_extract 'json.data?.id')

LINK_COURSE_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"link_existing_course_to_event\",
    \"input\":{
      \"eventId\":\"$EVENT_ID\",
      \"courseId\":\"$SECONDARY_COURSE_ID\"
    }
  }"
)
printf '%s' "$LINK_COURSE_JSON" | assert_success "link_existing_course_to_event"
print_response "$LINK_COURSE_JSON"

echo
echo "10) link_existing_exam_to_event"
SECONDARY_EXAM_JSON=$(
  api_post "/api/admin/exams" "{
    \"examType\":\"STANDALONE\",
    \"title\":\"MCP Linked Exam $RUN_SUFFIX\",
    \"description\":\"Secondary unlinked exam fixture for link_existing_exam_to_event smoke\",
    \"instructions\":\"Answer based on the linked event context.\",
    \"timezone\":\"UTC\",
    \"totalScore\":10,
    \"passingScore\":7,
    \"assessmentKind\":\"PRACTICE\",
    \"productDomainId\":\"$DOMAIN_ID\",
    \"learningSeriesId\":\"$SERIES_ID\",
    \"countsTowardPerformance\":false
  }"
)
printf '%s' "$SECONDARY_EXAM_JSON" | assert_success "create secondary exam"
print_response "$SECONDARY_EXAM_JSON"
SECONDARY_EXAM_ID=$(printf '%s' "$SECONDARY_EXAM_JSON" | json_extract 'json.data?.id')

LINK_EXAM_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"link_existing_exam_to_event\",
    \"input\":{
      \"eventId\":\"$EVENT_ID\",
      \"examId\":\"$SECONDARY_EXAM_ID\"
    }
  }"
)
printf '%s' "$LINK_EXAM_JSON" | assert_success "link_existing_exam_to_event"
print_response "$LINK_EXAM_JSON"

echo
echo "11) Create exam questions for the bundle exam"
UPDATE_EXAM_JSON=$(
  api_patch "/api/admin/exams/$EXAM_ID" '{
    "totalScore":20,
    "passingScore":14
  }'
)
printf '%s' "$UPDATE_EXAM_JSON" | assert_success "update exam scoring"
print_response "$UPDATE_EXAM_JSON"

QUESTION_ONE_JSON=$(
  api_post "/api/admin/exams/$EXAM_ID/questions" '{
    "type":"MULTIPLE_CHOICE",
    "difficulty":"MEDIUM",
    "question":"Which SME MCP v2 tool should you use to attach an existing course to an event?",
    "options":[
      "create_case_study_bundle",
      "link_existing_course_to_event",
      "set_course_ai_template",
      "list_my_workspace"
    ],
    "correctAnswer":"1",
    "points":10,
    "explanation":"link_existing_course_to_event is the dedicated linking tool.",
    "topic":"SME MCP",
    "tags":["mcp","course-linking"]
  }'
)
printf '%s' "$QUESTION_ONE_JSON" | assert_success "create question 1"
print_response "$QUESTION_ONE_JSON"

QUESTION_TWO_JSON=$(
  api_post "/api/admin/exams/$EXAM_ID/questions" '{
    "type":"TRUE_FALSE",
    "difficulty":"EASY",
    "question":"True or false: prepare_transcript_upload is used before process_transcript_knowledge.",
    "correctAnswer":"true",
    "points":10,
    "explanation":"The upload must be prepared and completed before processing starts.",
    "topic":"Transcript workflow",
    "tags":["mcp","transcript"]
  }'
)
printf '%s' "$QUESTION_TWO_JSON" | assert_success "create question 2"
print_response "$QUESTION_TWO_JSON"

QUESTIONS_JSON=$(api_get "/api/admin/exams/$EXAM_ID/questions")
printf '%s' "$QUESTIONS_JSON" | assert_success "list exam questions"
printf '%s' "$QUESTIONS_JSON" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  const questions = j.data || [];
  console.log(JSON.stringify({
    questionCount: questions.length,
    questions: questions.map((question) => ({
      id: question.id,
      type: question.type,
      points: question.points,
      question: question.question,
      options: question.options ?? null,
      correctAnswer: question.correctAnswer ?? null,
    })),
  }, null, 2));
'

PENDING_REVIEW_JSON=$(
  api_post "/api/admin/exams/$EXAM_ID/status" '{"status":"PENDING_REVIEW"}'
)
printf '%s' "$PENDING_REVIEW_JSON" | assert_success "move exam to pending review"
print_response "$PENDING_REVIEW_JSON"

APPROVE_JSON=$(
  api_post "/api/admin/exams/$EXAM_ID/status" '{"status":"APPROVED"}'
)
printf '%s' "$APPROVE_JSON" | assert_success "approve exam"
print_response "$APPROVE_JSON"

echo
echo "12) Publish course + assign_course_invitations"
PUBLISH_COURSE_JSON=$(
  api_put "/api/admin/courses/$COURSE_ID" '{
    "status":"PUBLISHED",
    "sendNotification":false
  }'
)
printf '%s' "$PUBLISH_COURSE_JSON" | assert_success "publish course"
print_response "$PUBLISH_COURSE_JSON"

ASSIGN_COURSE_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"assign_course_invitations\",
    \"input\":{
      \"courseId\":\"$COURSE_ID\",
      \"userIds\":[\"$LEARNER_USER_ID\"],
      \"sendNotification\":false
    }
  }"
)
printf '%s' "$ASSIGN_COURSE_JSON" | assert_success "assign_course_invitations"
print_response "$ASSIGN_COURSE_JSON"

echo
echo "13) prepare_transcript_upload + process_transcript_knowledge"
PREPARE_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"prepare_transcript_upload\",
    \"input\":{
      \"lessonId\":\"$TRANSCRIPT_LESSON_ID\",
      \"videoAssetId\":\"$TRANSCRIPT_VIDEO_ASSET_ID\",
      \"filename\":\"mcp-v2-smoke.vtt\",
      \"contentType\":\"text/vtt\",
      \"languageCode\":\"en\",
      \"label\":\"English\",
      \"setAsDefaultSubtitle\":true,
      \"setAsPrimaryForAI\":true
    }
  }"
)
printf '%s' "$PREPARE_JSON" | assert_success "prepare_transcript_upload"
print_response "$PREPARE_JSON"

UPLOAD_URL=$(printf '%s' "$PREPARE_JSON" | json_extract 'json.data?.uploadUrl')
TRANSCRIPT_ID=$(printf '%s' "$PREPARE_JSON" | json_extract 'json.data?.transcriptAsset?.id')
upload_to_presigned_url "$UPLOAD_URL" "text/vtt" "$TRANSCRIPT_VTT_FILE"

PROCESS_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"process_transcript_knowledge\",
    \"input\":{
      \"lessonId\":\"$TRANSCRIPT_LESSON_ID\",
      \"transcriptId\":\"$TRANSCRIPT_ID\",
      \"processTranscript\":true,
      \"processKnowledge\":true
    }
  }"
)
printf '%s' "$PROCESS_JSON" | assert_success "process_transcript_knowledge"
print_response "$PROCESS_JSON"

echo
echo "13.1) Poll transcript/knowledge completion"
poll_transcript_completion "$EVENT_ID" "$TRANSCRIPT_LESSON_ID"

echo
echo "14) publish_exam_with_invitations"
PUBLISH_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"publish_exam_with_invitations\",
    \"input\":{
      \"examId\":\"$EXAM_ID\",
      \"userIds\":[\"$LEARNER_USER_ID\"],
      \"sendNotification\":false
    }
  }"
)
printf '%s' "$PUBLISH_JSON" | assert_success "publish_exam_with_invitations"
print_response "$PUBLISH_JSON"

echo
echo "15) Final get_event_execution_status"
FINAL_STATUS_JSON=$(
  api_post "/api/sme/mcp" "{
    \"tool\":\"get_event_execution_status\",
    \"input\":{
      \"eventId\":\"$EVENT_ID\"
    }
  }"
)
printf '%s' "$FINAL_STATUS_JSON" | assert_success "final get_event_execution_status"
printf '%s' "$FINAL_STATUS_JSON" | node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(0, "utf8"));
  console.log(JSON.stringify({
    success: j.success,
    summary: j.summary,
    linkedCourses: j.data?.courses?.length,
    linkedExams: j.data?.exams?.length,
    transcriptStatus: j.data?.transcriptStatus,
    knowledgeStatus: j.data?.knowledgeStatus,
    activeJobs: j.data?.activeJobs,
    nextActions: j.nextActions,
  }, null, 2));
'

echo
echo "Done."
echo "Created bundle IDs:"
echo "  EVENT_ID=$EVENT_ID"
echo "  COURSE_ID=$COURSE_ID"
echo "  EXAM_ID=$EXAM_ID"
echo "Created content IDs:"
echo "  CHAPTER_ID=$CHAPTER_ID"
echo "  LESSON_ID=$LESSON_ID"
echo "  DOC_ASSET_ID=$DOC_ASSET_ID"
echo "  VIDEO_ASSET_ID=$VIDEO_ASSET_ID"
echo "Linked fixture IDs:"
echo "  SECONDARY_COURSE_ID=$SECONDARY_COURSE_ID"
echo "  SECONDARY_EXAM_ID=$SECONDARY_EXAM_ID"
