import { AuthUser } from '@/lib/auth-middleware'
import {
    activeSmeMcpToolNames,
    deprecatedSmeMcpToolNames,
    getSmeMcpToolDefinition,
} from '@/lib/sme-mcp-registry'
import { z } from 'zod'

type MappableUser = Pick<AuthUser, 'id' | 'role'>

export class SmeMcpError extends Error {
    status: number
    code: string
    details?: unknown

    constructor(code: string, message: string, status: number, details?: unknown) {
        super(message)
        this.name = 'SmeMcpError'
        this.status = status
        this.code = code
        this.details = details
    }
}

export const parseAndExecuteSmeMcpTool = async (
    user: MappableUser,
    body: unknown,
    options?: {
        allowedTools?: string[]
    }
) => {
    const payload = normalizeToolPayload(body, options)
    const definition = getSmeMcpToolDefinition(payload.tool)

    if (!definition) {
        throw new SmeMcpError('MCP_TOOL_UNKNOWN', 'Unsupported SME MCP tool', 400)
    }

    const input = definition.inputSchema.parse(payload.input)
    return definition.execute(user, input)
}

export const normalizeSmeMcpError = (error: unknown) => {
    const details = extractErrorDetails(error)

    if (error instanceof SmeMcpError) {
        return {
            status: error.status,
            body: {
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    ...(error.details === undefined ? {} : { details: error.details }),
                },
            },
        }
    }

    if (error instanceof z.ZodError) {
        return {
            status: 400,
            body: {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid SME MCP payload',
                    details: error.errors,
                },
            },
        }
    }

    if (error instanceof Error) {
        const message = error.message

        if (message === 'TRAINING_OPS_SCOPE_FORBIDDEN' || message === 'TRAINING_OPS_FORBIDDEN') {
            return errorResponse(403, 'FORBIDDEN', 'Insufficient permissions')
        }

        if (message === 'PROMPT_TEMPLATE_NOT_FOUND') {
            return errorResponse(404, 'PROMPT_TEMPLATE_NOT_FOUND', 'Prompt template not found or inactive')
        }

        if (message === 'DOMAIN_REFERENCE_NOT_FOUND') {
            return errorResponse(404, 'DOMAIN_REFERENCE_NOT_FOUND', 'Domain reference was not found in the current SME scope', details)
        }

        if (message === 'DOMAIN_REFERENCE_AMBIGUOUS') {
            return errorResponse(400, 'DOMAIN_REFERENCE_AMBIGUOUS', 'Domain reference matched multiple domains in the current SME scope', details)
        }

        if (message === 'SERIES_REFERENCE_NOT_FOUND') {
            return errorResponse(404, 'SERIES_REFERENCE_NOT_FOUND', 'Learning series reference was not found in the current SME scope', details)
        }

        if (message === 'SERIES_REFERENCE_AMBIGUOUS') {
            return errorResponse(400, 'SERIES_REFERENCE_AMBIGUOUS', 'Learning series reference matched multiple series in the current SME scope', details)
        }

        if (message === 'EVENT_REFERENCE_NOT_FOUND') {
            return errorResponse(404, 'EVENT_REFERENCE_NOT_FOUND', 'Learning event reference was not found in the current SME scope', details)
        }

        if (message === 'EVENT_REFERENCE_AMBIGUOUS') {
            return errorResponse(400, 'EVENT_REFERENCE_AMBIGUOUS', 'Learning event reference matched multiple events in the current SME scope', details)
        }

        if (message === 'COURSE_REFERENCE_NOT_FOUND') {
            return errorResponse(404, 'COURSE_REFERENCE_NOT_FOUND', 'Course reference was not found in the current SME scope', details)
        }

        if (message === 'COURSE_REFERENCE_AMBIGUOUS') {
            return errorResponse(400, 'COURSE_REFERENCE_AMBIGUOUS', 'Course reference matched multiple courses in the current SME scope', details)
        }

        if (message === 'EXAM_REFERENCE_NOT_FOUND') {
            return errorResponse(404, 'EXAM_REFERENCE_NOT_FOUND', 'Exam reference was not found in the current SME scope', details)
        }

        if (message === 'EXAM_REFERENCE_AMBIGUOUS') {
            return errorResponse(400, 'EXAM_REFERENCE_AMBIGUOUS', 'Exam reference matched multiple exams in the current SME scope', details)
        }

        if (message === 'USER_REFERENCE_NOT_FOUND') {
            return errorResponse(404, 'USER_REFERENCE_NOT_FOUND', 'User reference was not found or is inactive', details)
        }

        if (message === 'PROMPT_TEMPLATE_USE_CASE_MISMATCH') {
            return errorResponse(
                400,
                'PROMPT_TEMPLATE_USE_CASE_MISMATCH',
                'Prompt template use case does not match this SME MCP workflow'
            )
        }

        if (message === 'PRODUCT_DOMAIN_NOT_FOUND') {
            return errorResponse(404, 'PRODUCT_DOMAIN_NOT_FOUND', 'Product domain not found')
        }

        if (message === 'LEARNING_SERIES_NOT_FOUND') {
            return errorResponse(404, 'LEARNING_SERIES_NOT_FOUND', 'Learning series not found')
        }

        if (message === 'LEARNING_SERIES_SLUG_EXISTS') {
            return errorResponse(409, 'LEARNING_SERIES_SLUG_EXISTS', 'A learning series with this slug already exists')
        }

        if (message === 'BADGE_MILESTONE_SLUG_EXISTS') {
            return errorResponse(409, 'BADGE_MILESTONE_SLUG_EXISTS', 'A badge milestone with this slug already exists in the selected domain')
        }

        if (message === 'BADGE_THRESHOLD_EXISTS') {
            return errorResponse(409, 'BADGE_THRESHOLD_EXISTS', 'A badge milestone already uses this threshold in the selected domain')
        }

        if (message === 'SERIES_DOMAIN_MISMATCH') {
            return errorResponse(400, 'SERIES_DOMAIN_MISMATCH', 'The selected learning series belongs to a different domain')
        }

        if (message === 'HOST_NOT_FOUND') {
            return errorResponse(404, 'HOST_NOT_FOUND', 'The selected event host was not found or is inactive')
        }

        if (message === 'INVALID_EVENT_TIME_RANGE') {
            return errorResponse(400, 'INVALID_EVENT_TIME_RANGE', 'The event end time must be later than the start or scheduled time')
        }

        if (message === 'INVALID_EVENT_FORMAT_FOR_SERIES') {
            return errorResponse(400, 'INVALID_EVENT_FORMAT_FOR_SERIES', 'The selected event format is not allowed for the selected learning series')
        }

        if (message === 'LEARNING_EVENT_NOT_FOUND') {
            return errorResponse(404, 'LEARNING_EVENT_NOT_FOUND', 'Learning event not found')
        }

        if (message === 'COURSE_NOT_FOUND') {
            return errorResponse(404, 'COURSE_NOT_FOUND', 'Course not found')
        }

        if (message === 'COURSE_NOT_PUBLISHED') {
            return errorResponse(400, 'COURSE_NOT_PUBLISHED', 'Course must be published before invitations can be assigned')
        }

        if (message === 'COURSE_ARCHIVED') {
            return errorResponse(400, 'COURSE_ARCHIVED', 'Archived courses cannot be linked to an event')
        }

        if (message === 'COURSE_ALREADY_LINKED_TO_OTHER_EVENT') {
            return errorResponse(409, 'COURSE_ALREADY_LINKED_TO_OTHER_EVENT', 'Course is already linked to another event')
        }

        if (message === 'EXAM_NOT_FOUND') {
            return errorResponse(404, 'EXAM_NOT_FOUND', 'Exam not found')
        }

        if (message === 'EXAM_NOT_DRAFT') {
            return errorResponse(400, 'EXAM_NOT_DRAFT', 'Exam can only be modified in DRAFT status')
        }

        if (message === 'QUESTION_SOURCE_COURSE_REQUIRED') {
            return errorResponse(400, 'QUESTION_SOURCE_COURSE_REQUIRED', 'sourceCourse is required when generating questions from a course')
        }

        if (message === 'QUESTION_SOURCE_EVENT_REQUIRED') {
            return errorResponse(400, 'QUESTION_SOURCE_EVENT_REQUIRED', 'sourceEvent is required when generating questions from an event')
        }

        if (message === 'EVENT_LINKED_COURSE_NOT_FOUND') {
            return errorResponse(404, 'EVENT_LINKED_COURSE_NOT_FOUND', 'The selected event does not have a linked course that can be used for question generation', details)
        }

        if (message === 'EVENT_LINKED_COURSE_AMBIGUOUS') {
            return errorResponse(400, 'EVENT_LINKED_COURSE_AMBIGUOUS', 'The selected event is linked to multiple courses, so a single source course cannot be chosen automatically', details)
        }

        if (message.startsWith('LESSONS_NOT_FOUND:')) {
            return errorResponse(400, 'LESSONS_NOT_FOUND', 'One or more selected lessons no longer exist for question generation')
        }

        if (message.startsWith('NO_CONTENT_AVAILABLE')) {
            return errorResponse(400, 'NO_CONTENT_AVAILABLE', 'No usable knowledge context or transcript content is available for question generation')
        }

        if (message === 'OPENAI_API_KEY_MISSING') {
            return errorResponse(500, 'OPENAI_API_KEY_MISSING', 'OPENAI_API_KEY is not configured on the server')
        }

        if (message === 'EXAM_NOT_APPROVED') {
            return errorResponse(400, 'EXAM_NOT_APPROVED', 'Exam must be APPROVED before it can be published')
        }

        if (message === 'EXAM_HAS_NO_QUESTIONS') {
            return errorResponse(400, 'EXAM_HAS_NO_QUESTIONS', 'Exam must have at least one question before it can be published')
        }

        if (message === 'EXAM_TOTAL_SCORE_MISMATCH') {
            return errorResponse(
                400,
                'EXAM_TOTAL_SCORE_MISMATCH',
                'Exam question points must match the exam total score before publishing'
            )
        }

        if (message === 'EXAM_INVITATIONS_REQUIRED') {
            return errorResponse(
                400,
                'EXAM_INVITATIONS_REQUIRED',
                'Publishing requires assigning users or keeping existing invitations'
            )
        }

        if (message === 'EXAM_ARCHIVED') {
            return errorResponse(400, 'EXAM_ARCHIVED', 'Archived exams cannot be linked to an event')
        }

        if (message === 'EXAM_ALREADY_LINKED_TO_OTHER_EVENT') {
            return errorResponse(409, 'EXAM_ALREADY_LINKED_TO_OTHER_EVENT', 'Exam is already linked to another event')
        }

        if (message === 'EXAM_DOMAIN_MISMATCH') {
            return errorResponse(400, 'EXAM_DOMAIN_MISMATCH', 'Exam domain does not match the selected event scope')
        }

        if (message === 'EXAM_SERIES_MISMATCH') {
            return errorResponse(
                400,
                'EXAM_SERIES_MISMATCH',
                'Exam learning series does not match the selected event scope'
            )
        }

        if (message === 'LESSON_NOT_FOUND') {
            return errorResponse(404, 'LESSON_NOT_FOUND', 'Lesson not found')
        }

        if (message === 'VIDEO_ASSET_NOT_FOUND') {
            return errorResponse(400, 'VIDEO_ASSET_NOT_FOUND', 'Video asset not found for this lesson')
        }

        if (message === 'VIDEO_ASSET_NOT_IN_LESSON') {
            return errorResponse(
                400,
                'VIDEO_ASSET_NOT_IN_LESSON',
                'The selected video asset does not belong to the specified lesson',
                details
            )
        }

        if (message === 'VIDEO_ASSET_SELECTION_REQUIRED') {
            return errorResponse(
                400,
                'VIDEO_ASSET_SELECTION_REQUIRED',
                'videoAssetId is required because this lesson has multiple video assets',
                details
            )
        }

        if (message === 'TRANSCRIPT_UPLOAD_FIELDS_REQUIRED') {
            return errorResponse(
                400,
                'TRANSCRIPT_UPLOAD_FIELDS_REQUIRED',
                'videoAssetId and filename are required before generating an upload URL'
            )
        }

        if (message === 'TRANSCRIPT_TRACK_NOT_FOUND') {
            return errorResponse(404, 'TRANSCRIPT_TRACK_NOT_FOUND', 'Transcript track not found')
        }

        if (message === 'NO_PROCESSING_ACTIONS') {
            return errorResponse(400, 'NO_PROCESSING_ACTIONS', 'Select at least one processing action')
        }

        if (message === 'TRANSCRIPT_PROCESS_CONFLICT') {
            return errorResponse(
                409,
                'TRANSCRIPT_PROCESS_CONFLICT',
                'A transcript processing job is already running for this lesson'
            )
        }

        if (message === 'KNOWLEDGE_PROCESS_CONFLICT') {
            return errorResponse(
                409,
                'KNOWLEDGE_PROCESS_CONFLICT',
                'A knowledge processing job is already running for this lesson'
            )
        }

        if (message.startsWith('INVALID_INVITATION_USERS:')) {
            const invalidIds = message.replace('INVALID_INVITATION_USERS:', '').split(',').filter(Boolean)
            return errorResponse(
                400,
                'INVALID_INVITATION_USERS',
                'Some selected users are invalid or inactive',
                invalidIds
            )
        }

        if (message.startsWith('INVALID_COURSE_INVITATION_USERS:')) {
            const invalidIds = message.replace('INVALID_COURSE_INVITATION_USERS:', '').split(',').filter(Boolean)
            return errorResponse(
                400,
                'INVALID_COURSE_INVITATION_USERS',
                'Some selected users are invalid or inactive for course invitations',
                invalidIds
            )
        }
    }

    return errorResponse(500, 'SME_MCP_TOOL_FAILED', 'Failed to execute SME MCP tool')
}

