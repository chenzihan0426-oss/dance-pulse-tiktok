"use client";

import * as React from "react";
import { Star, Trash2 } from "lucide-react";
import { LessonCard } from "@/components/LessonCard";
import type { LessonListItem } from "@/lib/types";

const ACTION_WIDTH = 80;
const MAX_OFFSET = ACTION_WIDTH * 2;

type ResumeMeta = { index: number; sectionLabel: string } | null;

interface Props {
  lesson: LessonListItem;
  favorited: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
  onNavigate: () => void;
  learnedCount?: number;
  totalCount?: number;
  resumeMeta?: ResumeMeta;
}

export function SwipeableLessonRow({
  lesson,
  favorited,
  isOpen,
  onOpenChange,
  onToggleFavorite,
  onRemove,
  onNavigate,
  learnedCount = 0,
  totalCount = 0,
  resumeMeta = null,
}: Props) {
  const [offset, setOffset] = React.useState(isOpen ? -MAX_OFFSET : 0);
  const [dragging, setDragging] = React.useState(false);
  const pointerRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    draggingX: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (!dragging) {
      setOffset(isOpen ? -MAX_OFFSET : 0);
    }
  }, [dragging, isOpen]);

  const clampOffset = React.useCallback((value: number) => {
    if (value > 0) return 0;
    if (value < -MAX_OFFSET) return -MAX_OFFSET;
    return value;
  }, []);

  const closeRow = React.useCallback(() => {
    setDragging(false);
    setOffset(0);
    onOpenChange(false);
  }, [onOpenChange]);

  const openRow = React.useCallback(() => {
    setDragging(false);
    setOffset(-MAX_OFFSET);
    onOpenChange(true);
  }, [onOpenChange]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: isOpen ? -MAX_OFFSET : 0,
        draggingX: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isOpen]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (!state.draggingX) {
        if (Math.abs(deltaX) < 8) return;
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          pointerRef.current = null;
          return;
        }
        state.draggingX = true;
        setDragging(true);
        if (!isOpen) {
          onOpenChange(true);
        }
      }

      const next = clampOffset(state.startOffset + deltaX);
      setOffset(next);
      event.preventDefault();
    },
    [clampOffset, isOpen, onOpenChange]
  );

  const finishPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      pointerRef.current = null;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (!state.draggingX) {
        const isTap = Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8;
        if (!isTap) return;

        if (isOpen || offset < 0) {
          closeRow();
        } else {
          onNavigate();
        }
        return;
      }

      if (offset <= -(MAX_OFFSET / 2)) {
        openRow();
      } else {
        closeRow();
      }
    },
    [closeRow, isOpen, offset, onNavigate, openRow]
  );

  const handleFavorite = React.useCallback(() => {
    onToggleFavorite();
    closeRow();
  }, [closeRow, onToggleFavorite]);

  const handleRemove = React.useCallback(() => {
    onRemove();
    closeRow();
  }, [closeRow, onRemove]);

  return (
    <div className="relative overflow-hidden rounded-[28px]">
      <div className="absolute inset-y-0 right-0 flex w-[160px] overflow-hidden rounded-[28px]">
        <button
          type="button"
          onClick={handleFavorite}
          className="flex w-20 flex-col items-center justify-center gap-2 bg-state-warn text-[13px] text-white"
          aria-label={favorited ? "取消收藏" : "收藏"}
        >
          <Star className={`h-5 w-5 ${favorited ? "fill-current" : ""}`} />
          <span>{favorited ? "取消收藏" : "收藏"}</span>
        </button>
        <button
          type="button"
          onClick={handleRemove}
          className="flex w-20 flex-col items-center justify-center gap-2 bg-state-danger text-[13px] text-white"
          aria-label="移除"
        >
          <Trash2 className="h-5 w-5" />
          <span>移除</span>
        </button>
      </div>

      <div
        className="relative transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${offset}px)`,
          touchAction: "pan-y",
          transitionDuration: dragging ? "0ms" : "200ms",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <div className="pointer-events-none relative">
          <LessonCard
            lesson={lesson}
            learnedCount={learnedCount}
            totalCount={totalCount}
            resumeMeta={resumeMeta}
          />
          {favorited ? (
            <div className="absolute right-4 top-4 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-state-warn text-white shadow-[0_8px_18px_rgba(245,158,11,0.28)]">
              <Star className="h-2.5 w-2.5 fill-current" />
            </div>
          ) : null}
          {lesson.demo_ready ? (
            <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow-[0_6px_14px_rgba(251,191,36,0.4)]">
              ✨ DEMO
            </div>
          ) : lesson.has_video === false ? (
            <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium tracking-wider text-white/55">
              缺数据
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
