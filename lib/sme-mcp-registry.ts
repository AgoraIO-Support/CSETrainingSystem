import { AuthUser } from '@/lib/auth-middleware'
import { SmeMcpService } from '@/lib/services/sme-mcp.service'
import {
    getSmeMcpToolMetadata,
    getSmeMcpToolParameterMetadata,
    smeMcpToolMetadataByName,
} from '@/lib/sme-mcp-tool-metadata'
import { inviteUsersSchema } from '@/lib/validations'
import { z } from 'zod'

type MappableUser = Pick<AuthUser, 'id' | 'role'>

export type SmeMcpToolExecutionResult = {
    success: true
    tool: string
    summary: string
    data: unknown
    nextActions: string[]
    warnings?: string[]
}

type JsonSchema = Record<string, unknown>

type SmeMcpToolDefinition<TInput = unknown> = {
    name: string
    description: string
    inputSchema: z.ZodType<TInput>
    inputJsonSchema: JsonSchema
    execute: (user: MappableUser, input: TInput) => Promise<SmeMcpToolExecutionResult>
}

const uuidSchema = {
    type: 'string',
    format: 'uuid',
} satisfies JsonSchema

const describedUuidSchema = (description: string, example?: string) =>
    ({
        ...uuidSchema,
        description,
        ...(example ? { examples: [example] } : {}),
    }) satisfies JsonSchema

const describedStringSchema = (
    description: string,
    options?: {
        minLength?: number
        maxLength?: number
        examples?: string[]
        format?: string
        enum?: readonly string[]
        nullable?: boolean
    }
) =>
    ({
        type: options?.nullable ? ['string', 'null'] : 'string',
        description,
        ...(options?.minLength === undefined ? {} : { minLength: options.minLength }),
        ...(options?.maxLength === undefined ? {} : { maxLength: options.maxLength }),
        ...(options?.format ? { format: options.format } : {}),
        ...(options?.enum ? { enum: options.enum } : {}),
        ...(options?.examples ? { examples: options.examples } : {}),
    }) satisfies JsonSchema

const describedBooleanSchema = (description: string, defaultValue?: boolean) =>
    ({
        type: 'boolean',
        description,
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
    }) satisfies JsonSchema

const describedIntegerSchema = (
    description: string,
    options?: { minimum?: number; maximum?: number; examples?: number[]; nullable?: boolean }
) =>
    ({
        type: options?.nullable ? ['integer', 'null'] : 'integer',
        description,
        ...(options?.minimum === undefined ? {} : { minimum: options.minimum }),
        ...(options?.maximum === undefined ? {} : { maximum: options.maximum }),
        ...(options?.examples ? { examples: options.examples } : {}),
    }) satisfies JsonSchema

const parseArrayExample = (rawExample?: string) => {
    if (!rawExample) return undefined

    try {
        const parsed = JSON.parse(rawExample)
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : undefined
    } catch {
        return undefined
    }
}

const describedUuidArraySchema = (description: string, options?: { example?: string; minItems?: number }) =>
    ({
        type: 'array',
        description,
        items: uuidSchema,
        ...(options?.minItems === undefined ? {} : { minItems: options.minItems }),
        ...(parseArrayExample(options?.example) ? { examples: [parseArrayExample(options?.example)] } : {}),
    }) satisfies JsonSchema

const toolInputDescription = (toolName: keyof typeof smeMcpToolMetadataByName) => getSmeMcpToolMetadata(toolName).inputSummary

const parameterDescription = (
    toolName: keyof typeof smeMcpToolMetadataByName,
    parameterName: string,
    fallback: string
) => getSmeMcpToolParameterMetadata(toolName, parameterName)?.description ?? fallback

const parameterExample = (toolName: keyof typeof smeMcpToolMetadataByName, parameterName: string) =>
    getSmeMcpToolParameterMetadata(toolName, parameterName)?.example

const parameterAcceptedValues = (toolName: keyof typeof smeMcpToolMetadataByName, parameterName: string) =>
    getSmeMcpToolParameterMetadata(toolName, parameterName)?.acceptedValues

const emptyObjectJsonSchema = {
    type: 'object',
    description: 'This tool does not require any input arguments.',
    properties: {},
    additionalProperties: false,
} satisfies JsonSchema

