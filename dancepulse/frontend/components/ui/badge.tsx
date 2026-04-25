"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "brand" | "outline" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variant === "default" &&
          "border-white/10 bg-white/5 text-neutral-200",
        variant === "brand" && "border-brand/30 bg-brand/10 text-brand-light",
        variant === "outline" &&
          "border-white/10 bg-white/5 text-neutral-200",
        variant === "warn" &&
          "border-amber-400/20 bg-amber-500/10 text-amber-200",
        className
      )}
      {...props}
    />
  );
}
