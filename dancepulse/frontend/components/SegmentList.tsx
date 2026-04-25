"use client";

import * as React from "react";
import type { Segment } from "@/lib/types";
import { cn, fmtTime } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Lock } from "lucide-react";

interface Props {
  segments: Segment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SegmentList({ segments, selectedId, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h3 className="text-sm font-semibold">切片列表</h3>
        <span className="text-xs text-neutral-500">{segments.length} 个</span>
      </div>
      {segments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-neutral-500">
          还没有切片。在时间轴空白处拖拽即可新建。
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-neutral-100 overflow-auto dark:divide-neutral-800">
          {segments.map((seg) => (
            <li key={seg.id}>
              <button
                onClick={() => onSelect(seg.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  selectedId === seg.id
                    ? "bg-brand/10"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                  seg.is_still && "opacity-60"
                )}
              >
                <div className="w-6 text-center text-xs font-mono text-neutral-500">
                  {String(seg.index + 1).padStart(2, "0")}
                </div>
                {seg.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={seg.thumbnail}
                    alt=""
                    className="h-10 w-16 flex-shrink-0 rounded bg-neutral-200 object-cover"
                  />
                ) : (
                  <div className="h-10 w-16 flex-shrink-0 rounded bg-neutral-200 dark:bg-neutral-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="shrink-0">
                      {seg.section_label}
                    </Badge>
                    <span className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {seg.id}
                    </span>
                    {seg.user_edited && (
                      <Badge variant="warn" className="shrink-0">
                        已编辑
                      </Badge>
                    )}
                    {seg.is_still && (
                      <Lock className="h-3 w-3 text-neutral-400" aria-label="静止" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                    <span>
                      {fmtTime(seg.start)} → {fmtTime(seg.end)}
                    </span>
                    <span>·</span>
                    <span>{seg.duration.toFixed(2)}s</span>
                    <span>·</span>
                    <span>{seg.beat_count} 拍</span>
                  </div>
                </div>
                <div className="text-amber-500 text-xs">
                  {"★".repeat(seg.difficulty)}
                  <span className="text-neutral-300">
                    {"★".repeat(5 - seg.difficulty)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
