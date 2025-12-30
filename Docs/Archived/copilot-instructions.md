# Copilot Instructions for AI Coding Agents

## Project Overview
This is a Next.js (TypeScript) monorepo for a CSE Training System. It features a modular architecture with clear separation between UI components, API routes, business logic (services), and data models. The system supports admin, instructor, and student workflows for courses, exams, analytics, and AI-powered chat.

## Key Directories & Patterns
- `app/` — Next.js app router structure. Pages and API routes are organized by feature (e.g., `admin/`, `courses/`, `exams/`). Dynamic routes use `[id]` or `[courseId]`.
- `components/` — Reusable UI components grouped by domain (e.g., `course/`, `quiz/`, `ui/`). Use these for consistent UI/UX.
- `lib/services/` — Business logic and data access. Each service (e.g., `course.service.ts`, `user.service.ts`) encapsulates API calls and data manipulation. Always use services for cross-component logic.
- `prisma/` — Database schema and migrations. Data models are defined in `schema.prisma`.
- `types/` — Shared TypeScript types for models and API responses.

## Developer Workflows
- **Database:**
  - Migrations via Prisma: `npx prisma migrate dev`.
  - Seed data: `npx ts-node prisma/seed.ts`.
- **Testing:**
  - API tests: `scripts/test-api.sh`.
  - No formal unit test structure detected; follow existing shell scripts for integration tests.
- **Deployment:**
  - See `scripts/deploy.sh` for deployment steps.

## Conventions & Patterns
- **API Communication:** Use `lib/api-client.ts` and service files for all API calls. Avoid direct fetch/axios in components.
- **Auth:** Auth logic is in `lib/auth-middleware.ts` and `lib/services/auth.service.ts`.
- **Styling:** Tailwind CSS is configured via `tailwind.config.ts` and `postcss.config.js`. Use utility classes in components.
- **Error Handling:** Centralized in service files; propagate errors to UI for display.
- **AI Integration:** AI chat and analytics features are in `components/ai/` and `lib/services/ai.service.ts`.

## External Integrations
- **AWS S3:** File uploads via `lib/aws-s3.ts`.
- **Supabase:** Used for some data operations in `lib/supabase.ts`.

## Examples
- To add a new course feature, create:
  - UI in `components/course/`
  - API route in `app/api/admin/courses/`
  - Service logic in `lib/services/course.service.ts`
  - Types in `types/index.ts`

## References
- See `Docs/architecture.md` for system architecture.
- See `Docs/api-design.md` for API conventions.

---
_If any section is unclear or missing, please provide feedback for improvement._
