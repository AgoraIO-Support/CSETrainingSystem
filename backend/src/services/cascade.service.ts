import { prisma } from '../prisma.js'
import { deletePrefix, deleteKeys } from '../lib/s3-utils.js'
import { appConfig } from '../config/env.js'

export class CascadeService {
  /**
   * 删除单个 Lesson 及其资产（DB 内），提交后清理该 lesson 前缀
   */
  async deleteLessonCascade(lessonId: string): Promise<void> {
    // 先查出 courseId/chapterId 供提交后使用
    const meta = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, chapter: { select: { id: true, courseId: true } } },
    })
    if (!meta) return
    const courseId = meta.chapter.courseId
    const chapterId = meta.chapter.id

    // 权威删除顺序：事务内取 s3Key 列表 -> 事务后 deleteKeys(keys) -> 再 deletePrefix 兜底
    const s3Keys: string[] = []

    await prisma.$transaction(async (tx) => {
      // 收集 lesson 自身的媒体 key（兼容 legacy 字段）
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        select: { videoKey: true, subtitleKey: true },
      })
      if (lesson?.videoKey) s3Keys.push(lesson.videoKey)
      if (lesson?.subtitleKey) s3Keys.push(lesson.subtitleKey)

      // 收集该 lesson 下的 transcript 资产 key（DB 删除后将无法再取到）
      const transcripts = await tx.transcriptAsset.findMany({
        where: { lessonId },
        select: { s3Key: true },
      })
      s3Keys.push(...transcripts.map(t => t.s3Key).filter(Boolean) as string[])

      // 找出该 lesson 绑定的所有资产 key（权威数据源）
      const bindings = await tx.lessonAsset.findMany({
        where: { lessonId },
        include: { courseAsset: { select: { id: true, s3Key: true } } },
      })
      const assetIds = bindings.map(b => b.courseAsset?.id).filter(Boolean) as string[]
      const keys = bindings.map(b => b.courseAsset?.s3Key).filter(Boolean) as string[]
      s3Keys.push(...keys)

      // 删除 lessonAsset 关系
      await tx.lessonAsset.deleteMany({ where: { lessonId } })

      // 删除对应 courseAsset（资产不复用前提）
      if (assetIds.length) {
        await tx.courseAsset.deleteMany({ where: { id: { in: assetIds } } })
      }

      // 删除 lesson 本身
      await tx.lesson.delete({ where: { id: lessonId } })
    })

    // 事务提交后：先精准删除，再兜底前缀清理（best-effort）
    if (s3Keys.length) {
      await deleteKeys([...new Set(s3Keys)])
    }
    await deletePrefix(`${appConfig.s3.uploadPrefix}/${courseId}/${chapterId}/${lessonId}/`)
    // 可选：老路径按开关清理（避免误删）
    if (appConfig.s3.enableLegacySweepOnLessonDelete) {
      await deletePrefix(`${appConfig.s3.legacyLessonFolder}/${lessonId}/`)
    }
  }

  /**
   * 删除 Chapter 下所有 Lessons 与资产（DB），提交后清理章节前缀
   */
  async deleteChapterCascade(chapterId: string): Promise<void> {
    // 先拿到 courseId
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true, courseId: true } })
    if (!chapter) return

    const s3Keys: string[] = []
    let lessonIds: string[] = []

    await prisma.$transaction(async (tx) => {
      // 找出该章节下所有 lessons
      const lessons = await tx.lesson.findMany({ where: { chapterId }, select: { id: true, videoKey: true, subtitleKey: true } })
      lessonIds = lessons.map(l => l.id)

      if (lessonIds.length) {
        // 收集 lessons 自身的媒体 key（兼容 legacy 字段）
        for (const lesson of lessons) {
          if (lesson.videoKey) s3Keys.push(lesson.videoKey)
          if (lesson.subtitleKey) s3Keys.push(lesson.subtitleKey)
        }

        // 收集该章节下所有 transcript 资产 key（DB 删除后将无法再取到）
        const transcripts = await tx.transcriptAsset.findMany({
          where: { lessonId: { in: lessonIds } },
          select: { s3Key: true },
        })
        s3Keys.push(...transcripts.map(t => t.s3Key).filter(Boolean) as string[])

        // 收集所有资产 s3Key（权威列表）
        const assets = await tx.courseAsset.findMany({
          where: { lessons: { some: { lessonId: { in: lessonIds } } } },
          select: { id: true, s3Key: true },
        })
        s3Keys.push(...assets.map(a => a.s3Key).filter(Boolean) as string[])

        // 删除所有 lessonAsset 关系
        await tx.lessonAsset.deleteMany({ where: { lessonId: { in: lessonIds } } })

        // 删除对应的 courseAsset（资产不复用前提）
        if (assets.length) {
          await tx.courseAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } })
        }

        // 删除 lessons
        await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } })
      }

      // 删除 chapter
      await tx.chapter.delete({ where: { id: chapterId } })
    })

    // 提交后：先精准删除，再兜底前缀清理
    if (s3Keys.length) {
      await deleteKeys([...new Set(s3Keys)])
    }
    await deletePrefix(`${appConfig.s3.uploadPrefix}/${chapter.courseId}/${chapterId}/`)
    // legacy:
    for (const lid of lessonIds) {
      await deletePrefix(`${appConfig.s3.legacyLessonFolder}/${lid}/`)
    }
  }

  /**
   * 删除 Course 下所有 Chapters/Lessons/Assets（DB），提交后清理课程前缀
   */
  async deleteCourseCascade(courseId: string): Promise<void> {
    const s3Keys: string[] = []
    let lessonIds: string[] = []

    await prisma.$transaction(async (tx) => {
      // 所有 lessonIds
      const lessons = await tx.lesson.findMany({ where: { chapter: { courseId } }, select: { id: true, videoKey: true, subtitleKey: true } })
      lessonIds = lessons.map(l => l.id)

      // 收集 lessons 自身的媒体 key（兼容 legacy 字段）
      for (const lesson of lessons) {
        if (lesson.videoKey) s3Keys.push(lesson.videoKey)
        if (lesson.subtitleKey) s3Keys.push(lesson.subtitleKey)
      }

      // 收集该课程下所有 transcript 资产 key（DB 删除后将无法再取到）
      if (lessonIds.length) {
        const transcripts = await tx.transcriptAsset.findMany({
          where: { lessonId: { in: lessonIds } },
          select: { s3Key: true },
        })
        s3Keys.push(...transcripts.map(t => t.s3Key).filter(Boolean) as string[])
      }

      // 收集所有 courseAsset s3Key（权威列表）
      const assets = await tx.courseAsset.findMany({ where: { courseId }, select: { id: true, s3Key: true } })
      s3Keys.push(...assets.map(a => a.s3Key).filter(Boolean) as string[])

      // 删除 lessonAsset 关系
      if (lessonIds.length) {
        await tx.lessonAsset.deleteMany({ where: { lessonId: { in: lessonIds } } })
      }

      // 删除所有 courseAsset（资产不复用前提）
      if (assets.length) {
        await tx.courseAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } })
      }

      // 删除 lessons
      if (lessonIds.length) {
        await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } })
      }

      // 删除 chapters
      await tx.chapter.deleteMany({ where: { courseId } })

      // 删除 course
      await tx.course.delete({ where: { id: courseId } })
    })

    // 提交后：先精准删除，再兜底前缀清理
    if (s3Keys.length) {
      await deleteKeys([...new Set(s3Keys)])
    }
    await deletePrefix(`${appConfig.s3.uploadPrefix}/${courseId}/`)
    for (const lid of lessonIds) {
      await deletePrefix(`${appConfig.s3.legacyLessonFolder}/${lid}/`)
    }
  }
}