const extractErrorDetails = (error: unknown) => {
    if (error && typeof error === 'object' && 'details' in error) {
        return (error as { details?: unknown }).details
    }

    return undefined
}

const normalizeToolPayload = (
    body: unknown,
    options?: {
        allowedTools?: string[]
    }
) => {
    if (!body || typeof body !== 'object') {
        throw new SmeMcpError('VALIDATION_ERROR', 'Invalid SME MCP payload', 400, [
            {
                path: ['body'],
                message: 'Expected an object payload',
            },
        ])
    }

    const rawTool = 'tool' in body && typeof body.tool === 'string' ? body.tool : null

    if (rawTool && deprecatedSmeMcpToolNames.includes(rawTool as (typeof deprecatedSmeMcpToolNames)[number])) {
        throw new SmeMcpError(
            'MCP_TOOL_DEPRECATED',
            `SME MCP v2 removed "${rawTool}" from the MCP tool surface. Use the UI for detailed course and exam editing.`,
            400
        )
    }

    if (!rawTool || !activeSmeMcpToolNames.includes(rawTool as (typeof activeSmeMcpToolNames)[number])) {
        throw new SmeMcpError('MCP_TOOL_UNKNOWN', 'Unsupported SME MCP tool', 400)
    }

    if (options?.allowedTools && !options.allowedTools.includes(rawTool)) {
        throw new SmeMcpError(
            'MCP_TOOL_UNAVAILABLE',
            'This tool is not exposed on the standard MCP server in the current environment',
            403
        )
    }

    const input = 'input' in body ? body.input : undefined

    return {
        tool: rawTool as (typeof activeSmeMcpToolNames)[number],
        input,
    }
}

const errorResponse = (status: number, code: string, message: string, details?: unknown) => ({
    status,
    body: {
        success: false,
        error: {
            code,
            message,
            ...(details === undefined ? {} : { details }),
        },
    },
})
