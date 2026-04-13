'use client'

import Link from 'next/link'
import { BarChart3, Edit, Eye, FileQuestion, Send, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ExamManagementActionsProps {
    openHref?: string
    openTitle?: string
    questionsHref: string
    invitationsHref: string
    attemptsHref: string
    analyticsHref: string
    editHref: string
    onDelete: () => void
}

export function ExamManagementActions({
    openHref,
    openTitle = 'Open Exam',
    questionsHref,
    invitationsHref,
    attemptsHref,
    analyticsHref,
    editHref,
    onDelete,
}: ExamManagementActionsProps) {
    return (
        <div className="flex items-center gap-1">
            {openHref ? (
                <Link href={openHref}>
                    <Button variant="ghost" size="icon" title={openTitle}>
                        <Eye className="h-4 w-4" />
                    </Button>
                </Link>
            ) : null}
            <Link href={questionsHref}>
                <Button variant="ghost" size="icon" title="Manage Questions">
                    <FileQuestion className="h-4 w-4" />
                </Button>
            </Link>
            <Link href={invitationsHref}>
                <Button variant="ghost" size="icon" title="Manage Invitations">
                    <Send className="h-4 w-4" />
                </Button>
            </Link>
            <Link href={attemptsHref}>
                <Button variant="ghost" size="icon" title="View Attempts">
                    <Users className="h-4 w-4" />
                </Button>
            </Link>
            <Link href={analyticsHref}>
                <Button variant="ghost" size="icon" title="View Analytics">
                    <BarChart3 className="h-4 w-4" />
                </Button>
            </Link>
            <Link href={editHref}>
                <Button variant="ghost" size="icon" title="Edit Exam">
                    <Edit className="h-4 w-4" />
                </Button>
            </Link>
            <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:text-red-600"
                onClick={onDelete}
                title="Delete Exam"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    )
}
