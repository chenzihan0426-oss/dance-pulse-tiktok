"use client";

// 播放页(单段卡片)的关键动作进度条 —— 与课程页 LessonCoverFocusPlayer 同一套
// 数据源(lib/keyActions)与视觉语言:粉色关键钉 + 悬停显示量化指标文案
// (跟练统计优先,无数据时用路演 demo 指标)。

import * as React from "react";

import {
  resolveKeyActions,
  type KeyActionMarker,
} from "@/lib/keyActions";
import { getTrackingDifficulty } from "@/lib/api";
import type { Lesson, Segment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  lesson: Lesson;
  segment: Segment;
  videoRef: React.RefObject<HTMLVideoElement>;
  className?: string;
}

export function KeyActionScrubber({ lesson, segment, videoRef, className }: Props) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const draggingRef = React.useRef(false);
  draggingRef.current = dragging;
  const [hoverKeyId, setHoverKeyId] = React.useState<string | null>(null);
  const [markers, setMarkers] = React.useState<KeyActionMarker[]>([]);

  const practiceSegments = React.useMemo(
    () => lesson.segments.filter((s) => !s.deleted && !s.is_still),
    [lesson.segments]
  );

  // 全课关键动作(demo 或跟练统计),过滤出落在当前段内的,换算成段内位置
  React.useEffect(() => {
    let cancelled = false;
    setMarkers(resolveKeyActions(lesson.id, practiceSegments));
    getTrackingDifficulty(lesson.id, "global")
      .then((aggs) => {
        if (cancelled) return;
        const next = resolveKeyActions(lesson.id, practiceSegments, aggs);
        if (next.length) setMarkers(next);
      })
      .catch(() => {
        /* 无统计数据时保留 demo 标注 */
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.id, practiceSegments]);

  const segMarkers = React.useMemo(() => {
    const dur = Math.max(segment.duration, 0.01);
    return markers
      .filter(
        (k) =>
          k.segmentId === segment.id ||
          (k.timeSec >= segment.start && k.timeSec < segment.end)
      )
      .map((k) => ({
        ...k,
        // 段内比例(0..1);标在段上的统计钉没有精确段内时刻时放段中央
        ratio:
          k.timeSec >= segment.start && k.timeSec < segment.end
            ? (k.timeSec - segment.start) / dur
            : 0.5,
      }));
  }, [markers, segment.id, segment.start, segment.end, segment.duration]);

  // rAF 同步播放进度
  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && !draggingRef.current) {
        const d = v.duration && Number.isFinite(v.duration) ? v.duration : segment.duration;
        const p = d > 0 ? Math.min(1, Math.max(0, v.currentTime / d)) : 0;
        setProgress((prev) => (Math.abs(prev - p) < 0.001 ? prev : p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, segment.duration, segment.id]);

  const seekTo = React.useCallback(
    (ratio: number) => {
      const v = videoRef.current;
      if (!v) return;
      const d = v.duration && Number.isFinite(v.duration) ? v.duration : segment.duration;
      v.currentTime = Math.min(d - 0.05, Math.max(0, ratio * d));
      setProgress(Math.min(1, Math.max(0, ratio)));
    },
    [videoRef, segment.duration]
  );

  const hoverKey = hoverKeyId ? segMarkers.find((k) => k.id === hoverKeyId) ?? null : null;

  return (
    <div className={className}>
      <div className="rounded-2xl border border-white/12 bg-black/55 px-4 pb-3 pt-4 backdrop-blur-md">
        <div className="relative pt-1">
          {/* 悬停浮层:关键动作详情(与课程页封面播放器同款) */}
          {hoverKey ? (
            <div
              className="pointer-events-none absolute bottom-full z-30 mb-2 w-[min(220px,70vw)] -translate-x-1/2 rounded-xl border border-[#ff5c8a]/40 bg-black/95 px-3 py-2 shadow-[0_12px_40px_rgba(255,0,85,0.25)]"
              style={{ left: `${Math.min(92, Math.max(8, hoverKey.ratio * 100))}%` }}
            >
              <div className="text-[10px] font-bold leading-snug text-[#ff9cbb]">
                {hoverKey.hoverTitle}
              </div>
              <p className="mt-1 text-[9px] leading-relaxed text-white/60">{hoverKey.hoverDetail}</p>
              <div className="mt-1 text-[8px] uppercase tracking-wider text-white/35">
                关键 · {hoverKey.label}
                {hoverKey.source === "demo" ? " · 路演示意" : " · 跟练统计"}
              </div>
            </div>
          ) : null}

          <div
            ref={trackRef}
            className="relative h-2.5 cursor-pointer rounded-full bg-white/15"
            onPointerDown={(e) => {
              setDragging(true);
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
              const move = (ev: PointerEvent) => seekTo((ev.clientX - rect.left) / rect.width);
              const up = () => {
                setDragging(false);
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            <div
              className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff]"
              style={{ width: `${progress * 100}%` }}
            />

            {/* 关键动作钉:可悬停(粉色,与课程页一致) */}
            {segMarkers.map((k) => {
              const active = hoverKeyId === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  className={cn(
                    "absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition",
                    active
                      ? "scale-125 border-white bg-[#ff0055] shadow-[0_0_14px_rgba(255,0,85,0.85)]"
                      : "border-[#ff9cbb] bg-[#ff0055]/90 shadow-[0_0_10px_rgba(255,0,85,0.55)] hover:scale-110"
                  )}
                  style={{ left: `${k.ratio * 100}%` }}
                  aria-label={k.hoverTitle}
                  onMouseEnter={() => setHoverKeyId(k.id)}
                  onMouseLeave={() => setHoverKeyId(null)}
                  onFocus={() => setHoverKeyId(k.id)}
                  onBlur={() => setHoverKeyId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(k.ratio);
                  }}
                />
              );
            })}

            <div
              className="pointer-events-none absolute top-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#00f3ff]"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          {segMarkers.length > 0 ? (
            <div className="mt-1.5 text-center text-[9px] uppercase tracking-wider text-white/30">
              关键动作 {segMarkers.length} 处
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default KeyActionScrubber;
