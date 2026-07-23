"use client";

import * as React from "react";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { Segment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeachingPanelKpopProps {
  segment: Segment;
  regenerating?: boolean;
  onRegenerate?: () => void;
  className?: string;
  currentBeat?: number;
  autoScrollSteps?: boolean;
}

export function parseBeatsRange(raw: string): [number, number] | null {
  if (!raw) return null;
  const m = raw.match(/(\d+)\s*[-~到至]\s*(\d+)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return [Math.min(a, b), Math.max(a, b)];
  }
  const single = raw.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return [n, n];
  }
  return null;
}

export function TeachingPanelKpop({
  segment,
  regenerating = false,
  onRegenerate,
  className,
  currentBeat,
  autoScrollSteps = false,
}: TeachingPanelKpopProps) {
  const teaching = segment.teaching;
  const title = teaching?.summary || segment.ai_description || "动作摘要待生成";
  const statusLabel =
    teaching?.status === "ready"
      ? "已生成"
      : teaching?.status === "failed"
        ? "失败"
        : "生成中";

  const stepRanges = React.useMemo(() => {
    return (teaching?.steps ?? []).map((step) => parseBeatsRange(step.beats));
  }, [teaching]);

  const activeStepIdx = React.useMemo(() => {
    if (typeof currentBeat !== "number" || !stepRanges.length) return -1;
    return stepRanges.findIndex(
      (r) => r !== null && currentBeat >= r[0] && currentBeat <= r[1]
    );
  }, [currentBeat, stepRanges]);

  const stepsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const stepRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  React.useEffect(() => {
    if (!autoScrollSteps || activeStepIdx < 0) return;
    const container = stepsContainerRef.current;
    const stepEl = stepRefs.current[activeStepIdx];
    if (!container || !stepEl) return;
    const containerRect = container.getBoundingClientRect();
    const stepRect = stepEl.getBoundingClientRect();
    const offsetWithin = stepRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, offsetWithin - 12), behavior: "smooth" });
  }, [activeStepIdx, autoScrollSteps]);

  return (
    <aside
      className={cn(
        "rounded-[20px] border border-white/10 bg-black/40 p-5 backdrop-blur-md shadow-[0_20px_48px_rgba(0,0,0,0.45)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
            <span className="rounded-full border border-[#ccff00]/40 bg-[#ccff00]/15 px-2 py-0.5 font-bold text-[#ccff00]">
              AI 教学
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/60">
              {statusLabel}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-black uppercase tracking-tight text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">
            {segment.section_label} · 第 {segment.index + 1} 张 · {segment.beat_count} 拍
          </p>
        </div>

        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition",
              "border-[#ff0055]/60 bg-[#ff0055]/10 text-[#ff0055] hover:bg-[#ff0055]/20",
              regenerating && "cursor-not-allowed opacity-60"
            )}
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {regenerating ? "请求中..." : "重生成"}
          </button>
        ) : null}
      </div>

      {segment.is_still ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-4 py-5 text-sm text-white/55">
          这是静止或过渡片段，建议结合上下两个主动作一起练习。
        </div>
      ) : teaching?.status === "failed" ? (
        <div className="mt-5 rounded-2xl border border-[#ff0055]/30 bg-[#ff0055]/10 px-4 py-5 text-sm text-[#ff0055]">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-4 w-4" />
            教学生成失败
          </div>
          <p className="mt-2 leading-6 text-[#ff0055]/85">
            可以点击右上角重新生成，或者先按缩略图和节拍自行学习。
          </p>
        </div>
      ) : teaching?.status === "pending" ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-4 py-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Loader2 className="h-4 w-4 animate-spin text-[#00f3ff]" />
            教学内容生成中
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/8" />
            <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
            <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles className="h-4 w-4 text-[#00f3ff]" />
              分步要点
            </div>
            <div
              ref={stepsContainerRef}
              className={cn(
                "mt-3 space-y-3",
                autoScrollSteps && "max-h-[40vh] overflow-y-auto pr-1"
              )}
            >
              {teaching?.steps?.map((step, index) => {
                const isActive = autoScrollSteps && index === activeStepIdx;
                return (
                  <div
                    key={`${step.beats}-${index}`}
                    ref={(el) => {
                      stepRefs.current[index] = el;
                    }}
                    className={cn(
                      "rounded-2xl border px-4 py-3 transition-all duration-300",
                      isActive
                        ? "border-[#ccff00]/70 bg-[#ccff00]/[0.08] shadow-[0_0_24px_rgba(204,255,0,0.18)]"
                        : "border-[#00f3ff]/20 bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "rounded-full border px-2.5 py-1 font-mono text-xs font-bold transition-colors",
                          isActive
                            ? "border-[#ccff00] bg-[#ccff00] text-[#050505]"
                            : "border-[#ccff00]/40 bg-[#ccff00]/15 text-[#ccff00]"
                        )}
                      >
                        {step.beats}
                      </div>
                      <div
                        className={cn(
                          "text-sm leading-6 transition-colors",
                          isActive ? "text-white" : "text-white/75"
                        )}
                      >
                        {step.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-bold text-white">练习提示</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
              {teaching?.tips?.map((tip, index) => (
                <li key={`${tip}-${index}`} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff0055]" />
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
