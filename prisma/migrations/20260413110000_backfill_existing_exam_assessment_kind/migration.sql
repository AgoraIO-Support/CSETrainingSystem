-- Backfill legacy exams created before assessmentKind existed.
--
-- Conservative rules only:
-- 1) Exams with an enabled certificate template were intended to be formal assessments.
-- 2) Exams that already issued certificates were intended to be formal assessments.
--
-- READINESS cannot be inferred reliably from the pre-training-ops schema and must be
-- backfilled manually later if a product/team-specific mapping is needed.

UPDATE "exams" AS e
SET
  "assessmentKind" = 'FORMAL',
  "countsTowardPerformance" = true,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "exam_certificate_templates" AS ect
WHERE ect."examId" = e."id"
  AND ect."isEnabled" = true
  AND e."assessmentKind" = 'PRACTICE';

UPDATE "exams" AS e
SET
  "assessmentKind" = 'FORMAL',
  "countsTowardPerformance" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE e."assessmentKind" = 'PRACTICE'
  AND EXISTS (
    SELECT 1
    FROM "certificates" AS c
    WHERE c."examId" = e."id"
  );
