'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { ComponentProps, ReactNode } from 'react'

interface BackButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'type'> {
    fallbackHref: string
    ariaLabel?: string
    children?: ReactNode
}

/** Returns to the actual navigation source, with a stable destination for direct visits. */
export function BackButton({
    fallbackHref,
    ariaLabel = 'Back to previous page',
    variant = 'ghost',
    size = 'icon',
    className,
    children,
    ...buttonProps
}: BackButtonProps) {
    const router = useRouter()

    const handleBack = () => {
        if (window.history.length > 1) {
            router.back()
            return
        }

        router.replace(fallbackHref)
    }

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            className={className}
            onClick={handleBack}
            aria-label={ariaLabel}
            title={ariaLabel}
            {...buttonProps}
        >
            <ArrowLeft className={children ? 'mr-2 h-4 w-4' : 'h-4 w-4'} />
            {children}
        </Button>
    )
}
