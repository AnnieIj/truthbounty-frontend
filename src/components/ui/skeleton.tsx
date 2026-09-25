import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/components/hooks/useReducedMotion"

const skeletonVariants = cva(
  "bg-gradient-to-r from-[#232329] via-[#2a2a32] to-[#232329] bg-[length:200%_100%] rounded-md",
  {
    variants: {
      variant: {
        default: "",
        circular: "rounded-full",
        text: "rounded",
      },
      size: {
        sm: "h-3",
        md: "h-4",
        lg: "h-6",
        xl: "h-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface SkeletonProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof skeletonVariants> {
  width?: string | number
  height?: string | number
}

function Skeleton({
  className,
  variant,
  size,
  width,
  height,
  style,
  ...props
}: SkeletonProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div
      className={cn(
        skeletonVariants({ variant, size }),
        // Only apply the shimmer animation when the user has not requested
        // reduced motion. When they have, a static muted background is used.
        reducedMotion ? "bg-[#232329]" : "animate-shimmer",
        className
      )}
      aria-hidden="true"
      style={{
        width: width ? (typeof width === "number" ? `${width}px` : width) : undefined,
        height: height ? (typeof height === "number" ? `${height}px` : height) : undefined,
        ...style,
      }}
      {...props}
    />
  )
}

// Pre-built skeleton patterns for common use cases
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  )
}

function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
    />
  )
}

function SkeletonButton({ width = 80 }: { width?: number | string }) {
  return (
    <Skeleton
      className="h-9 rounded-lg"
      width={width}
    />
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("bg-[#18181b] rounded-xl p-6 border border-[#232329]", className)}>
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonButton, SkeletonCard }
