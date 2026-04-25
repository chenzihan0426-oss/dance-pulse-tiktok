"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "bottom" | "right";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Sheet({
  open,
  onOpenChange,
  side = "bottom",
  title,
  children,
  className,
}: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex"
      style={
        side === "bottom"
          ? { alignItems: "flex-end", justifyContent: "stretch" }
          : { alignItems: "stretch", justifyContent: "flex-end" }
      }
    >
      <button
        aria-label="关闭"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative z-10 flex w-full flex-col bg-[var(--surface-strong)] shadow-[0_-18px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl",
          side === "bottom" && "max-h-[85vh] rounded-t-[28px] border-t border-white/10",
          side === "right" && "h-full max-w-md border-l border-white/10",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <button
            className="rounded-md p-1 text-[var(--muted)] hover:bg-white/5"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
