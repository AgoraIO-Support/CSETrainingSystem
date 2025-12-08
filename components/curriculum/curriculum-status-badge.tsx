'use client'

import { Badge } from '@/components/ui/badge'
import type { CurriculumStatus } from '@/types'

export function CurriculumStatusBadge({ status }: { status: CurriculumStatus }) {
    const tone =
        status === 'PUBLISHED'
            ? 'success'
            : status === 'DRAFT'
              ? 'secondary'
              : 'outline'

    return (
        <Badge variant={tone as any}>
            {status === 'PUBLISHED' ? 'Published' : status === 'DRAFT' ? 'Draft' : 'Deprecated'}
        </Badge>
    )
}
