#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/ubuntu/cselearning.env}"
OUTPUT_PARENT="${1:-exports}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EXPORT_NAME="performance-check-materials-${STAMP}"
EXPORT_DIR="${OUTPUT_PARENT%/}/${EXPORT_NAME}"
ZIP_PATH="${EXPORT_DIR}.zip"

read_env_value() {
    local name="$1" value
    value="$(sed -n "s/^${name}=//p" "$ENV_FILE" | head -n 1)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    printf '%s' "$value"
}

DATABASE_URL="$(read_env_value DATABASE_URL)"
DATABASE_URL="${DATABASE_URL%%\?schema=*}"
AWS_REGION="$(read_env_value AWS_REGION)"
AWS_REGION="${AWS_REGION:-us-east-1}"
ASSET_BUCKET="$(read_env_value AWS_S3_ASSET_BUCKET_NAME)"
ASSET_BUCKET="${ASSET_BUCKET:-$(read_env_value AWS_S3_BUCKET_NAME)}"

if [[ -z "$DATABASE_URL" || -z "$ASSET_BUCKET" ]]; then
    echo "Missing DATABASE_URL or AWS S3 bucket configuration in $ENV_FILE" >&2
    exit 1
fi
if [[ -e "$EXPORT_DIR" || -e "$ZIP_PATH" ]]; then
    echo "Refusing to overwrite existing export: $EXPORT_DIR" >&2
    exit 1
fi

mkdir -p "$EXPORT_DIR/courses" "$EXPORT_DIR/exams"

export PGOPTIONS='-c default_transaction_read_only=on'

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<'SQL' > "$EXPORT_DIR/courses/index.json"
SELECT jsonb_pretty(jsonb_build_object(
  'exportedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'scope', 'All courses and their XML/VTT source records; no learner data',
  'courses', COALESCE(jsonb_agg(course_doc ORDER BY course_order), '[]'::jsonb)
))
FROM (
  SELECT row_number() OVER (ORDER BY c."createdAt", c.id) AS course_order,
    jsonb_build_object(
      'id', c.id, 'title', c.title, 'slug', c.slug, 'status', c.status,
      'category', c.category, 'level', c.level, 'description', c.description,
      'tags', c.tags, 'learningOutcomes', c."learningOutcomes",
      'createdAt', c."createdAt", 'updatedAt', c."updatedAt",
      'chapters', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ch.id, 'title', ch.title, 'order', ch."order",
          'lessons', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', l.id, 'title', l.title, 'order', l."order", 'description', l.description,
              'subtitleKey', l."subtitleKey", 'subtitleUrl', l."subtitleUrl",
              'knowledgeContext', CASE WHEN kc.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', kc.id, 's3Key', kc."s3Key", 'status', kc.status,
                'contentHash', kc."contentHash", 'tokenCount', kc."tokenCount",
                'sectionCount', kc."sectionCount", 'anchorCount', kc."anchorCount",
                'processedAt', kc."processedAt"
              ) END,
              'transcripts', COALESCE((SELECT jsonb_agg(to_jsonb(ta) - 'errorMessage' ORDER BY ta."createdAt") FROM transcript_assets ta WHERE ta."lessonId" = l.id), '[]'::jsonb)
            ) ORDER BY l."order", l."createdAt")
            FROM lessons l LEFT JOIN knowledge_contexts kc ON kc."lessonId" = l.id
            WHERE l."chapterId" = ch.id
          ), '[]'::jsonb)
        ) ORDER BY ch."order", ch."createdAt") FROM chapters ch WHERE ch."courseId" = c.id
      ), '[]'::jsonb),
      'vttOrXmlCourseAssets', COALESCE((
        SELECT jsonb_agg(to_jsonb(ca) ORDER BY ca."createdAt") FROM course_assets ca
        WHERE ca."courseId" = c.id AND (
          lower(ca."s3Key") LIKE '%.vtt' OR lower(ca."s3Key") LIKE '%.xml' OR
          lower(COALESCE(ca."mimeType", ca."contentType", '')) IN ('text/vtt', 'application/xml', 'text/xml')
        )
      ), '[]'::jsonb),
      'vttExamMaterials', COALESCE((
        SELECT jsonb_agg(to_jsonb(em) - 'extractedText' - 'errorMessage' ORDER BY em."createdAt") FROM exam_materials em
        WHERE em."courseId" = c.id AND (em."assetType"::text = 'VTT' OR lower(em.filename) LIKE '%.vtt')
      ), '[]'::jsonb)
    ) AS course_doc
  FROM courses c
) ordered_courses;
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<'SQL' > "$EXPORT_DIR/exams/index.json"
SELECT jsonb_pretty(jsonb_build_object(
  'exportedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'scope', 'All exam definitions and canonical answers; learner attempts and responses excluded',
  'exams', COALESCE(jsonb_agg(exam_doc ORDER BY exam_order), '[]'::jsonb)
))
FROM (
  SELECT row_number() OVER (ORDER BY e."createdAt", e.id) AS exam_order,
    jsonb_build_object(
      'id', e.id, 'title', e.title, 'description', e.description, 'instructions', e.instructions,
      'examType', e."examType", 'status', e.status, 'assessmentKind', e."assessmentKind",
      'courseId', e."courseId", 'courseTitle', c.title, 'version', e.version,
      'timeLimitMinutes', e."timeLimit", 'totalScore', e."totalScore", 'passingScorePercent', e."passingScore",
      'randomizeQuestions', e."randomizeQuestions", 'randomizeOptions', e."randomizeOptions",
      'createdAt', e."createdAt", 'updatedAt', e."updatedAt", 'publishedAt', e."publishedAt",
      'questions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.id, 'order', q."order", 'type', q.type, 'difficulty', q.difficulty,
          'question', q.question, 'options', q.options, 'correctAnswer', q."correctAnswer",
          'sampleAnswer', q."sampleAnswer", 'rubric', q.rubric,
          'gradingCriteria', q."gradingCriteria", 'maxWords', q."maxWords",
          'points', q.points, 'explanation', q.explanation, 'topic', q.topic, 'tags', q.tags,
          'archivedAt', q."archivedAt", 'attachmentS3Key', q."attachmentS3Key",
          'attachmentFilename', q."attachmentFilename", 'attachmentMimeType', q."attachmentMimeType"
        ) ORDER BY q."order", q."createdAt") FROM exam_questions q WHERE q."examId" = e.id
      ), '[]'::jsonb)
    ) AS exam_doc
  FROM exams e LEFT JOIN courses c ON c.id = e."courseId"
) ordered_exams;
SQL

