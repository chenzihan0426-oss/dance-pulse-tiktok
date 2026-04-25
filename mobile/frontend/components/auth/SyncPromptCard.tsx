"use client";

import * as React from "react";
import Link from "next/link";
import { Cloud, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "dp_sync_prompt_dismissed";

export function SyncPromptCard() {
  const [dismissed, setDismissed] = React.useState(false);

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
    <section className="mt-8 overflow-hidden rounded-[28px] border border-brand/20 bg-[linear-gradient(135deg,rgba(168,85,247,0.16)_0%,rgba(30,18,51,1)_100%)] px-5 py-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/16 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-brand-light">
            <Cloud className="h-3.5 w-3.5" />
            Sync
          </div>
          <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-white">
            登录后跨设备同步学习进度
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-white/55">
            你的连续学习、已学动作、徽章和课程收藏都会跟着账号走，换设备也能接着练。
          </p>
        </div>

        <div className="flex items-start gap-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/14 text-brand-light">
            <ShieldCheck className="h-5 w-5" />
          </div>
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

      <div className="mt-5 flex gap-3">
        <Link href="/auth/login" className="flex-1">
          <Button variant="primary" className="h-11 w-full rounded-[16px] text-[14px]">
            立即登录
          </Button>
        </Link>
        <Link href="/auth/signup" className="flex-1">
          <Button variant="secondary" className="h-11 w-full rounded-[16px] text-[14px]">
            创建账号
          </Button>
        </Link>
      </div>
    </section>
  );
}
