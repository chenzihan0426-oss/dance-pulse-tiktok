"use client";

import * as React from "react";
import type { Segment } from "@/lib/types";
import { snapToBeat } from "@/lib/snap";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/utils";

interface Props {
  segment: Segment;
  isSelected: boolean;
  pxPerSec: number;
  beats: number[];
  minStart: number;
  maxEnd: number;
  onSelect: (id: string) => void;
  /** Called on release with final start/end. */
  onBoundsChange: (id: string, start: number, end: number) => void;
}

type DragKind = "left" | "right" | "move" | null;

export function TimelineSegmentBlock({
  segment,
  isSelected,
  pxPerSec,
  beats,
  minStart,
  maxEnd,
  onSelect,
  onBoundsChange,
}: Props) {
  const [drag, setDrag] = React.useState<{
    kind: DragKind;
    startX: number;
    origStart: number;
    origEnd: number;
    current: { start: number; end: number };
    shiftHeld: boolean;
  } | null>(null);

  const current = drag?.current ?? { start: segment.start, end: segment.end };
  const left = current.start * pxPerSec;
  const width = Math.max(2, (current.end - current.start) * pxPerSec);

  // ---- drag handlers ----
  const onPointerDown = (e: React.PointerEvent, kind: DragKind) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSelect(segment.id);
    setDrag({
      kind,
      startX: e.clientX,
      origStart: segment.start,
      origEnd: segment.end,
      current: { start: segment.start, end: segment.end },
      shiftHeld: e.shiftKey,
    });
  };

  React.useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dSec = dx / pxPerSec;
      let ns = drag.origStart;
      let ne = drag.origEnd;

      if (drag.kind === "left") {
        ns = drag.origStart + dSec;
      } else if (drag.kind === "right") {
        ne = drag.origEnd + dSec;
      } else if (drag.kind === "move") {
        ns = drag.origStart + dSec;
        ne = drag.origEnd + dSec;
      }

      // clamp to neighbors
      ns = Math.max(minStart, ns);
      ne = Math.min(maxEnd, ne);
      if (drag.kind === "left") ns = Math.min(ns, ne - 0.05);
      if (drag.kind === "right") ne = Math.max(ne, ns + 0.05);

      // snap to beat unless Shift held
      const shiftHeld = e.shiftKey;
      if (!shiftHeld) {
        if (drag.kind === "left" || drag.kind === "move") ns = snapToBeat(ns, beats);
        if (drag.kind === "right" || drag.kind === "move") ne = snapToBeat(ne, beats);
      }

      setDrag((d) =>
        d ? { ...d, current: { start: ns, end: ne }, shiftHeld } : d
      );
    };

    const onUp = () => {
      setDrag((d) => {
        if (d) {
          // commit only if bounds actually changed
          if (
            d.current.start !== d.origStart ||
            d.current.end !== d.origEnd
          ) {
            onBoundsChange(segment.id, d.current.start, d.current.end);
          }
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
  }, [drag, pxPerSec, beats, minStart, maxEnd, segment.id, onBoundsChange]);

  const colorClass = segment.is_still
    ? "bg-neutral-300/60 border-neutral-400"
    : isSelected
    ? "bg-brand/30 border-brand"
    : "bg-brand/15 border-brand-300 hover:bg-brand/25";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(segment.id);
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      className={cn(
        "absolute top-1 bottom-1 cursor-grab select-none rounded border-2 transition-colors",
        drag && "cursor-grabbing",
        colorClass,
        isSelected && "ring-2 ring-brand ring-offset-1"
      )}
      style={{ left, width }}
      aria-label={`切片 ${segment.id}`}
    >
      {/* left handle */}
      <div
        onPointerDown={(e) => onPointerDown(e, "left")}
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l bg-brand/60 hover:bg-brand"
        aria-hidden
      />
      {/* right handle */}
      <div
        onPointerDown={(e) => onPointerDown(e, "right")}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-brand/60 hover:bg-brand"
        aria-hidden
      />

      {/* label inside block */}
      <div className="pointer-events-none flex h-full items-center justify-center px-2 text-[11px] font-medium text-neutral-700 dark:text-neutral-200">
        <span className="truncate">{segment.id.replace("seg_", "#")}</span>
      </div>

      {/* drag tooltip */}
      {drag && (
        <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-white shadow">
          {fmtTime(drag.current.start)} → {fmtTime(drag.current.end)}
          {drag.shiftHeld && <span className="ml-1 opacity-70">no-snap</span>}
        </div>
      )}
    </div>
  );
}
