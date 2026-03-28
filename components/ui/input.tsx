import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm ring-offset-background transition-all placeholder:text-muted-foreground/90 focus-visible:border-[#00c2ff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00c2ff]/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
