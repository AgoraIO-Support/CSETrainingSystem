'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ApiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Bot, Send, Sparkles, User, Play } from 'lucide-react'
import { MessageSources, type MessageSource } from './message-sources'

/**
 * Parse timestamp links in AI response content
 * Format: [Click to jump to video HH:MM:SS for details]
 * Also handles: [HH:MM:SS] simple format
 */
function parseTimestampLinks(
    content: string,
    onTimestampClick?: (timestamp: string) => void
): React.ReactNode[] {
    // Match both formats:
    // 1. [Click to jump to video HH:MM:SS for details]
    // 2. [HH:MM:SS] simple format
    const timestampPattern = /\[(?:Click to jump to video\s+)?(\d{2}:\d{2}:\d{2})(?:\s+for details)?\]/g

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match

    while ((match = timestampPattern.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index))
        }

        const timestamp = match[1]
        const key = `ts-${match.index}-${timestamp}`

        // Add clickable timestamp button
        parts.push(
            <button
                key={key}
                onClick={() => onTimestampClick?.(timestamp)}
                className="mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#e8f8ff] px-2 py-0.5 text-xs font-medium text-[#006688] transition-colors hover:bg-[#d6f3ff]"
                title={`Jump to ${timestamp}`}
            >
                <Play className="h-3 w-3" />
                {timestamp}
            </button>
        )

        lastIndex = match.index + match[0].length
    }

    // Add remaining text after last match
    if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex))
    }

    // If no timestamps found, return original content
    if (parts.length === 0) {
        return [content]
    }

    return parts
}

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    sources?: MessageSource[]
}

interface AIChatPanelProps {
    courseId?: string
    lessonId?: string
    lessonTitle?: string
    currentTime?: number
    onSeekToTimestamp?: (timestamp: string) => void
    className?: string
    headerActions?: ReactNode
}

const promptSuggestions = [
    "Explain this concept in simple terms",
    "What are the key takeaways?",
    "Show me a code example",
    "Can you quiz me on this topic?",
]

const introMessage: Message = {
    id: 'intro',
    role: 'assistant',
    content: "👋 Hi! I'm your AI learning assistant. Ask me anything about this lesson and I'll help explain it.",
    timestamp: new Date(),
}

const mapServerMessage = (message: any): Message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.createdAt ?? Date.now()),
    sources: message.context?.sources || undefined,
})