const listWorkspaceSchema = z.object({
    domainId: z.string().uuid().optional(),
})

const createCaseStudyBundleSchema = z.object({
    domainId: z.string().uuid(),
    seriesId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    scheduledAt: z.coerce.date().optional().nullable(),
    description: z.string().trim().optional().nullable(),
    hostId: z.string().uuid().optional().nullable(),
    starValue: z.number().int().min(0).max(20).optional().nullable(),
    assessmentKind: z.enum(['PRACTICE', 'READINESS', 'FORMAL']).optional(),
    countsTowardPerformance: z.boolean().optional(),
})

const setCourseAiTemplateSchema = z
    .object({
        courseId: z.string().uuid(),
        templateId: z.string().uuid().optional(),
        useDefault: z.boolean().optional(),
        enabled: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
        const hasTemplateId = Boolean(value.templateId)
        const useDefault = value.useDefault === true

        if (useDefault === hasTemplateId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: hasTemplateId ? ['templateId'] : ['useDefault'],
                message: 'Provide either templateId or useDefault=true.',
            })
        }
    })

const assignCourseInvitationsSchema = z.object({
    courseId: z.string().uuid(),
    userIds: inviteUsersSchema.shape.userIds,
    sendNotification: z.boolean().optional(),
})

const prepareTranscriptUploadSchema = z.object({
    lessonId: z.string().uuid(),
    videoAssetId: z.string().uuid(),
    filename: z.string().trim().min(1).max(255),
    contentType: z.literal('text/vtt').optional(),
    languageCode: z.string().trim().min(2).max(20).optional(),
    label: z.string().trim().max(80).optional().nullable(),
    replaceExistingLanguage: z.boolean().optional(),
    setAsDefaultSubtitle: z.boolean().optional(),
    setAsPrimaryForAI: z.boolean().optional(),
})

const processTranscriptKnowledgeSchema = z.object({
    lessonId: z.string().uuid(),
    transcriptId: z.string().uuid().optional(),
    processTranscript: z.boolean().optional(),
    processKnowledge: z.boolean().optional(),
    force: z.boolean().optional(),
    knowledgePromptTemplateId: z.string().uuid().optional().nullable(),
    anchorsPromptTemplateId: z.string().uuid().optional().nullable(),
})

const publishExamWithInvitationsSchema = z.object({
    examId: z.string().uuid(),
    userIds: z.array(z.string().uuid()).default([]),
    sendNotification: z.boolean().optional(),
})

const linkExistingCourseToEventSchema = z.object({
    eventId: z.string().uuid(),
    courseId: z.string().uuid(),
})

const linkExistingExamToEventSchema = z.object({
    eventId: z.string().uuid(),
    examId: z.string().uuid(),
})

const getEventExecutionStatusSchema = z.object({
    eventId: z.string().uuid(),
})

export const deprecatedSmeMcpToolNames = [
    'upload_transcript_and_process',
    'list_course_editor_state',
    'update_course',
    'create_chapter',
    'update_chapter',
    'delete_chapter',
    'reorder_chapters',
    'create_lesson',
    'update_lesson',
    'delete_lesson',
    'reorder_lessons',
    'list_exam_questions',
    'create_exam_question',
    'update_exam_question',
    'delete_exam_question',
    'reorder_exam_questions',
] as const

