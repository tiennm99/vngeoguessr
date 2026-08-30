import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// The default variant is the brand fill. Every real call site was reapplying
// brand colour and a min-height by hand, so the variant system now carries both
// and the overrides are gone. Sizes start at 44px because that is the touch
// target this app needs; nothing should have to patch that in again.
//
// The focus ring is opaque on purpose. At any alpha it measures under WCAG
// 1.4.11's 3:1 floor against the page, however dark the ring colour gets.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight " +
    "transition-[background-color,box-shadow,color,border-color] duration-150 ease-out " +
    "disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:border-transparent " +
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none " +
    "focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "motion-safe:active:scale-[0.98] " +
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover hover:shadow-md active:bg-[var(--brand-active)]",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive",
        outline:
          "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/70 dark:bg-input/20 dark:border-input",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-secondary/70",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/70 dark:hover:bg-accent/50",
        link: "text-brand underline-offset-4 hover:underline shadow-none",
      },
      size: {
        // 44px: the floor for a touch target, so this is the default rather
        // than something call sites opt into.
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        // 36px. Dense desktop rows only; never the sole tap target on a screen.
        sm: "h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        // 48px, reserved for the one dominant action on a screen.
        lg: "h-12 rounded-lg px-6 text-base has-[>svg]:px-5",
        icon: "size-11 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}) {
  const Comp = asChild ? Slot : "button"

  // asChild renders someone else's element, which must receive exactly one
  // child, so the spinner is only for real buttons.
  const showSpinner = loading && !asChild

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}>
      {showSpinner ? (
        <>
          <span
            className="size-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden="true"
          />
          {children}
        </>
      ) : (
        // Slot accepts exactly one child, and a bare `false` from a short
        // circuit counts as a second one -- so asChild must get children alone.
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants }
