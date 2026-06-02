import path from 'path'
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { LessonAssetType } from '@prisma/client'
import prisma from '@/lib/prisma'
import s3Client, { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX, assertAwsRegionConfigured } from '@/lib/aws-s3'
import { FileService } from '@/lib/services/file.service'
import { KnowledgeContextJobService } from '@/lib/services/knowledge-context-job.service'
import { TimestampedTranscriptService } from '@/lib/services/timestamped-transcript.service'

type SourceObject = {
    bucket: string
    key: string
    region?: string | null
}

type ImportAssetParams = {
    lessonId: string
    title: string
    assetType: LessonAssetType
    source: SourceObject
    sourceContentType?: string | null
}

type ImportTranscriptParams = {
    lessonId: string
    videoAssetId: string
    source: SourceObject
    transcriptFormat?: 'AUTO' | 'TIMESTAMPED_TEXT' | 'PLAIN_TEXT'
    language?: string | null
    label?: string | null
    setAsDefaultSubtitle?: boolean
    setAsPrimaryForAI?: boolean
    processKnowledge?: boolean
}

type ImportedAsset = {
    id: string
    title: string
    type: LessonAssetType
    s3Key: string
    url: string
    mimeType: string | null
}

type ImportedTranscript = {
    status: 'imported' | 'plain_text_imported'
    sourceFormat: 'TIMESTAMPED_TEXT' | 'PLAIN_TEXT'
    storedFormat: 'VTT' | 'TEXT'
    transcriptAssetId?: string
    textAssetId?: string
    s3Key: string
    cuesCount?: number
    knowledgeProcessing?: {
        status: 'queued' | 'skipped'
        jobId?: string
    }
    warning?: string
}

const DEFAULT_SOURCE_REGION = process.env.EXTERNAL_IMPORT_SOURCE_REGION || 'us-east-1'
const DEFAULT_ALLOWED_BUCKET = 'eve-meeting-artifacts-891612554546-us-east-1'
const DEFAULT_ALLOWED_PREFIX = 'runs/'

