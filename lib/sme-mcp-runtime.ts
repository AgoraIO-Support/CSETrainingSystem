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
    body: unknown
) => {
    const payload = normalizeToolPayload(body)
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

        if (message === 'PROMPT_TEMPLATE_USE_CASE_MISMATCH') {
            return errorResponse(
                400,
                'PROMPT_TEMPLATE_USE_CASE_MISMATCH',
                'Prompt template use case does not match this SME MCP workflow'
            )
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

const normalizeToolPayload = (body: unknown) => {
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
