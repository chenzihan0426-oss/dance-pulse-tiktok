"use client";

import * as React from "react";
import type { Lesson, Segment } from "@/lib/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { snapToBeat } from "@/lib/snap";
import { fmtTime, t2 } from "@/lib/utils";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  PlayCircle,
  Scissors,
  Trash2,
} from "lucide-react";

interface Props {
  segment: Segment | null;
  lesson: Lesson;
  workingSegments: Segment[];
  playheadTime: number;
  onUpdateBounds: (id: string, start: number, end: number) => void;
  onMergePrev: (id: string) => void;
  onMergeNext: (id: string) => void;
  onSplitAt: (id: string, at: number) => void;
  onDelete: (id: string) => void;
  onPreview: (segment: Segment) => void;
  onChangeSection?: (id: string, section: string) => void;
}

export function SegmentEditor({
  segment,
  lesson,
  workingSegments,
  playheadTime,
  onUpdateBounds,
  onMergePrev,
  onMergeNext,
  onSplitAt,
  onDelete,
  onPreview,
}: Props) {
  // Local echo of start/end so inputs can be edited before snapping on blur.
  const [startStr, setStartStr] = React.useState("");
  const [endStr, setEndStr] = React.useState("");

  React.useEffect(() => {
    if (segment) {
      setStartStr(segment.start.toFixed(2));
      setEndStr(segment.end.toFixed(2));
    } else {
      setStartStr("");
      setEndStr("");
    }
  }, [segment?.id, segment?.start, segment?.end]); // eslint-disable-line

  if (!segment) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        <p>选择一个切片开始编辑</p>
        <p className="text-xs">在时间轴或左侧列表点击任意切片</p>
      </div>
    );
  }

  const sorted = [...workingSegments].sort((a, b) => a.start - b.start);
  const idx = sorted.findIndex((s) => s.id === segment.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < sorted.length - 1;

  const splitPointInside =
    playheadTime > segment.start + 0.05 && playheadTime < segment.end - 0.05;

  const commitStart = () => {
    const n = Number(startStr);
    if (!Number.isFinite(n)) {
      setStartStr(segment.start.toFixed(2));
      return;
    }
    const snapped = snapToBeat(n, lesson.beats);
    if (snapped >= segment.end - 0.01) {
      setStartStr(segment.start.toFixed(2));
      return;
    }
    if (t2(snapped) === segment.start) return;
    onUpdateBounds(segment.id, t2(snapped), segment.end);
  };

  const commitEnd = () => {
    const n = Number(endStr);
    if (!Number.isFinite(n)) {
      setEndStr(segment.end.toFixed(2));
      return;
    }
    const snapped = snapToBeat(n, lesson.beats);
    if (snapped <= segment.start + 0.01) {
      setEndStr(segment.end.toFixed(2));
      return;
    }
    if (t2(snapped) === segment.end) return;
    onUpdateBounds(segment.id, segment.start, t2(snapped));
  };

  return (
    <div className="flex h-full flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{segment.id}</span>
            {segment.user_edited && <Badge variant="warn">已编辑</Badge>}
            {segment.is_still && <Badge>静止</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {segment.section_label} · #{segment.index + 1}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPreview(segment)}
        >
          <PlayCircle className="h-4 w-4" />
          预览
        </Button>
      </div>

      {/* time inputs */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500">起始时间 (s)</span>
          <input
            type="number"
            step="0.01"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            onBlur={commitStart}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500">结束时间 (s)</span>
          <input
            type="number"
            step="0.01"
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
      </div>

      {/* readonly stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="时长" value={`${segment.duration.toFixed(2)}s`} />
        <Stat label="拍数" value={`${segment.beat_count}`} />
        <Stat label="难度" value={"★".repeat(segment.difficulty)} />
      </div>

      {/* operations */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onMergePrev(segment.id)}
        >
          <ArrowLeftToLine className="h-4 w-4" />
          合并上一片
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onMergeNext(segment.id)}
        >
          <ArrowRightToLine className="h-4 w-4" />
          合并下一片
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!splitPointInside}
          onClick={() => onSplitAt(segment.id, playheadTime)}
          title={
            splitPointInside
              ? `在 ${fmtTime(playheadTime)} 分割`
              : "先把播放头拖到该切片内部"
          }
        >
          <Scissors className="h-4 w-4" />
          在播放头处分割
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(segment.id)}
        >
          <Trash2 className="h-4 w-4" />
          删除切片
        </Button>
      </div>

      {/* teaching status peek */}
      {segment.teaching && (
        <div className="mt-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium">AI 教学</span>
            <TeachingStatusPill status={segment.teaching.status} />
          </div>
          {segment.teaching.status === "ready" && (
            <p className="line-clamp-2 text-neutral-600 dark:text-neutral-300">
              {segment.teaching.summary || segment.ai_description}
            </p>
          )}
          {segment.teaching.status === "pending" && (
            <p className="text-neutral-500">修改后教学内容将重新生成…</p>
          )}
          {segment.teaching.status === "failed" && (
            <p className="text-red-600">生成失败，进入教程页可重试</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function TeachingStatusPill({ status }: { status: "ready" | "pending" | "failed" }) {
  if (status === "ready") return <Badge variant="brand">就绪</Badge>;
  if (status === "pending") return <Badge variant="warn">生成中</Badge>;
  return <Badge variant="outline">失败</Badge>;
}
