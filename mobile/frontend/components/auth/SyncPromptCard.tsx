"use client";

import * as React from "react";
import Link from "next/link";
import { Cloud, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "dp_sync_prompt_dismissed";

type SyncPromptCardProps = {
  variant?: "default" | "compact";
};

export function SyncPromptCard({ variant = "default" }: SyncPromptCardProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const isCompact = variant === "compact";

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "true");
  }, []);

  const handleDismiss = React.useCallback(() => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    }
  }, []);

  if (dismissed) return null;

  return (
    <section
      className={cn(
        "overflow-hidden border border-brand/20 bg-[linear-gradient(135deg,rgba(168,85,247,0.16)_0%,rgba(30,18,51,1)_100%)] text-white",
        isCompact ? "mt-5 rounded-[22px] px-4 py-4" : "mt-8 rounded-[28px] px-5 py-5"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/16 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-light">
            <Cloud className="h-3.5 w-3.5" />
            {isCompact ? "同步" : "Sync"}
          </div>
          <h2
            className={cn(
              "font-semibold tracking-tight text-white",
              isCompact ? "mt-3 text-[16px]" : "mt-4 text-[20px]"
            )}
          >
            {isCompact ? "登录后保留练习进度" : "登录后跨设备同步学习进度"}
          </h2>
          <p
            className={cn(
              "mt-2 leading-6 text-white/55",
              isCompact ? "text-[12px]" : "text-[13px]"
            )}
          >
            {isCompact
              ? "收藏、徽章和已学动作会跟着账号走，换设备也能接着练。"
              : "你的连续学习、已学动作、徽章和课程收藏都会跟着账号走，换设备也能接着练。"}
          </p>
        </div>

        <div className="flex items-start gap-2">
          {!isCompact ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/14 text-brand-light">
              <ShieldCheck className="h-5 w-5" />
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/38 transition hover:bg-white/[0.06] hover:text-white/78"
            aria-label="关闭同步提示"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn("grid grid-cols-2", isCompact ? "mt-4 gap-2" : "mt-5 gap-3")}>
        <Link
          href="/auth/login"
          className={cn(
            "inline-flex items-center justify-center rounded-[16px] border border-brand/30 bg-[linear-gradient(135deg,#6366F1_0%,#A855F7_42%,#EC4899_100%)] font-semibold text-white shadow-[0_10px_28px_rgba(168,85,247,0.34)] transition hover:brightness-110 active:brightness-95",
            isCompact ? "h-10 text-[13px]" : "h-11 text-[14px]"
          )}
        >
          {isCompact ? "登录" : "立即登录"}
        </Link>
        <Link
          href="/auth/signup"
          className={cn(
            "inline-flex items-center justify-center rounded-[16px] border border-white/10 bg-white/5 font-semibold text-neutral-100 transition hover:bg-white/10",
            isCompact ? "h-10 text-[13px]" : "h-11 text-[14px]"
          )}
        >
          创建账号
        </Link>
      </div>
    </section>
  );
}