# Build the object download list entirely from database references. All commands below are S3 GETs.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL' > "$EXPORT_DIR/downloads.tsv"
WITH ordered_courses AS (
  SELECT c.*, row_number() OVER (ORDER BY c."createdAt", c.id) AS n FROM courses c
), base AS (
  SELECT oc.n, oc.slug, ch."order" AS chapter_order, l."order" AS lesson_order,
    'knowledge_xml'::text AS kind, kc.id AS source_id, kc."s3Key" AS s3_key,
    format('courses/%s-%s/xml/chapter-%s_lesson-%s_%s.xml', lpad(oc.n::text,3,'0'), regexp_replace(oc.slug,'[^A-Za-z0-9._-]+','-','g'), lpad((ch."order"+1)::text,2,'0'), lpad((l."order"+1)::text,2,'0'), kc.id) AS local_path
  FROM ordered_courses oc JOIN chapters ch ON ch."courseId"=oc.id JOIN lessons l ON l."chapterId"=ch.id JOIN knowledge_contexts kc ON kc."lessonId"=l.id
  UNION ALL
  SELECT oc.n, oc.slug, ch."order", l."order", 'transcript_vtt', ta.id, ta."s3Key",
    format('courses/%s-%s/vtt/chapter-%s_lesson-%s_%s_%s.vtt', lpad(oc.n::text,3,'0'), regexp_replace(oc.slug,'[^A-Za-z0-9._-]+','-','g'), lpad((ch."order"+1)::text,2,'0'), lpad((l."order"+1)::text,2,'0'), ta.id, regexp_replace(ta.language,'[^A-Za-z0-9._-]+','-','g'))
  FROM ordered_courses oc JOIN chapters ch ON ch."courseId"=oc.id JOIN lessons l ON l."chapterId"=ch.id JOIN transcript_assets ta ON ta."lessonId"=l.id
  UNION ALL
  SELECT oc.n, oc.slug, ch."order", l."order", 'legacy_subtitle_vtt', l.id, l."subtitleKey",
    format('courses/%s-%s/vtt/chapter-%s_lesson-%s_%s_legacy.vtt', lpad(oc.n::text,3,'0'), regexp_replace(oc.slug,'[^A-Za-z0-9._-]+','-','g'), lpad((ch."order"+1)::text,2,'0'), lpad((l."order"+1)::text,2,'0'), l.id)
  FROM ordered_courses oc JOIN chapters ch ON ch."courseId"=oc.id JOIN lessons l ON l."chapterId"=ch.id WHERE l."subtitleKey" IS NOT NULL
  UNION ALL
  SELECT oc.n, oc.slug, 9999, 9999, 'course_asset', ca.id, ca."s3Key",
    format('courses/%s-%s/assets/%s%s', lpad(oc.n::text,3,'0'), regexp_replace(oc.slug,'[^A-Za-z0-9._-]+','-','g'), ca.id, CASE WHEN lower(ca."s3Key") LIKE '%.xml' THEN '.xml' ELSE '.vtt' END)
  FROM ordered_courses oc JOIN course_assets ca ON ca."courseId"=oc.id
  WHERE lower(ca."s3Key") LIKE '%.vtt' OR lower(ca."s3Key") LIKE '%.xml' OR
    lower(COALESCE(ca."mimeType",ca."contentType",'')) IN ('text/vtt','application/xml','text/xml')
  UNION ALL
  SELECT oc.n, oc.slug, 9999, 9999, 'course_exam_material_vtt', em.id, em."s3Key",
    format('courses/%s-%s/vtt/material_%s.vtt', lpad(oc.n::text,3,'0'), regexp_replace(oc.slug,'[^A-Za-z0-9._-]+','-','g'), em.id)
  FROM ordered_courses oc JOIN exam_materials em ON em."courseId"=oc.id WHERE em."assetType"::text='VTT' OR lower(em.filename) LIKE '%.vtt'
), exam_attachments AS (
  SELECT 100000 + row_number() OVER (ORDER BY e."createdAt", e.id) AS n, e.id::text AS slug, 9999 AS chapter_order, q."order" AS lesson_order,
    'exam_question_attachment'::text AS kind, q.id AS source_id, q."attachmentS3Key" AS s3_key,
    format('exams/%s-%s/attachments/question-%s_%s', lpad(row_number() OVER (ORDER BY e."createdAt",e.id)::text,3,'0'), e.id, q.id, regexp_replace(COALESCE(q."attachmentFilename",'attachment'),'[^A-Za-z0-9._-]+','-','g')) AS local_path
  FROM exams e JOIN exam_questions q ON q."examId"=e.id WHERE q."attachmentS3Key" IS NOT NULL
)
SELECT kind, local_path, s3_key, source_id FROM (SELECT * FROM base UNION ALL SELECT * FROM exam_attachments) all_objects
WHERE s3_key IS NOT NULL AND s3_key <> '' ORDER BY n, chapter_order, lesson_order, kind, source_id;
SQL

