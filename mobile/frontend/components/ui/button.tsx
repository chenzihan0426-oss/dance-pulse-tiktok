"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "border border-brand/30 bg-[linear-gradient(135deg,#6366F1_0%,#A855F7_42%,#EC4899_100%)] text-white shadow-[0_10px_28px_rgba(168,85,247,0.34)] hover:brightness-110 active:brightness-95",
  secondary:
    "border border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10",
  ghost:
    "bg-transparent text-[var(--muted)] hover:bg-white/5 hover:text-white",
  outline:
    "border border-brand/30 bg-brand/10 text-brand-light hover:bg-brand/15",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "secondary", size = "md", ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
