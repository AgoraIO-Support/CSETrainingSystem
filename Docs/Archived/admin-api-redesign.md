# Admin API Redesign (Courses → Chapters → Lessons → Assets)

Scope: Admin APIs only. All endpoints start with /admin and enforce full hierarchical scoping so every child resource is addressed via its parent path.

Hierarchy enforced:
Course → Chapter → Lesson → Assets

1) Final Admin API Specification (Authoritative)

Course Management
- GET /admin/courses
  List all courses (any status) with pagination/filtering
- POST /admin/courses
  Create a new course (draft by default)
- PUT /admin/courses/:courseId
  Update course metadata/configuration
- DELETE /admin/courses/:courseId
  Delete a course (soft or hard per policy)

Chapter Management
- GET /admin/courses/:courseId/chapters
  List chapters for the course (ordered)
- POST /admin/courses/:courseId/chapters
  Create a chapter within the course
- PATCH /admin/courses/:courseId/chapters/reorder
  Reorder all chapters in a course (body: [chapterId])
- PATCH /admin/courses/:courseId/chapters/:chapterId
  Update a chapter’s properties
- DELETE /admin/courses/:courseId/chapters/:chapterId
  Delete a chapter (and optionally cascade to lessons per policy)

Lesson Management
- GET /admin/courses/:courseId/chapters/:chapterId/lessons
  List lessons in a chapter (ordered)
- POST /admin/courses/:courseId/chapters/:chapterId/lessons
  Create a lesson in a chapter
- PATCH /admin/courses/:courseId/chapters/:chapterId/lessons/reorder
  Reorder all lessons in a chapter (body: [lessonId])
- PATCH /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId
  Update a lesson (title, duration, type, objectives, rule, etc.)
- DELETE /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId
  Delete a lesson

Lesson Asset Management
- GET /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets
  List assets attached to the lesson (normalized, includes CloudFront URL)
- POST /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets
  Replace lesson’s attached assets by IDs (body: { courseAssetIds: string[] })
- POST /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets/upload
  Presign an S3 upload and create+attach a course asset to the lesson (body: { filename, contentType, type })
- DELETE /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets/:assetId
  Detach a single asset from the lesson

Notes
- All endpoints are protected (ADMIN).
- Reorder endpoints accept full ordered arrays and overwrite order atomically.
- The asset upload endpoint returns { uploadUrl, key, asset } so the client can PUT directly to S3 and then persist attachment.

2) Mapping From Old → New

Courses
OLD: GET /admin/courses
NEW: GET /admin/courses
RATIONALE: Already compliant with admin prefix and top-level collection.

OLD: POST /admin/courses
NEW: POST /admin/courses
RATIONALE: Same as above.

OLD: PUT /admin/courses/:courseId
NEW: PUT /admin/courses/:courseId
RATIONALE: Same as above.

OLD: DELETE /admin/courses/:courseId
NEW: DELETE /admin/courses/:courseId
RATIONALE: Same as above.

Chapters
OLD: POST /admin/courses/:courseId/chapters
NEW: POST /admin/courses/:courseId/chapters
RATIONALE: Already nested under course → correct.

OLD: PATCH /admin/courses/:courseId/chapters/reorder
NEW: PATCH /admin/courses/:courseId/chapters/reorder
RATIONALE: Already nested under course → correct.

OLD: PATCH /admin/chapters/:chapterId
NEW: PATCH /admin/courses/:courseId/chapters/:chapterId
RATIONALE: Enforces parent scoping and prevents cross-course edits by mistake; improves authorization checks.

OLD: DELETE /admin/chapters/:chapterId
NEW: DELETE /admin/courses/:courseId/chapters/:chapterId
RATIONALE: Adds explicit parent context; avoids accidental deletion of a chapter from the wrong course.

Lessons
OLD: POST /admin/chapters/:chapterId/lessons
NEW: POST /admin/courses/:courseId/chapters/:chapterId/lessons
RATIONALE: Fully scoped by course+chapter; prevents attaching lessons to the wrong course.

OLD: PATCH /admin/chapters/:chapterId/lessons/reorder
NEW: PATCH /admin/courses/:courseId/chapters/:chapterId/lessons/reorder
RATIONALE: Reorder always happens within a chapter that belongs to a course.

OLD: PATCH /admin/lessons/:lessonId
NEW: PATCH /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId
RATIONALE: Adds the required ancestry to disambiguate and harden authorization.

OLD: DELETE /admin/lessons/:lessonId
NEW: DELETE /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId
RATIONALE: Same as above; deletion is scoped to parent containers.

Lesson Assets
OLD: POST /admin/lessons/:lessonId/assets
NEW: POST /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets
RATIONALE: Replacement must validate that all asset IDs belong to the same course; full path carries that intent.

OLD: POST /admin/lessons/:lessonId/assets/upload
NEW: POST /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets/upload
RATIONALE: Presign+attach is a child operation on a specific lesson under its parents.

(Implicit in codebase) OLD: DELETE /admin/lessons/:lessonId/assets/:assetId
NEW: DELETE /admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets/:assetId
RATIONALE: Detach must be fully scoped to prevent detaching from the wrong lesson; enables strict ownership checks.

3) Design Justification

Why fully nested routes here
- Unambiguous ownership: Every write is made in the context of its parent containers (course → chapter → lesson). This eliminates guessing and reduces bugs from mismatched IDs.
- Safer authorization: Policy checks become straightforward (e.g., admin must be allowed to edit Course X; all descendant writes automatically imply Course X context).
- Stronger validation: The handler can enforce that a lesson really belongs to the chapter and course provided in the URL, and that each asset belongs to the same course before attaching.

How this avoids frontend and data bugs
- Prevents cross-link mistakes (e.g., replacing assets on the wrong lesson) because the URL itself encodes the expected ancestry; server rejects mismatched ancestry.
- Reorder endpoints operate in the exact container they modify, avoiding accidental global or cross-container side effects.
- Asset replacement and upload remain local to a single lesson context, reducing chances of orphaned or mis-scoped assets.

Operational benefits
- Caching: Parent-scoped cache keys are natural (e.g., course/:id/chapters, chapter/:id/lessons). Invalidation is easier and more targeted.
- Observability: Logs and metrics include the full lineage, making audit trails and debugging significantly clearer.
- Evolution: The model scales—future child resources (e.g., quizzes) can slot into the same pattern without rethinking the routing philosophy.

Consistency & Parity
- All admin endpoints begin with /admin.
- Child resources are always fully scoped by their parents.
- Functionality parity preserved: create/update/delete, chapter and lesson reordering, presigned S3 uploads, and asset replacement by IDs.