printf 'kind\tlocal_path\ts3_key\tsource_id\tstatus\n' > "$EXPORT_DIR/download-results.tsv"
downloaded=0
failed=0
while IFS=$'\t' read -r kind local_path s3_key source_id; do
    [[ -n "$s3_key" ]] || continue
    mkdir -p "$EXPORT_DIR/$(dirname "$local_path")"
    if aws s3 cp "s3://${ASSET_BUCKET}/${s3_key#/}" "$EXPORT_DIR/$local_path" --region "$AWS_REGION" --only-show-errors --no-progress; then
        printf '%s\t%s\t%s\t%s\tOK\n' "$kind" "$local_path" "$s3_key" "$source_id" >> "$EXPORT_DIR/download-results.tsv"
        downloaded=$((downloaded + 1))
    else
        printf '%s\t%s\t%s\t%s\tFAILED\n' "$kind" "$local_path" "$s3_key" "$source_id" >> "$EXPORT_DIR/download-results.tsv"
        failed=$((failed + 1))
    fi
done < "$EXPORT_DIR/downloads.tsv"

jq -r '
  .exams | to_entries[] |
  .key as $i | .value as $e |
  "# " + $e.title + "\n\n" +
  "- Exam ID: `" + $e.id + "`\n" +
  "- Status: " + ($e.status|tostring) + "\n" +
  "- Type: " + ($e.examType|tostring) + "\n" +
  "- Course: " + (($e.courseTitle // "Standalone")|tostring) + "\n" +
  "- Total / passing: " + ($e.totalScore|tostring) + " / " + ($e.passingScorePercent|tostring) + "%\n\n" +
  (if $e.description then "## Description\n\n" + $e.description + "\n\n" else "" end) +
  (if $e.instructions then "## Instructions\n\n" + $e.instructions + "\n\n" else "" end) +
  "## Questions And Answers\n\n" +
  ([ $e.questions[] |
    "### " + ((.order + 1)|tostring) + ". " + .question + "\n\n" +
    "- Type: " + (.type|tostring) + "\n" +
    "- Difficulty: " + (.difficulty|tostring) + "\n" +
    "- Points: " + (.points|tostring) + "\n" +
    (if .options then "\nOptions:\n\n" + ([.options[] | "- " + (if type == "string" then . else tojson end)] | join("\n")) + "\n" else "" end) +
    "\n**Canonical answer:**\n\n" + ((.correctAnswer // .sampleAnswer // "Not specified")|tostring) + "\n\n" +
    (if .sampleAnswer and .correctAnswer then "**Sample answer:**\n\n" + .sampleAnswer + "\n\n" else "" end) +
    (if .rubric then "**Rubric:**\n\n" + .rubric + "\n\n" else "" end) +
    (if .gradingCriteria then "**Grading criteria:**\n\n```json\n" + (.gradingCriteria|tojson) + "\n```\n\n" else "" end) +
    (if .explanation then "**Explanation:**\n\n" + .explanation + "\n\n" else "" end)
  ] | join("---\n\n"))
' "$EXPORT_DIR/exams/index.json" | csplit -s -z -f "$EXPORT_DIR/exams/.exam-part-" -b '%03d.md' - '/^# /' '{*}'

# Rename generated exam Markdown files deterministically using exam order and ID.
mapfile -t exam_ids < <(jq -r '.exams[].id' "$EXPORT_DIR/exams/index.json")
for i in "${!exam_ids[@]}"; do
    src="$(printf '%s/exams/.exam-part-%03d.md' "$EXPORT_DIR" "$i")"
    dst="$(printf '%s/exams/%03d-%s.md' "$EXPORT_DIR" "$((i + 1))" "${exam_ids[$i]}")"
    [[ -f "$src" ]] && mv "$src" "$dst"
done

cat > "$EXPORT_DIR/README.txt" <<EOF
Performance Check source-material export
Generated (UTC): ${STAMP}

Contents:
- courses/index.json: course/lesson metadata and all XML/VTT database references
- courses/*/xml: downloaded Knowledge Context XML files
- courses/*/vtt: downloaded transcript/subtitle VTT files
- exams/index.json: all exam definitions, questions, canonical answers, rubrics and explanations
- exams/*.md: human-readable question-and-answer documents
- exams/*/attachments: question attachments, where present
- download-results.tsv: per-object S3 download audit

Privacy boundary:
- Learner attempts, learner answers, scores and user records are intentionally excluded.
- Database access was performed with default_transaction_read_only=on.

Object download result: ${downloaded} succeeded, ${failed} failed.
EOF

jq -n --arg generatedAt "$STAMP" --argjson downloaded "$downloaded" --argjson failed "$failed" \
  --argjson courses "$(jq '.courses | length' "$EXPORT_DIR/courses/index.json")" \
  --argjson exams "$(jq '.exams | length' "$EXPORT_DIR/exams/index.json")" \
  --argjson questions "$(jq '[.exams[].questions[]] | length' "$EXPORT_DIR/exams/index.json")" \
  '{generatedAt:$generatedAt,courses:$courses,exams:$exams,questions:$questions,objectDownloads:{succeeded:$downloaded,failed:$failed}}' \
  > "$EXPORT_DIR/manifest.json"

(cd "$OUTPUT_PARENT" && python3 -m zipfile -c "${EXPORT_NAME}.zip" "$EXPORT_NAME")

echo "EXPORT_DIR=$EXPORT_DIR"
echo "ZIP_PATH=$ZIP_PATH"
echo "DOWNLOADS_OK=$downloaded"
echo "DOWNLOADS_FAILED=$failed"
