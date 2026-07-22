"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Minimize2, Pause, Play, PersonStanding } from "lucide-react";

import AdaptiveSkeletonOverlay from "@/components/tracking/AdaptiveSkeletonOverlay";
import type { Lesson, Segment } from "@/lib/types";
import type { Kpt, TeacherFrame } from "@/lib/pose/scoring";
import {
  resolveKeyActions,
  type DifficultyAggregateLike,
  type KeyActionMarker,
} from "@/lib/keyActions";
import { cn } from "@/lib/utils";
import { getApiBase } from "@/lib/api";

/** 倍速最低 0.1x */
export const COVER_PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5] as const;

const SKELETON_TUNING = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  skeletonScale: 1.08,
  skeletonOffsetX: 0,
  skeletonOffsetY: 0,
  skeletonIntensity: 1.15,
};

type PoseJsonFrame = {
  t: number;
  detected?: boolean;
  keypoints?: Array<{ x: number; y: number; z?: number; visibility?: number }>;
  kp?: Array<[number, number, number?]> | null;
};

type PoseJsonDoc = {
  width?: number;
  height?: number;
  frames?: PoseJsonFrame[];
};

function poseFrameToKeypoints(frame: PoseJsonFrame): Kpt[] {
  if (Array.isArray(frame.keypoints) && frame.keypoints.length) {
    return frame.keypoints.map((kp) => ({
      x: kp.x,
      y: kp.y,
      z: kp.z ?? 0,
      visibility: kp.visibility ?? 1,
    }));
  }
  if (Array.isArray(frame.kp) && frame.kp.length) {
    return frame.kp.map((kp) => ({
      x: kp[0],
      y: kp[1],
      z: 0,
      visibility: kp[2] ?? 1,
    }));
  }
  return [];
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function findActiveSegment(segments: Segment[], t: number): Segment | null {
  for (const seg of segments) {
    if (t >= seg.start && t < seg.end) return seg;
  }
  return segments[segments.length - 1] ?? null;
}

function segmentHint(seg: Segment): string {
  const teaching = seg.teaching?.summary?.trim();
  if (teaching) return teaching.length > 40 ? `${teaching.slice(0, 40)}…` : teaching;
  if (seg.ai_description?.trim()) {
    const t = seg.ai_description.trim();
    return t.length > 40 ? `${t.slice(0, 40)}…` : t;
  }
  return `${seg.beat_count} 拍 · ${seg.duration.toFixed(1)}s`;
}

/**
 * 封面视频舞台：尺寸由外层控制；focused 时仅负责播放控件叠在画面底部，
 * 不额外撑开垂直布局，避免右侧文案上下跳动。
 */
export function LessonCoverFocusPlayer({
  focused,
  lesson,
  segments,
  onFocus,
  onCollapse,
  onHoverChange,
  className,
}: {
  focused: boolean;
  lesson: Lesson;
  segments: Segment[];
  onFocus: () => void;
  onCollapse: () => void;
  onHoverChange?: (hovering: boolean) => void;
  className?: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const framesRef = React.useRef<TeacherFrame[]>([]);
  const playheadRef = React.useRef(0);

  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState<(typeof COVER_PLAYBACK_SPEEDS)[number]>(1);
  const [showSkeleton, setShowSkeleton] = React.useState(true);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(lesson.duration || 0);
  const [poseReady, setPoseReady] = React.useState(false);
  const [poseAspect, setPoseAspect] = React.useState(9 / 16);
  const [dragging, setDragging] = React.useState(false);
  const [keyActions, setKeyActions] = React.useState<KeyActionMarker[]>(() =>
    resolveKeyActions(lesson.id, segments)
  );
  const [hoverKeyId, setHoverKeyId] = React.useState<string | null>(null);

  const activeSeg = React.useMemo(
    () => findActiveSegment(segments, currentTime),
    [segments, currentTime]
  );

  React.useEffect(() => {
    let cancelled = false;
    // 先落地 demo/启发式，再尝试拉真实聚合覆盖
    setKeyActions(resolveKeyActions(lesson.id, segments));

    const controller = new AbortController();
    const loadStats = async () => {
      try {
        const base = getApiBase();
        const res = await fetch(
          `${base}/api/lessons/${encodeURIComponent(lesson.id)}/tracking/difficulty?scope=global`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { aggregates?: DifficultyAggregateLike[] };
        const aggs = data.aggregates ?? [];
        if (cancelled || !aggs.length) return;
        const next = resolveKeyActions(lesson.id, segments, aggs);
        if (next.length) setKeyActions(next);
      } catch {
        // 无接口或未部署会话聚合时静默使用 demo 写死点
      }
    };
    void loadStats();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lesson.id, segments]);

  const hoverKey = hoverKeyId ? keyActions.find((k) => k.id === hoverKeyId) ?? null : null;

  React.useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCollapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, onCollapse]);

  React.useEffect(() => {
    let cancelled = false;
    setPoseReady(false);
    framesRef.current = [];
    const loadable = segments.filter((s) => s.pose_full_url || s.pose_url);
    if (!loadable.length) return;

    Promise.all(
      loadable.map(async (seg) => {
        const url = seg.pose_full_url ?? seg.pose_url;
        if (!url) return [] as TeacherFrame[];
        try {
          const doc: PoseJsonDoc = await fetch(url).then((r) => r.json());
          if (doc.width && doc.height && doc.width > 0 && doc.height > 0) {
            setPoseAspect(doc.width / doc.height);
          }
          return (doc.frames ?? [])
            .filter((f) => f.detected !== false)
            .map((f) => ({
              t: f.t + seg.start,
              keypoints: poseFrameToKeypoints(f),
            }))
            .filter((fr) => fr.keypoints.length >= 17);
        } catch {
          return [] as TeacherFrame[];
        }
      })
    ).then((chunks) => {
      if (cancelled) return;
      const merged = chunks.flat().sort((a, b) => a.t - b.t);
      framesRef.current = merged;
      setPoseReady(merged.length > 0);
    });

    return () => {
      cancelled = true;
    };
  }, [segments]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = focused ? speed : 1;
  }, [speed, focused]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (focused) {
      v.loop = false;
      v.muted = false;
      void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.loop = true;
      v.muted = true;
      setSpeed(1);
      void v.play().catch(() => null);
      setPlaying(true);
    }
  }, [focused]);

  const onTimeUpdate = React.useCallback(() => {
    if (dragging) return;
    const v = videoRef.current;
    if (!v) return;
    playheadRef.current = v.currentTime;
    setCurrentTime(v.currentTime);
  }, [dragging]);

  const seekTo = React.useCallback(
    (ratio: number) => {
      const v = videoRef.current;
      if (!v) return;
      const d = v.duration || duration || lesson.duration || 0;
      if (d <= 0) return;
      const next = Math.max(0, Math.min(d, ratio * d));
      v.currentTime = next;
      playheadRef.current = next;
      setCurrentTime(next);
    },
    [duration, lesson.duration]
  );

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const dur = duration || lesson.duration || 1;

  return (
    <div
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden rounded-[24px] border bg-black",
        focused
          ? "border-[#00f3ff]/45 shadow-[0_40px_90px_rgba(0,243,255,0.18)]"
          : "cursor-pointer border-white/10 shadow-[0_35px_70px_rgba(0,0,0,0.55)] hover:border-[#00f3ff]/40",
        className
      )}
      onClick={() => {
        if (!focused) onFocus();
      }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      role={focused ? undefined : "button"}
      tabIndex={focused ? undefined : 0}
      onKeyDown={(e) => {
        if (focused) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocus();
        }
      }}
      aria-label={focused ? undefined : "点击封面，平移到屏幕中央预览"}
    >
      <video
        ref={videoRef}
        src={lesson.video_url}
        poster={lesson.thumbnail}
        className={cn("h-full w-full object-cover", !focused && "pointer-events-none")}
        muted={!focused}
        autoPlay
        loop={!focused}
        playsInline
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onClick={(e) => {
          if (!focused) return;
          e.stopPropagation();
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        }}
      />

      {focused && showSkeleton && poseReady ? (
        <AdaptiveSkeletonOverlay
          framesRef={framesRef}
          currentTimeSec={currentTime}
          currentTimeRef={playheadRef}
          tuning={SKELETON_TUNING}
          mirror={false}
          active={showSkeleton && poseReady}
          sourceAspect={poseAspect}
          className="pointer-events-none absolute inset-0 z-[5]"
        />
      ) : null}

      {!focused ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 text-[12px] font-semibold text-white/85">
          点击封面 · 平移到中央
        </span>
      ) : null}

      {/* 控件叠在画面底部，不撑开外层高度，避免右侧文案上下窜 */}
      {focused ? (
        <div
          className="absolute inset-x-0 bottom-0 z-20 space-y-2 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-3 pt-16"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {activeSeg ? (
                <>
                  <div className="truncate text-[11px] font-semibold text-[#9ef8ff]">
                    关键 · #{activeSeg.index + 1} {activeSeg.section_label}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/55">
                    {segmentHint(activeSeg)}
                  </p>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/85 backdrop-blur"
            >
              <Minimize2 className="h-3 w-3" />
              收起
            </button>
          </div>

          <div className="relative pt-6">
            {/* 悬停浮层：关键动作详情 */}
            {hoverKey ? (
              <div
                className="pointer-events-none absolute bottom-full z-30 mb-2 w-[min(220px,70vw)] -translate-x-1/2 rounded-xl border border-[#ff5c8a]/40 bg-black/95 px-3 py-2 shadow-[0_12px_40px_rgba(255,0,85,0.25)]"
                style={{ left: `${Math.min(92, Math.max(8, (hoverKey.timeSec / dur) * 100))}%` }}
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
              {segments.map((seg) => {
                const left = (seg.start / dur) * 100;
                const width = ((seg.end - seg.start) / dur) * 100;
                const isActive = activeSeg?.id === seg.id;
                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "pointer-events-none absolute top-0 h-full border-l border-white/25",
                      isActive ? "bg-white/[0.08]" : "bg-transparent"
                    )}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                  />
                );
              })}

              {/* 关键动作钉：可悬停 */}
              {keyActions.map((k) => {
                const left = (k.timeSec / dur) * 100;
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
                    style={{ left: `${left}%` }}
                    aria-label={k.hoverTitle}
                    onMouseEnter={() => setHoverKeyId(k.id)}
                    onMouseLeave={() => setHoverKeyId(null)}
                    onFocus={() => setHoverKeyId(k.id)}
                    onBlur={() => setHoverKeyId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      seekTo(k.timeSec / dur);
                    }}
                  />
                );
              })}

              <div
                className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff]"
                style={{ width: `${progressPct}%` }}
              />
              <div
                className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#00f3ff]"
                style={{ left: `${progressPct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/45">
              <span>{formatClock(currentTime)}</span>
              <span className="text-white/30">关键动作 {keyActions.length} 处</span>
              <span>{formatClock(dur)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) void v.play();
                else v.pause();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
            </button>

            <div className="flex flex-wrap items-center gap-0.5">
              {COVER_PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                    speed === s ? "bg-[#ccff00] text-[#050505]" : "bg-white/10 text-white/65"
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!poseReady}
              title={!poseReady ? "本课暂无姿态数据" : showSkeleton ? "隐藏骨架" : "显示骨架"}
              onClick={() => setShowSkeleton((v) => !v)}
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold",
                !poseReady
                  ? "cursor-not-allowed text-white/25"
                  : showSkeleton
                    ? "border border-[#00f3ff]/50 bg-[#00f3ff]/20 text-[#9ef8ff]"
                    : "border border-white/20 bg-white/10 text-white/60"
              )}
            >
              <PersonStanding className="h-3 w-3" />
              骨架
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
