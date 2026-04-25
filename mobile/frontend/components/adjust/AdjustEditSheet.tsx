"use client";

import * as React from "react";
import { Play, Scissors, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { BeatStepper } from "@/components/adjust/BeatStepper";
import type { Segment } from "@/lib/types";

export function AdjustEditSheet({
  open,
  onClose,
  segment,
  canMergePrev,
  canMergeNext,
  canStartMinus,
  canStartPlus,
  canEndMinus,
  canEndPlus,
  onStartMinus,
  onStartPlus,
  onEndMinus,
  onEndPlus,
  onMergePrev,
  onMergeNext,
  onSplitMiddle,
  onDelete,
  onPreview,
}: {
  open: boolean;
  onClose: () => void;
  segment: Segment | null;
  canMergePrev: boolean;
  canMergeNext: boolean;
  canStartMinus: boolean;
  canStartPlus: boolean;
  canEndMinus: boolean;
  canEndPlus: boolean;
  onStartMinus: () => void;
  onStartPlus: () => void;
  onEndMinus: () => void;
  onEndPlus: () => void;
  onMergePrev: () => void;
  onMergeNext: () => void;
  onSplitMiddle: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="bottom"
      title=""
      className="mx-auto w-full max-w-[430px] rounded-t-[28px] border-x border-t border-white/8 bg-bg-surface"
    >
      <div className="mx-auto mb-4 h-2 w-20 rounded-full bg-white/12" />

      {segment ? (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[22px] font-semibold text-white">
                  段落 {String(segment.index + 1).padStart(2, "0")}
                </h2>
                {segment.user_edited && (
                  <span className="rounded-full bg-state-warn/22 px-3 py-1 text-[12px] font-medium text-[#F7C25B]">
                    已改
                  </span>
                )}
              </div>
              <p className="mt-2 text-[15px] text-white/45">
                {segment.section_label} · 难度 {"★".repeat(segment.difficulty)}
              </p>
            </div>

            <button
              type="button"
              onClick={onPreview}
              className="flex items-center gap-2 rounded-full border border-brand-light/30 bg-brand/10 px-4 py-3 text-[15px] font-medium text-brand-light"
            >
              <Play className="h-4 w-4 fill-current" />
              预览
            </button>
          </div>

          <BeatStepper
            label="起点"
            value={segment.start.toFixed(2)}
            canStepMinus={canStartMinus}
            canStepPlus={canStartPlus}
            onMinus={onStartMinus}
            onPlus={onStartPlus}
          />

          <BeatStepper
            label="终点"
            value={segment.end.toFixed(2)}
            canStepMinus={canEndMinus}
            canStepPlus={canEndPlus}
            onMinus={onEndMinus}
            onPlus={onEndPlus}
          />

          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="时长" value={`${segment.duration.toFixed(2)}s`} />
            <MetricCard label="拍数" value={`${segment.beat_count}`} />
            <MetricCard label="难度" value={"★".repeat(segment.difficulty)} accent />
          </div>

          <div>
            <div className="mb-3 text-[15px] text-white/45">更多操作</div>
            <div className="grid grid-cols-2 gap-3">
              <ActionButton disabled={!canMergePrev} onClick={onMergePrev}>
                ← 合并上一段
              </ActionButton>
              <ActionButton disabled={!canMergeNext} onClick={onMergeNext}>
                → 合并下一段
              </ActionButton>
              <ActionButton onClick={onSplitMiddle}>
                <Scissors className="h-4 w-4" />
                从中间拆分
              </ActionButton>
              <ActionButton destructive onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                删除段落
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[20px] bg-bg-root px-4 py-4 text-center">
      <div className="text-[14px] text-white/40">{label}</div>
      <div className={["mt-3 text-[18px] font-semibold", accent ? "text-[#FFC83D]" : "text-white"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  destructive = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex items-center justify-center gap-2 rounded-[18px] border px-4 py-4 text-[15px] transition disabled:cursor-not-allowed disabled:opacity-35",
        destructive
          ? "border-red-400/30 bg-red-500/10 text-red-200"
          : "border-white/8 bg-white/[0.04] text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
