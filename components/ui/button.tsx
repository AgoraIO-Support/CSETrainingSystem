import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]",
    {
        variants: {
            variant: {
                default:
                    "bg-[linear-gradient(135deg,#006688_0%,#00c2ff_100%)] text-white shadow-lg shadow-[#006688]/20 hover:translate-y-[-1px] hover:shadow-xl hover:shadow-[#006688]/20",
                destructive:
                    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
                outline:
                    "border border-slate-200/80 bg-white text-foreground shadow-sm hover:border-[#006688]/20 hover:bg-slate-50",
                secondary:
                    "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ghost: "text-muted-foreground hover:bg-slate-100 hover:text-[#006688]",
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                default: "h-11 px-5 py-2.5",
                sm: "h-9 rounded-lg px-3.5",
                lg: "h-12 rounded-xl px-8",
                icon: "h-11 w-11",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