export function AIChatPanel({
    courseId,
    lessonId,
    lessonTitle,
    currentTime = 0,
    onSeekToTimestamp,
    className,
    headerActions,
}: AIChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([introMessage])
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [isAssistantTyping, setIsAssistantTyping] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([])
    const [knowledgeLoading, setKnowledgeLoading] = useState(false)
    const [knowledgeReady, setKnowledgeReady] = useState(true)
    const [knowledgeError, setKnowledgeError] = useState<string | null>(null)
    const [showFollowUpSuggestions, setShowFollowUpSuggestions] = useState(true)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const knowledgeRetryCountRef = useRef(0)
    const knowledgeRetryTimerRef = useRef<number | null>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        let cancelled = false
        const bootstrap = async () => {
            setLoading(true)
            setError(null)
            try {
                const conversationRes: any = await ApiClient.createConversation({ courseId, lessonId })
                if (cancelled) return
                const convo = conversationRes.data.conversation
                setConversationId(convo.id)

                const messageRes: any = await ApiClient.getConversationMessages(convo.id)
                if (cancelled) return

                const fetched = (messageRes.data || []).map(mapServerMessage)
                setMessages(fetched.length ? fetched : [introMessage])
                setFollowUpSuggestions([])
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load assistant')
                    setMessages([introMessage])
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        bootstrap()
        return () => {
            cancelled = true
        }
    }, [courseId, lessonId])

    // Gate chat on knowledge readiness: we do not want to fall back to RAG.
    // Readiness signal: anchors endpoint returns at least 1 anchor.
    useEffect(() => {
        let cancelled = false

        const checkKnowledgeReady = async () => {
            if (!lessonId) {
                setKnowledgeReady(true)
                setKnowledgeError(null)
                setKnowledgeLoading(false)
                return
            }

            setKnowledgeLoading(true)
            setKnowledgeError(null)
            try {
                // ApiClient already prefixes `/api`, so do not include `/api` here.
                const response: any = await ApiClient.request(`/lessons/${lessonId}/anchors`)
                if (!response?.success) {
                    throw new Error(response?.error?.message ?? 'Failed to load lesson knowledge')
                }

                const anchors = response?.data?.anchors
                const count = Array.isArray(anchors) ? anchors.length : 0
                if (cancelled) return
                setKnowledgeReady(count >= 1)

                const status = response?.data?.status as string | undefined
                const shouldRetry =
                    count < 1 &&
                    (status === 'PROCESSING' || status === 'PENDING' || status === 'MISSING' || status == null)

                if (shouldRetry && knowledgeRetryCountRef.current < 24 && !cancelled) {
                    knowledgeRetryCountRef.current += 1
                    if (knowledgeRetryTimerRef.current) {
                        window.clearTimeout(knowledgeRetryTimerRef.current)
                    }
                    knowledgeRetryTimerRef.current = window.setTimeout(checkKnowledgeReady, 5000)
                }
            } catch (err) {
                if (!cancelled) {
                    setKnowledgeReady(false)
                    setKnowledgeError(
                        err instanceof Error ? err.message : 'Failed to load lesson knowledge'
                    )
                }
            } finally {
                if (!cancelled) {
                    setKnowledgeLoading(false)
                }
            }
        }

        knowledgeRetryCountRef.current = 0
        checkKnowledgeReady()
        return () => {
            cancelled = true
            if (knowledgeRetryTimerRef.current) {
                window.clearTimeout(knowledgeRetryTimerRef.current)
                knowledgeRetryTimerRef.current = null
            }
        }
    }, [lessonId])

    const handleSend = async () => {
        if (!input.trim() || !conversationId) return
        if (!knowledgeReady) return

        const userContent = input.trim()
        setInput('')

        const tempId = `temp-${Date.now()}`
        const optimistic: Message = {
            id: tempId,
            role: 'user',
            content: userContent,
            timestamp: new Date(),
        }

        setMessages(prev => {
            const withoutIntro = prev[0]?.id === introMessage.id ? [] : prev
            return [...withoutIntro, optimistic]
        })
        setIsAssistantTyping(true)
        setError(null)

        try {
            const response: any = await ApiClient.sendAIMessage(conversationId, {
                message: userContent,
                videoTimestamp: Math.floor(currentTime),
                context: {
                    lessonTitle,
                },
            })

            const userMessage = mapServerMessage(response.data.userMessage)
            const assistantMessage = mapServerMessage(response.data.assistantMessage)

            // Add sources from response to assistant message if available
            if (response.data.sources && Array.isArray(response.data.sources)) {
                assistantMessage.sources = response.data.sources
            }

            setMessages(prev => {
                return prev
                    .filter(msg => msg.id !== introMessage.id)
                    .map(msg => (msg.id === tempId ? userMessage : msg))
                    .concat(assistantMessage)
            })

            const suggestions = Array.isArray(response.data.suggestions)
                ? response.data.suggestions.filter((s: string) => typeof s === 'string' && s.trim().length > 0)
                : []
            setFollowUpSuggestions(suggestions)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message')
            setMessages(prev => prev.filter(msg => msg.id !== tempId))
        } finally {
            setIsAssistantTyping(false)
        }
    }

    const handleSuggestionClick = (suggestion: string) => {
        setInput(suggestion)
    }

    const showSuggestions = messages.length === 1 && messages[0].id === introMessage.id
    const chatDisabled = loading || knowledgeLoading || !knowledgeReady

    return (
        <Card className={cn("h-full min-h-0 flex flex-col overflow-hidden border border-slate-200 bg-white shadow-none", className)}>
            <CardHeader className="border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#006688]">
                            <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <CardTitle className="text-base leading-none text-slate-950">AI Assistant</CardTitle>
                            <p className="mt-1 truncate text-[11px] text-slate-500">
                                {lessonTitle ? `Context: ${lessonTitle}` : 'Understanding video context'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex items-center space-x-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                            <Sparkles className="h-3 w-3" />
                            <span>
                                {loading ? 'Connecting' : knowledgeLoading ? 'Checking' : knowledgeReady ? 'Online' : 'Preparing'}
                            </span>
                        </Badge>
                        {headerActions}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 flex flex-col p-0">
                <div className="flex-1 min-h-0 space-y-4 overflow-y-auto bg-slate-50/40 p-4">
                    {!loading && !knowledgeLoading && !knowledgeReady && (
                        <Alert>
                            <AlertDescription>
                                {knowledgeError ?? 'Knowledge Context is not ready for this lesson. Ask an admin to run "Upload and Process" before using the AI assistant.'}
                            </AlertDescription>
                        </Alert>
                    )}

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {messages.map(message => (
                        <div
                            key={message.id}
                            className={cn(
                                "flex items-start space-x-3",
                                message.role === 'user' && "flex-row-reverse space-x-reverse"
                            )}
                        >
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className={cn(
                                    message.role === 'assistant'
                                        ? 'bg-[#006688] text-white'
                                        : 'bg-slate-900 text-white'
                                )}>
                                    {message.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                </AvatarFallback>
                            </Avatar>
                            <div
                                className={cn(
                                    "max-w-[80%] rounded-2xl border p-3 shadow-sm",
                                    message.role === 'assistant'
                                        ? "border-slate-200 bg-white text-slate-800"
                                        : "border-[#006688] bg-[#006688] text-white"
                                )}
                            >
                                <p className="text-sm whitespace-pre-line">
                                    {message.role === 'assistant'
                                        ? parseTimestampLinks(message.content, onSeekToTimestamp)
                                        : message.content
                                    }
                                </p>

                                {/* Show sources for assistant messages with RAG context */}
                                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                                    <MessageSources
                                        sources={message.sources}
                                        onTimestampClick={onSeekToTimestamp}
                                    />
                                )}
                            </div>
                        </div>
                    ))}

                    {isAssistantTyping && (
                        <div className="flex items-start space-x-3">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-[#006688] text-white">
                                    <Bot className="h-4 w-4" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="flex space-x-1">
                                    <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                                    <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100" />
                                    <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {showSuggestions && (
                    <div className="border-t border-slate-200 bg-white p-4">
                        <p className="mb-2 text-xs font-medium text-slate-500">Suggested prompts:</p>
                        <div className="grid grid-cols-2 gap-2">
                            {promptSuggestions.map((suggestion, index) => (
                                <Button
                                    key={`prompt-${index}-${suggestion.substring(0, 10)}`}
                                    variant="outline"
                                    size="sm"
                                    className="h-auto justify-start rounded-xl border-slate-200 bg-slate-50 py-2 text-left text-xs text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {!showSuggestions && followUpSuggestions.length > 0 && (
                    <div className="border-t border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <p className="text-xs font-medium text-slate-500">Follow-up suggestions</p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setShowFollowUpSuggestions((current) => !current)}
                            >
                                {showFollowUpSuggestions ? 'Hide' : 'Show'}
                            </Button>
                        </div>
                        {showFollowUpSuggestions ? (
                            <div className="flex flex-wrap gap-2 px-4 pb-4">
                                {followUpSuggestions.map((suggestion, index) => (
                                    <Button
                                        key={`followup-${index}-${suggestion.substring(0, 15)}`}
                                        variant="outline"
                                        size="sm"
                                        className="h-auto rounded-xl border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:border-[#b8ecff] hover:bg-[#f8fdff] hover:text-[#006688]"
                                        onClick={() => setInput(suggestion)}
                                    >
                                        {suggestion}
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                )}

                <div className="border-t border-slate-200 bg-white p-4">
                    <div className="flex items-center space-x-2">
                        <Input
                            placeholder="Ask anything about this lesson..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            className="flex-1"
                            disabled={chatDisabled}
                        />
                        <Button
                            size="icon"
                            onClick={handleSend}
                            disabled={!input.trim() || chatDisabled || isAssistantTyping}
                            className="flex-shrink-0 bg-[#006688] text-white hover:bg-[#0a7696]"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
