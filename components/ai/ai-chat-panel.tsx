'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ApiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Bot, Send, Sparkles, User, Mic } from 'lucide-react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

interface AIChatPanelProps {
    courseId?: string
    lessonId?: string
    lessonTitle?: string
    currentTime?: number
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
})

export function AIChatPanel({ courseId, lessonId, lessonTitle, currentTime = 0 }: AIChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([introMessage])
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [isAssistantTyping, setIsAssistantTyping] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)

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

    const handleSend = async () => {
        if (!input.trim() || !conversationId) return

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

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
                            <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">AI Assistant</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                {lessonTitle ? `Context: ${lessonTitle}` : 'Understanding video context'}
                            </p>
                        </div>
                    </div>
                    <Badge variant="secondary" className="flex items-center space-x-1">
                        <Sparkles className="h-3 w-3" />
                        <span>{loading ? 'Connecting' : 'Online'}</span>
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col p-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                                        ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'
                                        : 'bg-primary text-primary-foreground'
                                )}>
                                    {message.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                </AvatarFallback>
                            </Avatar>
                            <div
                                className={cn(
                                    "max-w-[80%] rounded-lg p-3",
                                    message.role === 'assistant'
                                        ? "bg-muted"
                                        : "bg-primary text-primary-foreground"
                                )}
                            >
                                <p className="text-sm whitespace-pre-line">{message.content}</p>
                            </div>
                        </div>
                    ))}

                    {isAssistantTyping && (
                        <div className="flex items-start space-x-3">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white">
                                    <Bot className="h-4 w-4" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="bg-muted rounded-lg p-3">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-100" />
                                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-200" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {showSuggestions && (
                    <div className="border-t p-4">
                        <p className="text-xs text-muted-foreground mb-2">Suggested prompts:</p>
                        <div className="grid grid-cols-2 gap-2">
                            {promptSuggestions.map((suggestion, index) => (
                                <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-auto py-2 text-left justify-start"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {!showSuggestions && followUpSuggestions.length > 0 && (
                    <div className="border-t p-4">
                        <p className="text-xs text-muted-foreground mb-2">Follow-up suggestions:</p>
                        <div className="flex flex-wrap gap-2">
                            {followUpSuggestions.map((suggestion, index) => (
                                <Button
                                    key={`${suggestion}-${index}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-auto py-2 px-3"
                                    onClick={() => setInput(suggestion)}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="border-t p-4">
                    <div className="flex items-center space-x-2">
                        <Input
                            placeholder="Ask anything about this lesson..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            className="flex-1"
                            disabled={loading}
                        />
                        <Button
                            size="icon"
                            variant="outline"
                            className="flex-shrink-0"
                            disabled
                            title="Coming soon"
                        >
                            <Mic className="h-4 w-4" />
                        </Button>
                        <Button
                            size="icon"
                            onClick={handleSend}
                            disabled={!input.trim() || loading || isAssistantTyping}
                            className="flex-shrink-0"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
