/**
 * Cleanup script: remove demo courses seeded by `prisma/seed.ts` when demo mode was enabled.
 *
 * Why this exists:
 * - `/courses` and dashboards should reflect real admin-created data, not demo placeholders.
 * - Seed demo content is now opt-in (`CSE_SEED_DEMO_DATA=1`), but existing DBs may still
 *   contain old demo records; this script removes them safely by known slugs.
 *
 * Run:
 *   npx tsx scripts/cleanup-demo-courses.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_COURSE_SLUGS = [
  'agora-sdk-fundamentals',
  'advanced-rtc-optimization',
  'live-streaming-essentials',
]

async function main() {
  const existing = await prisma.course.findMany({
    where: { slug: { in: DEMO_COURSE_SLUGS } },
    select: { id: true, slug: true, title: true },
  })

  if (existing.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[cleanup-demo-courses] No demo courses found.')
    return
  }

  // eslint-disable-next-line no-console
  console.log('[cleanup-demo-courses] Deleting demo courses:', existing)

  // Course relations are configured with cascading deletes in the schema,
  // but we still delete enrollments first to avoid constraint issues.
  const demoCourseIds = existing.map((c) => c.id)
  await prisma.enrollment.deleteMany({ where: { courseId: { in: demoCourseIds } } })

  const deleted = await prisma.course.deleteMany({
    where: { id: { in: demoCourseIds } },
  })

  // eslint-disable-next-line no-console
  console.log('[cleanup-demo-courses] Deleted courses:', deleted.count)
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[cleanup-demo-courses] Failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