const joinPathSegments = (...segments: Array<string | null | undefined>) =>
    segments
        .filter(Boolean)
        .map((segment) => segment!.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/')

const parseCsv = (value: string | undefined, fallback: string[]) =>
    (value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .concat(value ? [] : fallback)

const allowedBuckets = () => parseCsv(process.env.EXTERNAL_IMPORT_ALLOWED_SOURCE_BUCKETS, [DEFAULT_ALLOWED_BUCKET])
const allowedPrefixes = () => parseCsv(process.env.EXTERNAL_IMPORT_ALLOWED_SOURCE_PREFIXES, [DEFAULT_ALLOWED_PREFIX])

const readPositiveInt = (value: string | undefined, fallback: number) => {
    const parsed = value ? Number.parseInt(value, 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const maxVideoBytes = () => readPositiveInt(process.env.EXTERNAL_IMPORT_MAX_VIDEO_BYTES, 2 * 1024 * 1024 * 1024)
const maxTranscriptBytes = () => readPositiveInt(process.env.EXTERNAL_IMPORT_MAX_TRANSCRIPT_BYTES, 50 * 1024 * 1024)

const sourceClientByRegion = new Map<string, S3Client>()

const getSourceClient = (region?: string | null) => {
    const resolvedRegion = region?.trim() || DEFAULT_SOURCE_REGION
    const existing = sourceClientByRegion.get(resolvedRegion)
    if (existing) return existing
    const client = new S3Client({ region: resolvedRegion })
    sourceClientByRegion.set(resolvedRegion, client)
    return client
}

const extensionForContentType = (contentType: string) => {
    const type = contentType.toLowerCase().split(';')[0].trim()
    if (type === 'video/mp4') return '.mp4'
    if (type === 'text/vtt') return '.vtt'
    if (type === 'text/plain') return '.txt'
    if (type === 'audio/mpeg') return '.mp3'
    if (type === 'application/pdf') return '.pdf'
    return ''
}

const inferContentType = (key: string, fallback?: string | null) => {
    if (fallback) return fallback
    const ext = path.extname(key).toLowerCase()
    if (ext === '.mp4') return 'video/mp4'
    if (ext === '.vtt') return 'text/vtt'
    if (ext === '.txt') return 'text/plain'
    if (ext === '.mp3') return 'audio/mpeg'
    if (ext === '.pdf') return 'application/pdf'
    return 'application/octet-stream'
}

const copySource = (source: SourceObject) =>
    `${source.bucket}/${source.key.split('/').map(encodeURIComponent).join('/')}`

const normalizeSource = (source: SourceObject): SourceObject => ({
    bucket: source.bucket.trim(),
    key: source.key.replace(/^\/+/, ''),
    region: source.region?.trim() || DEFAULT_SOURCE_REGION,
})

const assertAllowedSource = (source: SourceObject) => {
    const normalized = normalizeSource(source)
    if (!allowedBuckets().includes(normalized.bucket)) {
        throw new Error('EXTERNAL_IMPORT_SOURCE_BUCKET_NOT_ALLOWED')
    }

    if (!allowedPrefixes().some((prefix) => normalized.key.startsWith(prefix))) {
        throw new Error('EXTERNAL_IMPORT_SOURCE_PREFIX_NOT_ALLOWED')
    }

    return normalized
}

const stripUnsafeFilenameChars = (value: string) =>
    value
        .replace(/[^\w.\- ]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)

const sourceBasename = (key: string) => stripUnsafeFilenameChars(path.basename(key)) || 'artifact'

export class ExternalRecordingImportService {
    static async importLessonAssetFromS3Object(params: ImportAssetParams): Promise<ImportedAsset> {
        assertAwsRegionConfigured()
        const source = assertAllowedSource(params.source)
        const lesson = await prisma.lesson.findUnique({
            where: { id: params.lessonId },
            include: { chapter: { select: { courseId: true } } },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')

        const sourceClient = getSourceClient(source.region)
        const head = await sourceClient.send(new HeadObjectCommand({ Bucket: source.bucket, Key: source.key }))
        const sourceSize = typeof head.ContentLength === 'number' ? head.ContentLength : null
        const contentType = inferContentType(source.key, params.sourceContentType ?? head.ContentType)

        if (params.assetType === 'VIDEO' && sourceSize && sourceSize > maxVideoBytes()) {
            throw new Error('EXTERNAL_IMPORT_VIDEO_TOO_LARGE')
        }

        const assetId = uuidv4()
        const sourceExt = path.extname(source.key)
        const ext = sourceExt && sourceExt.length <= 10 ? sourceExt : extensionForContentType(contentType)
        const s3Key = joinPathSegments(S3_ASSET_BASE_PREFIX, lesson.chapter.courseId, params.lessonId, `${assetId}${ext}`)

        await s3Client.send(new CopyObjectCommand({
            Bucket: ASSET_S3_BUCKET_NAME,
            Key: s3Key,
            CopySource: copySource(source),
            MetadataDirective: 'REPLACE',
            TaggingDirective: 'REPLACE',
            ContentType: contentType,
            ServerSideEncryption: 'AES256',
        }))

        const asset = await prisma.$transaction(async (tx) => {
            const created = await tx.courseAsset.create({
                data: {
                    id: assetId,
                    courseId: lesson.chapter.courseId,
                    title: params.title.trim() || sourceBasename(source.key),
                    type: params.assetType,
                    url: FileService.getAssetPublicUrl(s3Key),
                    cloudfrontUrl: null,
                    s3Key,
                    contentType,
                    mimeType: contentType,
                },
            })

            await tx.lessonAsset.create({
                data: {
                    lessonId: params.lessonId,
                    courseAssetId: created.id,
                },
            })

            return created
        })

        return {
            id: asset.id,
            title: asset.title,
            type: asset.type,
            s3Key: asset.s3Key,
            url: await FileService.getAssetAccessUrl(asset.s3Key),
            mimeType: asset.mimeType ?? asset.contentType,
        }
    }

    static async importTranscriptFromS3Object(params: ImportTranscriptParams): Promise<ImportedTranscript> {
        assertAwsRegionConfigured()
        const source = assertAllowedSource(params.source)
        const lesson = await prisma.lesson.findUnique({
            where: { id: params.lessonId },
            include: { chapter: { select: { courseId: true } } },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')

        const videoAsset = await prisma.courseAsset.findUnique({
            where: { id: params.videoAssetId },
            select: { id: true, type: true, courseId: true },
        })
        if (!videoAsset || videoAsset.type !== 'VIDEO' || videoAsset.courseId !== lesson.chapter.courseId) {
            throw new Error('VIDEO_ASSET_NOT_FOUND')
        }

        const sourceClient = getSourceClient(source.region)
        const head = await sourceClient.send(new HeadObjectCommand({ Bucket: source.bucket, Key: source.key }))
        const sourceSize = typeof head.ContentLength === 'number' ? head.ContentLength : null
        if (sourceSize && sourceSize > maxTranscriptBytes()) {
            throw new Error('EXTERNAL_IMPORT_TRANSCRIPT_TOO_LARGE')
        }

        const response = await sourceClient.send(new GetObjectCommand({ Bucket: source.bucket, Key: source.key }))
        const content = (await response.Body?.transformToString('utf-8')) || ''
        if (!content.trim()) throw new Error('EXTERNAL_IMPORT_TRANSCRIPT_EMPTY')

        const requestedFormat = params.transcriptFormat ?? 'TIMESTAMPED_TEXT'
        const cues = requestedFormat === 'PLAIN_TEXT' ? [] : TimestampedTranscriptService.parse(content)

        if (cues.length === 0) {
            if (requestedFormat === 'TIMESTAMPED_TEXT') {
                throw new Error('TIMESTAMPED_TRANSCRIPT_REQUIRED')
            }
            return this.importPlainTextTranscript({
                lessonId: params.lessonId,
                courseId: lesson.chapter.courseId,
                source,
                contentType: head.ContentType ?? 'text/plain',
            })
        }

        const transcriptId = uuidv4()
        const vtt = TimestampedTranscriptService.toVtt(cues)
        const generatedFilename = `${path.basename(source.key, path.extname(source.key)) || 'transcript'}.generated.vtt`
        const s3Key = joinPathSegments(S3_ASSET_BASE_PREFIX, lesson.chapter.courseId, params.lessonId, `${transcriptId}.vtt`)
        const language = params.language?.trim() || 'en'
        const label = params.label?.trim() || null

        await s3Client.send(new PutObjectCommand({
            Bucket: ASSET_S3_BUCKET_NAME,
            Key: s3Key,
            Body: vtt,
            ContentType: 'text/vtt',
            ServerSideEncryption: 'AES256',
        }))

        const activeTracks = await prisma.transcriptAsset.findMany({
            where: {
                lessonId: params.lessonId,
                isActive: true,
                archivedAt: null,
            },
            select: {
                id: true,
                videoAssetId: true,
                language: true,
                isDefaultSubtitle: true,
                isPrimaryForAI: true,
            },
        })

        const remainingActiveTracks = activeTracks.filter(
            (track) => !(track.videoAssetId === params.videoAssetId && track.language === language)
        )
        const shouldSetDefault = params.setAsDefaultSubtitle ?? !remainingActiveTracks.some(
            (track) => track.videoAssetId === params.videoAssetId && track.isDefaultSubtitle
        )
        const shouldSetPrimary = params.setAsPrimaryForAI ?? !remainingActiveTracks.some((track) => track.isPrimaryForAI)

        await prisma.$transaction(async (tx) => {
            await tx.transcriptAsset.updateMany({
                where: {
                    lessonId: params.lessonId,
                    videoAssetId: params.videoAssetId,
                    language,
                    isActive: true,
                    archivedAt: null,
                },
                data: {
                    isActive: false,
                    isDefaultSubtitle: false,
                    isPrimaryForAI: false,
                    archivedAt: new Date(),
                },
            })

            if (shouldSetDefault) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        videoAssetId: params.videoAssetId,
                        isActive: true,
                        archivedAt: null,
                        isDefaultSubtitle: true,
                    },
                    data: { isDefaultSubtitle: false },
                })
            }

            if (shouldSetPrimary) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        lessonId: params.lessonId,
                        isActive: true,
                        archivedAt: null,
                        isPrimaryForAI: true,
                    },
                    data: { isPrimaryForAI: false },
                })
            }

            await tx.transcriptAsset.create({
                data: {
                    id: transcriptId,
                    lessonId: params.lessonId,
                    videoAssetId: params.videoAssetId,
                    filename: generatedFilename,
                    s3Key,
                    url: null,
                    language,
                    label,
                    isDefaultSubtitle: shouldSetDefault,
                    isPrimaryForAI: shouldSetPrimary,
                    isActive: true,
                    status: 'PENDING',
                    sourceType: 'IMPORTED',
                },
            })
        })

        const shouldProcessKnowledge = params.processKnowledge ?? true
        let knowledgeProcessing: ImportedTranscript['knowledgeProcessing'] = { status: 'skipped' }
        if (shouldProcessKnowledge) {
            const knowledgeJobService = new KnowledgeContextJobService(prisma)
            const activeJob = await knowledgeJobService.getActiveJobForLesson(params.lessonId)
            if (activeJob) {
                await knowledgeJobService.cancelActiveJobs(params.lessonId)
            }

            const job = await knowledgeJobService.enqueueJob({
                lessonId: params.lessonId,
                transcriptId,
                metrics: {
                    transcriptS3Key: s3Key,
                    importedFrom: {
                        bucket: source.bucket,
                        key: source.key,
                    },
                },
            })

            await knowledgeJobService.appendEvent({
                jobId: job.id,
                level: 'info',
                stage: 'PENDING',
                message: 'Knowledge context job enqueued from external transcript import',
                data: {
                    lessonId: params.lessonId,
                    transcriptId,
                    transcriptS3Key: s3Key,
                    sourceBucket: source.bucket,
                    sourceKey: source.key,
                },
            })

            knowledgeProcessing = { status: 'queued', jobId: job.id }
        }

        return {
            status: 'imported',
            sourceFormat: 'TIMESTAMPED_TEXT',
            storedFormat: 'VTT',
            transcriptAssetId: transcriptId,
            s3Key,
            cuesCount: cues.length,
            knowledgeProcessing,
        }
    }

    private static async importPlainTextTranscript(params: {
        lessonId: string
        courseId: string
        source: SourceObject
        contentType: string
    }): Promise<ImportedTranscript> {
        const source = assertAllowedSource(params.source)
        const assetId = uuidv4()
        const ext = path.extname(source.key) || '.txt'
        const s3Key = joinPathSegments(S3_ASSET_BASE_PREFIX, params.courseId, params.lessonId, `${assetId}${ext}`)

        await s3Client.send(new CopyObjectCommand({
            Bucket: ASSET_S3_BUCKET_NAME,
            Key: s3Key,
            CopySource: copySource(source),
            MetadataDirective: 'REPLACE',
            TaggingDirective: 'REPLACE',
            ContentType: params.contentType || 'text/plain',
            ServerSideEncryption: 'AES256',
        }))

        const asset = await prisma.$transaction(async (tx) => {
            const created = await tx.courseAsset.create({
                data: {
                    id: assetId,
                    courseId: params.courseId,
                    title: sourceBasename(source.key),
                    type: 'TEXT',
                    url: FileService.getAssetPublicUrl(s3Key),
                    cloudfrontUrl: null,
                    s3Key,
                    contentType: params.contentType || 'text/plain',
                    mimeType: params.contentType || 'text/plain',
                },
            })

            await tx.lessonAsset.create({
                data: {
                    lessonId: params.lessonId,
                    courseAssetId: created.id,
                },
            })

            return created
        })

        return {
            status: 'plain_text_imported',
            sourceFormat: 'PLAIN_TEXT',
            storedFormat: 'TEXT',
            textAssetId: asset.id,
            s3Key,
            knowledgeProcessing: { status: 'skipped' },
            warning: 'TIMESTAMPED_TRANSCRIPT_REQUIRED',
        }
    }
}