export const smeMcpToolDefinitions = [
    {
        name: 'list_my_workspace',
        description: smeMcpToolMetadataByName.list_my_workspace.description,
        inputSchema: listWorkspaceSchema.default({}),
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('list_my_workspace'),
            properties: {
                domainId: describedUuidSchema(
                    parameterDescription(
                        'list_my_workspace',
                        'domainId',
                        'Optional domain scope filter. Use a domain UUID returned by list_my_workspace.'
                    ),
                    parameterExample('list_my_workspace', 'domainId')
                ),
            },
            additionalProperties: false,
            examples: [{}, { domainId: parameterExample('list_my_workspace', 'domainId') }],
        },
        execute: (user, input) => SmeMcpService.listMyWorkspace(user, input as z.infer<typeof listWorkspaceSchema>),
    },
    {
        name: 'create_case_study_bundle',
        description: smeMcpToolMetadataByName.create_case_study_bundle.description,
        inputSchema: createCaseStudyBundleSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('create_case_study_bundle'),
            properties: {
                domainId: describedUuidSchema(
                    parameterDescription('create_case_study_bundle', 'domainId', 'Required domain UUID.'),
                    parameterExample('create_case_study_bundle', 'domainId')
                ),
                seriesId: describedUuidSchema(
                    parameterDescription('create_case_study_bundle', 'seriesId', 'Required series UUID.'),
                    parameterExample('create_case_study_bundle', 'seriesId')
                ),
                title: describedStringSchema(
                    parameterDescription('create_case_study_bundle', 'title', 'Required title.'),
                    { minLength: 1, maxLength: 200, examples: [parameterExample('create_case_study_bundle', 'title') ?? ''] }
                ),
                scheduledAt: describedStringSchema(
                    parameterDescription('create_case_study_bundle', 'scheduledAt', 'Optional ISO 8601 datetime.'),
                    { format: 'date-time', nullable: true, examples: [parameterExample('create_case_study_bundle', 'scheduledAt') ?? ''] }
                ),
                description: describedStringSchema(
                    parameterDescription('create_case_study_bundle', 'description', 'Optional description.'),
                    { nullable: true, examples: [parameterExample('create_case_study_bundle', 'description') ?? ''] }
                ),
                hostId: describedUuidSchema(
                    parameterDescription('create_case_study_bundle', 'hostId', 'Optional host user UUID.')
                ),
                starValue: describedIntegerSchema(
                    parameterDescription('create_case_study_bundle', 'starValue', 'Optional star value.'),
                    { minimum: 0, maximum: 20, nullable: true, examples: [Number(parameterExample('create_case_study_bundle', 'starValue') ?? '2')] }
                ),
                assessmentKind: describedStringSchema(
                    parameterDescription('create_case_study_bundle', 'assessmentKind', 'Optional assessment kind.'),
                    {
                        enum: ['PRACTICE', 'READINESS', 'FORMAL'] as const,
                        examples: [parameterExample('create_case_study_bundle', 'assessmentKind') ?? 'PRACTICE'],
                    }
                ),
                countsTowardPerformance: describedBooleanSchema(
                    parameterDescription(
                        'create_case_study_bundle',
                        'countsTowardPerformance',
                        'Optional performance flag.'
                    )
                ),
            },
            required: ['domainId', 'seriesId', 'title'],
            additionalProperties: false,
            examples: [
                {
                    domainId: parameterExample('create_case_study_bundle', 'domainId'),
                    seriesId: parameterExample('create_case_study_bundle', 'seriesId'),
                    title: parameterExample('create_case_study_bundle', 'title'),
                    description: parameterExample('create_case_study_bundle', 'description'),
                    starValue: Number(parameterExample('create_case_study_bundle', 'starValue') ?? '2'),
                    assessmentKind: parameterExample('create_case_study_bundle', 'assessmentKind'),
                    countsTowardPerformance: false,
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.createCaseStudyBundle(user, input as z.infer<typeof createCaseStudyBundleSchema>),
    },
    {
        name: 'link_existing_course_to_event',
        description: smeMcpToolMetadataByName.link_existing_course_to_event.description,
        inputSchema: linkExistingCourseToEventSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('link_existing_course_to_event'),
            properties: {
                eventId: describedUuidSchema(
                    parameterDescription('link_existing_course_to_event', 'eventId', 'Required event UUID.'),
                    parameterExample('link_existing_course_to_event', 'eventId')
                ),
                courseId: describedUuidSchema(
                    parameterDescription('link_existing_course_to_event', 'courseId', 'Required course UUID.'),
                    parameterExample('link_existing_course_to_event', 'courseId')
                ),
            },
            required: ['eventId', 'courseId'],
            additionalProperties: false,
            examples: [
                {
                    eventId: parameterExample('link_existing_course_to_event', 'eventId'),
                    courseId: parameterExample('link_existing_course_to_event', 'courseId'),
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.linkExistingCourseToEvent(user, input as z.infer<typeof linkExistingCourseToEventSchema>),
    },
    {
        name: 'link_existing_exam_to_event',
        description: smeMcpToolMetadataByName.link_existing_exam_to_event.description,
        inputSchema: linkExistingExamToEventSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('link_existing_exam_to_event'),
            properties: {
                eventId: describedUuidSchema(
                    parameterDescription('link_existing_exam_to_event', 'eventId', 'Required event UUID.'),
                    parameterExample('link_existing_exam_to_event', 'eventId')
                ),
                examId: describedUuidSchema(
                    parameterDescription('link_existing_exam_to_event', 'examId', 'Required exam UUID.'),
                    parameterExample('link_existing_exam_to_event', 'examId')
                ),
            },
            required: ['eventId', 'examId'],
            additionalProperties: false,
            examples: [
                {
                    eventId: parameterExample('link_existing_exam_to_event', 'eventId'),
                    examId: parameterExample('link_existing_exam_to_event', 'examId'),
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.linkExistingExamToEvent(user, input as z.infer<typeof linkExistingExamToEventSchema>),
    },
    {
        name: 'set_course_ai_template',
        description: smeMcpToolMetadataByName.set_course_ai_template.description,
        inputSchema: setCourseAiTemplateSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('set_course_ai_template'),
            properties: {
                courseId: describedUuidSchema(
                    parameterDescription('set_course_ai_template', 'courseId', 'Required course UUID.'),
                    parameterExample('set_course_ai_template', 'courseId')
                ),
                templateId: describedUuidSchema(
                    parameterDescription('set_course_ai_template', 'templateId', 'Optional template UUID.'),
                    parameterExample('set_course_ai_template', 'templateId')
                ),
                useDefault: describedBooleanSchema(
                    parameterDescription('set_course_ai_template', 'useDefault', 'Optional use-default flag.')
                ),
                enabled: describedBooleanSchema(
                    parameterDescription('set_course_ai_template', 'enabled', 'Optional enabled flag.')
                ),
            },
            required: ['courseId'],
            additionalProperties: false,
            oneOf: [
                {
                    required: ['courseId', 'templateId'],
                },
                {
                    required: ['courseId', 'useDefault'],
                    properties: {
                        useDefault: { const: true },
                    },
                },
            ],
            examples: [
                {
                    courseId: parameterExample('set_course_ai_template', 'courseId'),
                    useDefault: true,
                },
                {
                    courseId: parameterExample('set_course_ai_template', 'courseId'),
                    templateId: parameterExample('set_course_ai_template', 'templateId'),
                    enabled: true,
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.setCourseAiTemplate(user, input as z.infer<typeof setCourseAiTemplateSchema>),
    },
    {
        name: 'prepare_transcript_upload',
        description: smeMcpToolMetadataByName.prepare_transcript_upload.description,
        inputSchema: prepareTranscriptUploadSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('prepare_transcript_upload'),
            properties: {
                lessonId: describedUuidSchema(
                    parameterDescription('prepare_transcript_upload', 'lessonId', 'Required lesson UUID.'),
                    parameterExample('prepare_transcript_upload', 'lessonId')
                ),
                videoAssetId: describedUuidSchema(
                    parameterDescription('prepare_transcript_upload', 'videoAssetId', 'Required video asset UUID.'),
                    parameterExample('prepare_transcript_upload', 'videoAssetId')
                ),
                filename: describedStringSchema(
                    parameterDescription('prepare_transcript_upload', 'filename', 'Required filename.'),
                    { minLength: 1, maxLength: 255, examples: [parameterExample('prepare_transcript_upload', 'filename') ?? ''] }
                ),
                contentType: describedStringSchema(
                    parameterDescription('prepare_transcript_upload', 'contentType', 'Optional content type.'),
                    {
                        enum: (parameterAcceptedValues('prepare_transcript_upload', 'contentType') ?? ['text/vtt']) as readonly string[],
                        examples: [parameterExample('prepare_transcript_upload', 'contentType') ?? 'text/vtt'],
                    }
                ),
                languageCode: describedStringSchema(
                    parameterDescription('prepare_transcript_upload', 'languageCode', 'Optional language code.'),
                    { minLength: 2, maxLength: 20, examples: [parameterExample('prepare_transcript_upload', 'languageCode') ?? ''] }
                ),
                label: describedStringSchema(
                    parameterDescription('prepare_transcript_upload', 'label', 'Optional label.'),
                    { maxLength: 80, nullable: true, examples: [parameterExample('prepare_transcript_upload', 'label') ?? ''] }
                ),
                replaceExistingLanguage: describedBooleanSchema(
                    parameterDescription(
                        'prepare_transcript_upload',
                        'replaceExistingLanguage',
                        'Optional replace-existing-language flag.'
                    )
                ),
                setAsDefaultSubtitle: describedBooleanSchema(
                    parameterDescription(
                        'prepare_transcript_upload',
                        'setAsDefaultSubtitle',
                        'Optional default-subtitle flag.'
                    )
                ),
                setAsPrimaryForAI: describedBooleanSchema(
                    parameterDescription('prepare_transcript_upload', 'setAsPrimaryForAI', 'Optional primary-for-AI flag.')
                ),
            },
            required: ['lessonId', 'videoAssetId', 'filename'],
            additionalProperties: false,
            examples: [
                {
                    lessonId: parameterExample('prepare_transcript_upload', 'lessonId'),
                    videoAssetId: parameterExample('prepare_transcript_upload', 'videoAssetId'),
                    filename: parameterExample('prepare_transcript_upload', 'filename'),
                    contentType: parameterExample('prepare_transcript_upload', 'contentType'),
                    languageCode: parameterExample('prepare_transcript_upload', 'languageCode'),
                    label: parameterExample('prepare_transcript_upload', 'label'),
                    setAsDefaultSubtitle: true,
                    setAsPrimaryForAI: true,
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.prepareTranscriptUpload(user, input as z.infer<typeof prepareTranscriptUploadSchema>),
    },
    {
        name: 'process_transcript_knowledge',
        description: smeMcpToolMetadataByName.process_transcript_knowledge.description,
        inputSchema: processTranscriptKnowledgeSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('process_transcript_knowledge'),
            properties: {
                lessonId: describedUuidSchema(
                    parameterDescription('process_transcript_knowledge', 'lessonId', 'Required lesson UUID.'),
                    parameterExample('process_transcript_knowledge', 'lessonId')
                ),
                transcriptId: describedUuidSchema(
                    parameterDescription('process_transcript_knowledge', 'transcriptId', 'Optional transcript UUID.'),
                    parameterExample('process_transcript_knowledge', 'transcriptId')
                ),
                processTranscript: describedBooleanSchema(
                    parameterDescription(
                        'process_transcript_knowledge',
                        'processTranscript',
                        'Optional process-transcript flag.'
                    )
                ),
                processKnowledge: describedBooleanSchema(
                    parameterDescription(
                        'process_transcript_knowledge',
                        'processKnowledge',
                        'Optional process-knowledge flag.'
                    )
                ),
                force: describedBooleanSchema(
                    parameterDescription('process_transcript_knowledge', 'force', 'Optional force flag.')
                ),
                knowledgePromptTemplateId: describedUuidSchema(
                    parameterDescription(
                        'process_transcript_knowledge',
                        'knowledgePromptTemplateId',
                        'Optional knowledge prompt template UUID.'
                    )
                ),
                anchorsPromptTemplateId: describedUuidSchema(
                    parameterDescription(
                        'process_transcript_knowledge',
                        'anchorsPromptTemplateId',
                        'Optional anchors prompt template UUID.'
                    )
                ),
            },
            required: ['lessonId'],
            additionalProperties: false,
            examples: [
                {
                    lessonId: parameterExample('process_transcript_knowledge', 'lessonId'),
                    processTranscript: true,
                    processKnowledge: true,
                },
                {
                    lessonId: parameterExample('process_transcript_knowledge', 'lessonId'),
                    transcriptId: parameterExample('process_transcript_knowledge', 'transcriptId'),
                    processKnowledge: true,
                    force: true,
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.processTranscriptKnowledge(user, input as z.infer<typeof processTranscriptKnowledgeSchema>),
    },
    {
        name: 'publish_exam_with_invitations',
        description: smeMcpToolMetadataByName.publish_exam_with_invitations.description,
        inputSchema: publishExamWithInvitationsSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('publish_exam_with_invitations'),
            properties: {
                examId: describedUuidSchema(
                    parameterDescription('publish_exam_with_invitations', 'examId', 'Required exam UUID.'),
                    parameterExample('publish_exam_with_invitations', 'examId')
                ),
                userIds: describedUuidArraySchema(
                    parameterDescription('publish_exam_with_invitations', 'userIds', 'Optional learner UUID list.'),
                    { example: parameterExample('publish_exam_with_invitations', 'userIds') }
                ),
                sendNotification: describedBooleanSchema(
                    parameterDescription(
                        'publish_exam_with_invitations',
                        'sendNotification',
                        'Optional send-notification flag.'
                    ),
                    false
                ),
            },
            required: ['examId'],
            additionalProperties: false,
            examples: [
                {
                    examId: parameterExample('publish_exam_with_invitations', 'examId'),
                    userIds: parseArrayExample(parameterExample('publish_exam_with_invitations', 'userIds')),
                    sendNotification: false,
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.publishExamWithInvitations(user, input as z.infer<typeof publishExamWithInvitationsSchema>),
    },
    {
        name: 'assign_course_invitations',
        description: smeMcpToolMetadataByName.assign_course_invitations.description,
        inputSchema: assignCourseInvitationsSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('assign_course_invitations'),
            properties: {
                courseId: describedUuidSchema(
                    parameterDescription('assign_course_invitations', 'courseId', 'Required course UUID.'),
                    parameterExample('assign_course_invitations', 'courseId')
                ),
                userIds: describedUuidArraySchema(
                    parameterDescription('assign_course_invitations', 'userIds', 'Required learner UUID list.'),
                    { minItems: 1, example: parameterExample('assign_course_invitations', 'userIds') }
                ),
                sendNotification: describedBooleanSchema(
                    parameterDescription(
                        'assign_course_invitations',
                        'sendNotification',
                        'Optional send-notification flag.'
                    ),
                    false
                ),
            },
            required: ['courseId', 'userIds'],
            additionalProperties: false,
            examples: [
                {
                    courseId: parameterExample('assign_course_invitations', 'courseId'),
                    userIds: parseArrayExample(parameterExample('assign_course_invitations', 'userIds')),
                    sendNotification: false,
                },
            ],
        },
        execute: (user, input) =>
            SmeMcpService.assignCourseInvitations(user, input as z.infer<typeof assignCourseInvitationsSchema>),
    },
    {
        name: 'get_event_execution_status',
        description: smeMcpToolMetadataByName.get_event_execution_status.description,
        inputSchema: getEventExecutionStatusSchema,
        inputJsonSchema: {
            type: 'object',
            description: toolInputDescription('get_event_execution_status'),
            properties: {
                eventId: describedUuidSchema(
                    parameterDescription('get_event_execution_status', 'eventId', 'Required event UUID.'),
                    parameterExample('get_event_execution_status', 'eventId')
                ),
            },
            required: ['eventId'],
            additionalProperties: false,
            examples: [{ eventId: parameterExample('get_event_execution_status', 'eventId') }],
        },
        execute: (user, input) =>
            SmeMcpService.getEventExecutionStatus(user, input as z.infer<typeof getEventExecutionStatusSchema>),
    },
    {
        name: 'list_my_series_badges',
        description: smeMcpToolMetadataByName.list_my_series_badges.description,
        inputSchema: z.object({}).default({}),
        inputJsonSchema: emptyObjectJsonSchema,
        execute: (user) => SmeMcpService.listMySeriesBadges(user),
    },
] as const satisfies readonly SmeMcpToolDefinition[]

export type ActiveSmeMcpToolName = (typeof smeMcpToolDefinitions)[number]['name']

const toolDefinitionMap = new Map<string, SmeMcpToolDefinition>(
    smeMcpToolDefinitions.map((definition) => [definition.name, definition])
)

export const activeSmeMcpToolNames = smeMcpToolDefinitions.map((definition) => definition.name) as ActiveSmeMcpToolName[]

export const getSmeMcpToolDefinition = (toolName: string) => toolDefinitionMap.get(toolName)

export const listMcpToolsForServer = () =>
    smeMcpToolDefinitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputJsonSchema,
    }))
