import React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import type { Lesson, Segment } from "@/lib/types";
import { SegmentListRow } from "@/components/adjust/SegmentListRow";
import { Button } from "@/components/ui/button";

export function AdjustOverview({
  lesson,
  segments,
  previewSegment,
  dirtySegmentIds,
  pendingCount,
  hintVisible,
  onDismissHint,
  onSelect,
  onUndo,
  onCommit,
  onRegenerate,
  commitState,
  commitError,
}: {
  lesson: Lesson;
  segments: Segment[];
  previewSegment: Segment | null;
  dirtySegmentIds: Set<string>;
  pendingCount: number;
  hintVisible: boolean;
  onDismissHint: () => void;
  onSelect: (segmentId: string) => void;
  onUndo: () => void;
  onCommit: () => void;
  onRegenerate: () => void;
  commitState: "idle" | "committing" | "error";
  commitError: string | null;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-8 text-white">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/lesson/${lesson.id}`}
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-white/92"
          aria-label="返回课程页"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>

        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-white">调整分段</h1>
          <p className="mt-2 text-[15px] text-white/45">{lesson.title}</p>
        </div>

        <button
          type="button"
          onClick={onUndo}
          disabled={pendingCount === 0 || commitState === "committing"}
          className="mt-2 text-[16px] text-white/45 transition disabled:opacity-35"
        >
          撤销
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] bg-bg-raised">
        <div className="aspect-video bg-[linear-gradient(135deg,#3A1F4A_0%,#24102D_100%)]">
          <video
            key={previewSegment?.id ?? lesson.video_url}
            src={previewSegment?.clip_url ?? lesson.video_url}
            poster={previewSegment?.thumbnail ?? lesson.thumbnail}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      {hintVisible && (
        <div className="mt-6 rounded-[24px] border border-brand-light/25 bg-brand/10 px-4 py-4 text-[15px] leading-7 text-white/82">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <AlertCircle className="mt-1 h-5 w-5 text-brand-light" />
              <p>点段落查看细节。觉得整个切得不对？底部“重新切分”换拍数。</p>
            </div>
            <button
              type="button"
              onClick={onDismissHint}
              className="text-white/45 transition hover:text-white"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <div className="text-[16px] text-white">
          {segments.length} 个段落
        </div>
        <div className="flex items-center gap-2 text-[14px] text-white/45">
          <span className="h-3 w-3 rounded-full bg-state-warn" />
          已修改 {dirtySegmentIds.size}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {segments.map((segment, index) => (
          <SegmentListRow
            key={segment.id}
            index={index}
            segment={segment}
            dirty={dirtySegmentIds.has(segment.id)}
            onClick={() => onSelect(segment.id)}
          />
        ))}
      </div>

      {commitState === "error" && commitError && (
        <div className="mt-5 rounded-[20px] border border-state-danger/20 bg-state-danger/10 px-4 py-4 text-sm text-red-200">
          保存失败：{commitError}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-white/8 bg-[#0d0b17]/95 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-4 backdrop-blur-sm">
        <div className="grid grid-cols-[1fr_1.6fr] gap-4">
          <Button
            variant="secondary"
            className="h-14 rounded-[18px]"
            onClick={onRegenerate}
            disabled={commitState === "committing"}
          >
            <RotateCcw className="h-4 w-4" />
            重新切分
          </Button>
          <Button
            variant="primary"
            className="h-14 rounded-[18px]"
            onClick={onCommit}
            disabled={commitState === "committing"}
          >
            {pendingCount > 0 ? `保存 (${pendingCount})` : "完成"}
          </Button>
        </div>
      </div>
    </main>
  );
}
