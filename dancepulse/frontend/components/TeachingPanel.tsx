"use client";

import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { Segment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface TeachingPanelProps {
  segment: Segment;
  regenerating?: boolean;
  onRegenerate?: () => void;
  className?: string;
}

export function TeachingPanel({
  segment,
  regenerating = false,
  onRegenerate,
  className,
}: TeachingPanelProps) {
  const teaching = segment.teaching;
  const title = teaching?.summary || segment.ai_description || "动作摘要待生成";
  const statusLabel =
    teaching?.status === "ready"
      ? "已生成"
      : teaching?.status === "failed"
        ? "失败"
        : "生成中";

  return (
    <aside
      className={cn(
        "rounded-[24px] border border-white/40 glass-panel-strong p-5 shadow-[0_20px_48px_rgba(44,24,18,0.1)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            <Badge variant="brand">AI 教学</Badge>
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {segment.section_label} · 第 {segment.index + 1} 张卡片 · {segment.beat_count} 拍
          </p>
        </div>

        {onRegenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
          >
            <RefreshCw className="h-4 w-4" />
            {regenerating ? "请求中..." : "重生成"}
          </Button>
        )}
      </div>

      {segment.is_still ? (
        <div className="mt-5 rounded-2xl border border-dashed border-black/10 px-4 py-5 text-sm text-[var(--muted)] dark:border-white/10">
          这是静止或过渡片段，建议结合上下两个主动作一起练习。
        </div>
      ) : teaching?.status === "failed" ? (
        <div className="mt-5 rounded-2xl bg-red-500/8 px-4 py-5 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            教学生成失败
          </div>
          <p className="mt-2 leading-6">
            可以点击上方按钮重试，或者先按缩略图和节拍自行学习。
          </p>
        </div>
      ) : teaching?.status === "pending" ? (
        <div className="mt-5 rounded-2xl border border-dashed border-black/10 px-4 py-5 dark:border-white/10">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            教学内容生成中
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-black/8 dark:bg-white/10" />
            <div className="h-16 animate-pulse rounded-2xl bg-black/6 dark:bg-white/6" />
            <div className="h-16 animate-pulse rounded-2xl bg-black/6 dark:bg-white/6" />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white">
              <Sparkles className="h-4 w-4 text-brand-500" />
              分步要点
            </div>
            <div className="mt-3 space-y-3">
              {teaching?.steps?.map((step, index) => (
                <div
                  key={`${step.beats}-${index}`}
                  className="rounded-2xl bg-white/75 px-4 py-3 dark:bg-white/5"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-brand/12 px-2.5 py-1 text-xs font-mono text-brand-700 dark:text-brand-light">
                      {step.beats}
                    </div>
                    <div className="text-sm leading-6 text-[var(--muted)]">
                      {step.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium text-neutral-900 dark:text-white">
              练习提示
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {teaching?.tips?.map((tip, index) => (
                <li key={`${tip}-${index}`} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}
