export type SmeMcpToolParameterMetadata = {
    name: string
    required: boolean
    type: string
    description: string
    acceptedValues?: string[]
    example?: string
}

export type SmeMcpToolMetadata = {
    key: string
    label: string
    description: string
    category: string
    inputSummary: string
    notes?: string[]
    parameters: SmeMcpToolParameterMetadata[]
}

export const smeMcpToolMetadata: SmeMcpToolMetadata[] = [
    {
        key: 'list_my_workspace',
        label: 'List My Workspace',
        description: 'Get scoped domains, series, events, courses, exams, and gap signals.',
        category: 'Workspace',
        inputSummary: 'No required fields. Leave the JSON empty to inspect the whole SME scope.',
        notes: ['Use domainId only when you want to narrow the response to one domain.'],
        parameters: [
            {
                name: 'domainId',
                required: false,
                type: 'uuid',
                description: 'Optional domain filter. Use one domain UUID from the current SME workspace.',
                example: '11111111-1111-1111-1111-111111111111',
            },
        ],
    },
    {
        key: 'create_case_study_bundle',
        label: 'Create Case Study Bundle',
        description: 'Create an event, draft course, and draft exam in one action.',
        category: 'Workflow',
        inputSummary: 'Required: domainId, seriesId, title. Optional scheduling, host, star, and assessment settings.',
        notes: [
            'seriesId must belong to the selected domainId.',
            'The new event, course, and exam are created together inside the same scope.',
        ],
        parameters: [
            {
                name: 'domainId',
                required: true,
                type: 'uuid',
                description: 'Target domain UUID. Pick a value from the current SME workspace.',
                example: '11111111-1111-1111-1111-111111111111',
            },
            {
                name: 'seriesId',
                required: true,
                type: 'uuid',
                description: 'Target learning series UUID under the selected domain.',
                example: '22222222-2222-2222-2222-222222222222',
            },
            {
                name: 'title',
                required: true,
                type: 'string',
                description: 'Human-readable event title. Also seeds the paired draft course and exam titles.',
                example: 'RTC Weekly Case Study - 2026-04-10',
            },
            {
                name: 'scheduledAt',
                required: false,
                type: 'ISO 8601 datetime | null',
                description: 'Planned event time. Omit or set null when the event is still unscheduled.',
                example: '2026-04-15T09:00:00.000Z',
            },
            {
                name: 'description',
                required: false,
                type: 'string | null',
                description: 'Optional summary used for the event and seed content.',
                example: 'Created from SME MCP Lab.',
            },
            {
                name: 'hostId',
                required: false,
                type: 'uuid | null',
                description: 'Optional SME host user UUID.',
            },
            {
                name: 'starValue',
                required: false,
                type: 'integer | null',
                description: 'Recognition star value for the event.',
                acceptedValues: ['0 to 20'],
                example: '2',
            },
            {
                name: 'assessmentKind',
                required: false,
                type: 'enum',
                description: 'Exam intent for the generated exam.',
                acceptedValues: ['PRACTICE', 'READINESS', 'FORMAL'],
                example: 'PRACTICE',
            },
            {
                name: 'countsTowardPerformance',
                required: false,
                type: 'boolean',
                description: 'Whether the event should count toward performance metrics.',
                example: 'false',
            },
        ],
    },
    {
        key: 'link_existing_course_to_event',
        label: 'Link Existing Course To Event',
        description: 'Attach a scoped course to an owned event.',
        category: 'Workflow',
        inputSummary: 'Required: eventId, courseId.',
        notes: ['The course must be in scope and not already linked to another event.'],
        parameters: [
            {
                name: 'eventId',
                required: true,
                type: 'uuid',
                description: 'Target event UUID.',
                example: '33333333-3333-3333-3333-333333333333',
            },
            {
                name: 'courseId',
                required: true,
                type: 'uuid',
                description: 'Existing course UUID to attach to the event.',
                example: '44444444-4444-4444-4444-444444444444',
            },
        ],
    },
    {
        key: 'link_existing_exam_to_event',
        label: 'Link Existing Exam To Event',
        description: 'Attach a scoped exam to an owned event.',
        category: 'Workflow',
        inputSummary: 'Required: eventId, examId.',
        notes: ['The exam must be in the same domain and series as the target event.'],
        parameters: [
            {
                name: 'eventId',
                required: true,
                type: 'uuid',
                description: 'Target event UUID.',
                example: '33333333-3333-3333-3333-333333333333',
            },
            {
                name: 'examId',
                required: true,
                type: 'uuid',
                description: 'Existing exam UUID to attach to the event.',
                example: '55555555-5555-5555-5555-555555555555',
            },
        ],
    },
    {
        key: 'get_event_execution_status',
        label: 'Get Event Execution Status',
        description: 'Inspect linked course, exam, transcript, knowledge, and invitation state for an event.',
        category: 'Workflow',
        inputSummary: 'Required: eventId.',
        parameters: [
            {
                name: 'eventId',
                required: true,
                type: 'uuid',
                description: 'Event UUID whose workflow state you want to inspect.',
                example: '33333333-3333-3333-3333-333333333333',
            },
        ],
    },
    {
        key: 'set_course_ai_template',
        label: 'Set Course AI Template',
        description: 'Apply the default AI template or a selected active template to a scoped course.',
        category: 'Course',
        inputSummary: 'Required: courseId. Then choose exactly one of templateId or useDefault=true.',
        notes: [
            'Do not send templateId and useDefault at the same time.',
            'Use enabled when you want the assigned template to become active immediately.',
        ],
        parameters: [
            {
                name: 'courseId',
                required: true,
                type: 'uuid',
                description: 'Target course UUID.',
                example: '44444444-4444-4444-4444-444444444444',
            },
            {
                name: 'templateId',
                required: false,
                type: 'uuid',
                description: 'Explicit active prompt template UUID for course AI.',
                example: '66666666-6666-6666-6666-666666666666',
            },
            {
                name: 'useDefault',
                required: false,
                type: 'boolean',
                description: 'Set true to use the system default course AI template.',
                example: 'true',
            },
            {
                name: 'enabled',
                required: false,
                type: 'boolean',
                description: 'Whether the assigned template should be enabled immediately.',
                example: 'true',
            },
        ],
    },
    {
        key: 'assign_course_invitations',
        label: 'Assign Course Invitations',
        description: 'Invite users to a scoped course.',
        category: 'Course',
        inputSummary: 'Required: courseId, userIds. The course must already be published.',
        notes: ['Each userId must belong to an active learner account.'],
        parameters: [
            {
                name: 'courseId',
                required: true,
                type: 'uuid',
                description: 'Published course UUID.',
                example: '44444444-4444-4444-4444-444444444444',
            },
            {
                name: 'userIds',
                required: true,
                type: 'uuid[]',
                description: 'Learner user UUID array.',
                example: '["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]',
            },
            {
                name: 'sendNotification',
                required: false,
                type: 'boolean',
                description: 'Whether learners should be notified immediately.',
                example: 'false',
            },
        ],
    },
    {
        key: 'prepare_transcript_upload',
        label: 'Prepare Transcript Upload',
        description: 'Create transcript upload metadata for a lesson video track.',
        category: 'Transcript',
        inputSummary: 'Required: lessonId, videoAssetId, filename.',
        notes: [
            'Use a .vtt filename and text/vtt contentType.',
            'setAsPrimaryForAI is the safest choice when this transcript should drive knowledge generation.',
        ],
        parameters: [
            {
                name: 'lessonId',
                required: true,
                type: 'uuid',
                description: 'Lesson UUID that owns the transcript track.',
                example: '77777777-7777-7777-7777-777777777777',
            },
            {
                name: 'videoAssetId',
                required: true,
                type: 'uuid',
                description: 'Video asset UUID under the same lesson.',
                example: '88888888-8888-8888-8888-888888888888',
            },
            {
                name: 'filename',
                required: true,
                type: 'string',
                description: 'Subtitle filename to upload.',
                example: 'lesson-transcript-en.vtt',
            },
            {
                name: 'contentType',
                required: false,
                type: 'enum',
                description: 'MIME type for the transcript upload.',
                acceptedValues: ['text/vtt'],
                example: 'text/vtt',
            },
            {
                name: 'languageCode',
                required: false,
                type: 'string',
                description: 'Language code for the transcript track.',
                example: 'en',
            },
            {
                name: 'label',
                required: false,
                type: 'string | null',
                description: 'User-facing subtitle label.',
                example: 'English',
            },
            {
                name: 'replaceExistingLanguage',
                required: false,
                type: 'boolean',
                description: 'Replace an existing transcript in the same language.',
                example: 'false',
            },
            {
                name: 'setAsDefaultSubtitle',
                required: false,
                type: 'boolean',
                description: 'Make this track the default subtitle shown to learners.',
                example: 'true',
            },
            {
                name: 'setAsPrimaryForAI',
                required: false,
                type: 'boolean',
                description: 'Use this transcript as the primary source for AI processing.',
                example: 'true',
            },
        ],
    },
    {
        key: 'process_transcript_knowledge',
        label: 'Process Transcript Knowledge',
        description: 'Queue transcript parsing and knowledge-context generation for a lesson.',
        category: 'Transcript',
        inputSummary: 'Required: lessonId. Usually set processTranscript=true and processKnowledge=true.',
        notes: [
            'transcriptId is optional when the lesson already has a primary transcript.',
            'At least one of processTranscript or processKnowledge should be true.',
        ],
        parameters: [
            {
                name: 'lessonId',
                required: true,
                type: 'uuid',
                description: 'Lesson UUID whose pipeline should run.',
                example: '77777777-7777-7777-7777-777777777777',
            },
            {
                name: 'transcriptId',
                required: false,
                type: 'uuid',
                description: 'Specific transcript track UUID to process.',
                example: '99999999-9999-9999-9999-999999999999',
            },
            {
                name: 'processTranscript',
                required: false,
                type: 'boolean',
                description: 'Run transcript parsing and chunking.',
                example: 'true',
            },
            {
                name: 'processKnowledge',
                required: false,
                type: 'boolean',
                description: 'Run knowledge and anchor generation.',
                example: 'true',
            },
            {
                name: 'force',
                required: false,
                type: 'boolean',
                description: 'Force a re-run even if outputs already exist.',
                example: 'false',
            },
            {
                name: 'knowledgePromptTemplateId',
                required: false,
                type: 'uuid | null',
                description: 'Optional override prompt template for knowledge extraction.',
            },
            {
                name: 'anchorsPromptTemplateId',
                required: false,
                type: 'uuid | null',
                description: 'Optional override prompt template for anchor extraction.',
            },
        ],
    },
    {
        key: 'publish_exam_with_invitations',
        label: 'Publish Exam With Invitations',
        description: 'Publish a scoped exam and create invitations in one step.',
        category: 'Exam',
        inputSummary: 'Required: examId. userIds is optional but publish preconditions still apply.',
        notes: [
            'The exam must already be APPROVED.',
            'If there are no existing invitations, some flows still require userIds.',
        ],
        parameters: [
            {
                name: 'examId',
                required: true,
                type: 'uuid',
                description: 'Approved exam UUID.',
                example: '55555555-5555-5555-5555-555555555555',
            },
            {
                name: 'userIds',
                required: false,
                type: 'uuid[]',
                description: 'Learner UUIDs to invite during publish.',
                example: '["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]',
            },
            {
                name: 'sendNotification',
                required: false,
                type: 'boolean',
                description: 'Whether invited learners should be notified immediately.',
                example: 'false',
            },
        ],
    },
    {
        key: 'list_my_series_badges',
        label: 'List My Series Badges',
        description: 'Show badge ladders for badge-enabled scoped learning series.',
        category: 'Insights',
        inputSummary: 'No parameters. Leave the JSON as an empty object.',
        parameters: [],
    },
]

export const smeMcpToolMetadataByName = Object.fromEntries(
    smeMcpToolMetadata.map((tool) => [tool.key, tool])
) as Record<(typeof smeMcpToolMetadata)[number]['key'], SmeMcpToolMetadata>

export const getSmeMcpToolMetadata = (toolName: keyof typeof smeMcpToolMetadataByName) =>
    smeMcpToolMetadataByName[toolName]

export const getSmeMcpToolParameterMetadata = (
    toolName: keyof typeof smeMcpToolMetadataByName,
    parameterName: string
) => smeMcpToolMetadataByName[toolName].parameters.find((parameter) => parameter.name === parameterName)
