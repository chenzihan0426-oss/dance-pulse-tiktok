"use client";

import * as React from "react";
import type { Lesson, Segment } from "@/lib/types";
import { TimelineBeatRuler } from "./TimelineBeatRuler";
import { TimelineSegmentBlock } from "./TimelineSegmentBlock";
import { snapToBeat } from "@/lib/snap";
import { cn } from "@/lib/utils";

interface Props {
  lesson: Lesson;
  segments: Segment[];
  selectedSegId: string | null;
  currentTime: number;
  onSelect: (id: string | null) => void;
  onUpdateBounds: (id: string, start: number, end: number) => void;
  onSeek: (time: number) => void;
  onCreate: (start: number, end: number, section: string) => void;
}

const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 80;
const DEFAULT_PX_PER_SEC = 24;

export function Timeline({
  lesson,
  segments,
  selectedSegId,
  currentTime,
  onSelect,
  onUpdateBounds,
  onSeek,
  onCreate,
}: Props) {
  const [pxPerSec, setPxPerSec] = React.useState(DEFAULT_PX_PER_SEC);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const totalWidth = Math.max(1, lesson.duration * pxPerSec);

  // ---- create-by-drag on empty space ----
  const [dragCreate, setDragCreate] = React.useState<{
    startSec: number;
    currentSec: number;
  } | null>(null);

  const timeFromEvent = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(lesson.duration, x / pxPerSec));
  };

  const findSectionAt = (time: number): string => {
    const sec = lesson.sections.find((s) => time >= s.start && time < s.end);
    return sec?.id ?? lesson.sections[0]?.id ?? "unknown";
  };

  const overlapsExisting = (a: number, b: number): boolean => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return segments.some((s) => !(hi <= s.start + 0.01 || lo >= s.end - 0.01));
  };

  const onLaneClick = (e: React.MouseEvent) => {
    const t = timeFromEvent(e.clientX);
    onSeek(t);
    onSelect(null);
  };

  const onLanePointerDown = (e: React.PointerEvent) => {
    // Only start a create-drag when pointer is on the empty lane (not a segment)
    const target = e.target as HTMLElement;
    if (target.dataset.role !== "lane") return;
    const startSec = timeFromEvent(e.clientX);
    setDragCreate({ startSec, currentSec: startSec });
    (target as Element).setPointerCapture?.(e.pointerId);
  };

  React.useEffect(() => {
    if (!dragCreate) return;
    const onMove = (e: PointerEvent) => {
      const t = timeFromEvent(e.clientX);
      setDragCreate((d) => (d ? { ...d, currentSec: t } : d));
    };
    const onUp = () => {
      setDragCreate((d) => {
        if (!d) return null;
        const a = snapToBeat(d.startSec, lesson.beats);
        const b = snapToBeat(d.currentSec, lesson.beats);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (hi - lo >= 0.3 && !overlapsExisting(lo, hi)) {
          onCreate(lo, hi, findSectionAt(lo));
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragCreate, lesson.beats, lesson.duration, pxPerSec]);

  // ---- neighbor bounds for each segment ----
  const sortedById = React.useMemo(() => {
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const map = new Map<string, { minStart: number; maxEnd: number }>();
    sorted.forEach((s, i) => {
      const prev = sorted[i - 1];
      const next = sorted[i + 1];
      map.set(s.id, {
        minStart: prev ? prev.end : 0,
        maxEnd: next ? next.start : lesson.duration,
      });
    });
    return map;
  }, [segments, lesson.duration]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2 text-xs text-neutral-500">
        <span>
          时长 <strong className="text-neutral-700 dark:text-neutral-200">{lesson.duration.toFixed(2)}s</strong>
          <span className="mx-2">·</span>
          <strong className="text-neutral-700 dark:text-neutral-200">{segments.length}</strong> 个切片
        </span>
        <div className="flex items-center gap-2">
          <span>时间轴缩放</span>
          <input
            type="range"
            min={MIN_PX_PER_SEC}
            max={MAX_PX_PER_SEC}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="accent-brand"
          />
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div style={{ width: totalWidth }}>
          <TimelineBeatRuler
            duration={lesson.duration}
            beats={lesson.beats}
            sections={lesson.sections}
            pxPerSec={pxPerSec}
          />

          {/* segment lane */}
          <div
            data-role="lane"
            onClick={onLaneClick}
            onPointerDown={onLanePointerDown}
            className={cn(
              "relative h-16",
              "bg-gradient-to-b from-transparent to-neutral-100/60 dark:to-neutral-950/30"
            )}
            style={{ width: totalWidth }}
          >
            {segments.map((seg) => {
              const bounds = sortedById.get(seg.id) ?? {
                minStart: 0,
                maxEnd: lesson.duration,
              };
              return (
                <TimelineSegmentBlock
                  key={seg.id}
                  segment={seg}
                  isSelected={seg.id === selectedSegId}
                  pxPerSec={pxPerSec}
                  beats={lesson.beats}
                  minStart={bounds.minStart}
                  maxEnd={bounds.maxEnd}
                  onSelect={onSelect}
                  onBoundsChange={onUpdateBounds}
                />
              );
            })}

            {/* playhead */}
            <div
              className="pointer-events-none absolute top-0 h-full w-px bg-red-500"
              style={{ left: currentTime * pxPerSec }}
              aria-hidden
            >
              <div className="absolute -top-1 -left-1 h-2 w-2 rotate-45 bg-red-500" />
            </div>

            {/* drag-create ghost */}
            {dragCreate && (
              <div
                className="pointer-events-none absolute top-1 bottom-1 rounded border-2 border-dashed border-brand bg-brand/15"
                style={{
                  left:
                    Math.min(dragCreate.startSec, dragCreate.currentSec) *
                    pxPerSec,
                  width:
                    Math.abs(dragCreate.currentSec - dragCreate.startSec) *
                      pxPerSec || 2,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <p className="px-2 text-xs text-neutral-500">
        拖拽切片边界调整时间（自动吸附到 beat，按住 <kbd className="rounded border px-1">Shift</kbd> 关闭吸附）。
        在空白处拖拽可新建切片。
      </p>
    </div>
  );
}
