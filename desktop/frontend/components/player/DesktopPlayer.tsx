"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pause,
  Play,
  FlipHorizontal2,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Check,
  Crosshair,
  Search,
  Sparkles,
} from "lucide-react";
import type { Lesson, Segment } from "@/lib/types";
import { XuangeGuideOverlay } from "@/components/player/XuangeGuideOverlay";
import { BeatCounterBadge } from "@/components/player/BeatCounterBadge";
import { KeyframeScrubber } from "@/components/player/KeyframeScrubber";
import { TeachingPanelKpop, parseBeatsRange } from "@/components/TeachingPanelKpop";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { lessonIsDemoReady } from "@/lib/demoReady";
import { cn } from "@/lib/utils";

// 排序：1x 起步，先逐级降速到 0.1x（最慢），再升速 (1.25 → 1.5)，循环回 1x
const SPEEDS = [1, 0.75, 0.5, 0.25, 0.1, 1.25, 1.5] as const;
// 放大镜倍数档位（点击循环切换）
const MAG_ZOOM_MIN = 1.2;
const MAG_ZOOM_MAX = 4;
// 放大镜可跟随的身体部位(BlazePose 33 点索引)。
// 注意：手必须分左右各自跟随——双手合并取中心会落到身体中线。
const BODY_PARTS = [
  { label: "全身", idxs: [11, 12, 23, 24], zoom: 1.6 },
  { label: "头部", idxs: [0, 7, 8], zoom: 2.4 },
  // 手/腿移动快且幅度大，倍数不能太高，否则采样范围太小、一动就出框
  { label: "左手", idxs: [15, 17, 19, 21], zoom: 2 },
  { label: "右手", idxs: [16, 18, 20, 22], zoom: 2 },
  { label: "腿部", idxs: [25, 26, 27, 28], zoom: 1.8 },
];

// One Euro 滤波器：自适应低通——慢动作强平滑(去抖)、快动作弱平滑(不滞后)
class OneEuroFilter {
  private xHat: number | null = null;
  private dxHat = 0;
  private tPrev = 0;
  constructor(
    private minCutoff = 1.5,
    private beta = 0.02,
    private dCutoff = 1.0
  ) {}
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset(): void {
    this.xHat = null;
    this.dxHat = 0;
  }
  filter(x: number, tSec: number): number {
    if (this.xHat === null) {
      this.xHat = x;
      this.tPrev = tSec;
      return x;
    }
    const dt = Math.max(1e-3, tSec - this.tPrev);
    this.tPrev = tSec;
    const dx = (x - this.xHat) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxHat = this.dxHat + aD * (dx - this.dxHat);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxHat);
    const a = this.alpha(cutoff, dt);
    this.xHat = this.xHat + a * (x - this.xHat);
    return this.xHat;
  }
}

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function DotFieldBackground({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const spacing = 28;

    const dots: Array<{
      ox: number;
      oy: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
    }> = [];

    const reset = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      dots.length = 0;
      for (let x = -spacing; x <= width + spacing; x += spacing) {
        for (let y = -spacing; y <= height + spacing; y += spacing) {
          dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
        }
      }
    };

    let t = 0;
    const render = () => {
      t += 0.028;
      ctx.fillStyle = "#040404";
      ctx.fillRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < dots.length; i += 1) {
        const p = dots[i];
        const waveX = Math.sin(p.oy * 0.005 + t) * 9;
        const waveY = Math.cos(p.ox * 0.006 + t) * 10;
        const tx = p.ox + waveX;
        const ty = p.oy + waveY;

        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180) {
          const force = ((180 - dist) / 180) ** 2;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 2.8;
          p.vy -= Math.sin(angle) * force * 2.8;
        }

        p.vx += (tx - p.x) * 0.05;
        p.vy += (ty - p.y) * 0.05;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;

        const mag = Math.hypot(p.x - p.ox, p.y - p.oy);
        let r = 255;
        let g = 0;
        let b = 122;
        if (mag > 8) {
          const f = Math.min((mag - 8) / 24, 1);
          r = Math.round(255 - 55 * f);
          g = Math.round(243 * f);
          b = Math.round(122 + 133 * f);
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    reset();
    render();

    const onResize = () => reset();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
}

// 动作放大镜：跟随鼠标的圆形透镜，逐帧把视频局部放大绘制到 canvas。
// 正确处理 object-cover 的坐标映射，以及镜像(scaleX(-1))下的采样方向。
// 兼容两种姿态数据格式：
//  - pose_full：frame.keypoints = [{x,y,visibility}]
//  - 基础 pose：frame.kp = [[x,y,visibility]] 或 null（未检出）
type PoseKp = { x: number; y: number; visibility: number };
type PoseFullFrame = { t: number; points: PoseKp[] | null };
type PoseFullDoc = { frames: PoseFullFrame[] };

async function loadPoseFull(url: string): Promise<PoseFullDoc | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const raw = (await res.json()) as { frames?: unknown[] };
  const frames: PoseFullFrame[] = (raw.frames ?? []).map((f) => {
    const fr = f as { t: number; keypoints?: PoseKp[]; kp?: number[][] | null };
    let points: PoseKp[] | null = null;
    if (Array.isArray(fr.keypoints)) {
      points = fr.keypoints.map((k) => ({ x: k.x, y: k.y, visibility: k.visibility }));
    } else if (Array.isArray(fr.kp)) {
      points = fr.kp.map((p) =>
        Array.isArray(p) ? { x: p[0], y: p[1], visibility: p[2] ?? 0 } : { x: 0, y: 0, visibility: 0 }
      );
    }
    return { t: fr.t, points };
  });
  return { frames };
}

// 按 clip 内秒数在相邻两帧之间线性插值出某部位的归一化中心
// (比"吸附最近帧"更顺，30fps 数据也能平滑跟随、减少滞后与阶梯感)
function interpCenter(
  frames: PoseFullFrame[],
  tSec: number,
  idxs: number[]
): { x: number; y: number } | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < tSec) lo = mid + 1;
    else hi = mid;
  }
  const next = frames[lo];
  const prev = lo > 0 ? frames[lo - 1] : next;
  const c0 = prev.points ? partCenter(prev.points, idxs) : null;
  const c1 = next.points ? partCenter(next.points, idxs) : null;
  if (c0 && c1) {
    const span = next.t - prev.t;
    const a = span > 0 ? Math.max(0, Math.min(1, (tSec - prev.t) / span)) : 0;
    return { x: c0.x + (c1.x - c0.x) * a, y: c0.y + (c1.y - c0.y) * a };
  }
  return c1 ?? c0;
}

// 给定关键点索引集合，求可见点的归一化中心(用于放大镜跟随某个部位)
function partCenter(kps: PoseKp[], idxs: number[]): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const i of idxs) {
    const p = kps[i];
    if (p && p.visibility > 0.3) {
      sx += p.x;
      sy += p.y;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}

function MagnifierLens({
  videoRef,
  mirror,
  pos,
  zoom,
  follow,
  poseDoc,
  partIdxs,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  mirror: boolean;
  pos: { x: number; y: number; w: number; h: number; visible: boolean };
  zoom: number;
  follow: boolean;
  poseDoc: PoseFullDoc | null;
  partIdxs: number[];
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const posRef = React.useRef(pos);
  posRef.current = pos;
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  const followRef = React.useRef(follow);
  followRef.current = follow;
  const poseRef = React.useRef(poseDoc);
  poseRef.current = poseDoc;
  const partRef = React.useRef(partIdxs);
  partRef.current = partIdxs;
  const fxRef = React.useRef(new OneEuroFilter());
  const fyRef = React.useRef(new OneEuroFilter());
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const lastModeRef = React.useRef({ mirror, part: partIdxs.join(",") });

  const LENS = 220; // 透镜直径(px)：加大后采样范围更大，手脚移动不易飞出透镜

  React.useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.videoWidth > 0) {
        const rect = video.getBoundingClientRect();
        const cw = rect.width;
        const ch = rect.height;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.max(cw / vw, ch / vh);
        const offX = (cw - vw * scale) / 2;
        const offY = (ch - vh * scale) / 2;

        // 切镜像 / 切部位时重置滤波器，避免透镜从旧位置滑过去
        const partKey = partRef.current.join(",");
        if (lastModeRef.current.mirror !== mirror || lastModeRef.current.part !== partKey) {
          fxRef.current.reset();
          fyRef.current.reset();
          lastRef.current = null;
          lastModeRef.current = { mirror, part: partKey };
        }

        // 透镜中心(容器坐标)：跟随舞者躯干中心，或回退鼠标
        let targetX: number | null = null;
        let targetY: number | null = null;
        const doc = poseRef.current;
        if (followRef.current && doc) {
          const c = interpCenter(doc.frames, video.currentTime, partRef.current);
          if (c) {
            const baseX = c.x * vw * scale + offX;
            targetX = mirror ? cw - baseX : baseX;
            targetY = c.y * vh * scale + offY;
            lastRef.current = { x: targetX, y: targetY };
          } else if (lastRef.current) {
            targetX = lastRef.current.x; // 偶尔丢帧：沿用上次位置
            targetY = lastRef.current.y;
          }
        } else {
          const p = posRef.current;
          if (p.visible) {
            targetX = p.x;
            targetY = p.y;
          }
        }

        const ctx = canvas.getContext("2d");
        if (targetX === null || targetY === null || !ctx) {
          canvas.style.display = "none";
          fxRef.current.reset();
          fyRef.current.reset();
          lastRef.current = null;
        } else {
          // One Euro 自适应平滑：同时抑制抖动与滞后
          const now = performance.now() / 1000;
          const sx = fxRef.current.filter(targetX, now);
          const sy = fyRef.current.filter(targetY, now);

          const r = LENS / 2;
          canvas.style.display = "block";
          canvas.style.left = `${Math.max(r, Math.min(cw - r, sx)) - r}px`;
          canvas.style.top = `${Math.max(r, Math.min(ch - r, sy)) - r}px`;

          // 反推采样点(帧坐标)
          const dispX = (sx - offX) / scale;
          const dispY = (sy - offY) / scale;
          const sampleX = mirror ? vw - dispX : dispX;
          const srcSize = LENS / zoomRef.current;
          ctx.clearRect(0, 0, LENS, LENS);
          ctx.save();
          if (mirror) {
            ctx.translate(LENS, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            video,
            sampleX - srcSize / 2,
            dispY - srcSize / 2,
            srcSize,
            srcSize,
            0,
            0,
            LENS,
            LENS
          );
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, mirror]);

  return (
    <canvas
      ref={canvasRef}
      width={LENS}
      height={LENS}
      className="pointer-events-none absolute z-30 rounded-full border-2 border-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
      style={{ width: `${LENS}px`, height: `${LENS}px`, display: "none" }}
    />
  );
}

export function DesktopPlayer({
  lesson,
  initialSegmentId,
  practiceSegments,
  onSegmentChange,
}: {
  lesson: Lesson;
  initialSegmentId: string;
  practiceSegments: Segment[];
  onSegmentChange?: (segId: string) => void;
}) {
  const [segId, setSegId] = React.useState(initialSegmentId);
  const segment = React.useMemo(() => lesson.segments.find((s) => s.id === segId) ?? lesson.segments[0], [lesson, segId]);

  const onNavigate = React.useCallback(
    (nextId: string) => {
      if (nextId === segId) return;
      setSegId(nextId);
      onSegmentChange?.(nextId);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/player/${nextId}?lesson=${lesson.id}`);
      }
    },
    [lesson.id, onSegmentChange, segId]
  );

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = React.useState(1);
  const [mirror, setMirror] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [immersive, setImmersive] = React.useState(false);
  const [currentBeat, setCurrentBeat] = React.useState(1);
  const [magnifier, setMagnifier] = React.useState(false);
  const [lensPos, setLensPos] = React.useState({ x: 0, y: 0, w: 1, h: 1, visible: false });
  const [magnifierZoom, setMagnifierZoom] = React.useState(1.6);
  const [magnifierFollow, setMagnifierFollow] = React.useState(true);
  const [magnifierPart, setMagnifierPart] = React.useState(0);
  const [poseDoc, setPoseDoc] = React.useState<PoseFullDoc | null>(null);

  const { learnedCount, total, setTotal, isLearned, toggleLearned, markLearned } =
    useLearningProgress(lesson.id);
  React.useEffect(() => {
    setTotal(practiceSegments.length);
  }, [practiceSegments.length, setTotal]);

  // 加载当前段的姿态数据(放大镜跟随用)
  React.useEffect(() => {
    setPoseDoc(null);
    const url = segment.pose_full_url || segment.pose_url;
    if (!url) return;
    let cancelled = false;
    loadPoseFull(url)
      .then((doc) => {
        if (!cancelled) setPoseDoc(doc);
      })
      .catch(() => {
        if (!cancelled) setPoseDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [segment.pose_full_url, segment.pose_url]);

  const [showCustomCursor, setShowCustomCursor] = React.useState(false);
  const [mousePos, setMousePos] = React.useState({ x: -1000, y: -1000 });
  const mouseRef = React.useRef({ x: -1000, y: -1000 });

  // AI 图文教学折叠卡片，切换 segment 时自动收起
  const [teachingExpanded, setTeachingExpanded] = React.useState(false);
  React.useEffect(() => {
    setTeachingExpanded(false);
  }, [segment.id]);

  // 当前 beat 命中的教学 step（用于视频上 overlay 提示词）
  const currentStep = React.useMemo(() => {
    const steps = segment.teaching?.steps ?? [];
    if (!steps.length) return null;
    const hit = steps.find((s) => {
      const r = parseBeatsRange(s.beats);
      return r !== null && currentBeat >= r[0] && currentBeat <= r[1];
    });
    return hit ?? null;
  }, [segment.teaching, currentBeat]);

  React.useEffect(() => {
    setShowCustomCursor(window.matchMedia("(pointer:fine)").matches);
    const onMove = (e: MouseEvent) => {
      const next = { x: e.clientX, y: e.clientY };
      setMousePos(next);
      mouseRef.current = next;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  React.useEffect(() => {
    let rafId = 0;
    let disposed = false;
    const beatCount = Math.max(segment.beat_count, 1);
    const beatDuration = segment.duration / beatCount;
    const tick = () => {
      if (disposed) return;
      const v = videoRef.current;
      if (v && beatDuration > 0) {
        const raw = Math.floor(v.currentTime / beatDuration);
        const beat = (raw % beatCount) + 1;
        setCurrentBeat((prev) => (prev === beat ? prev : beat));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
    };
  }, [segment.id, segment.duration, segment.beat_count]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed, segment.id]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.muted = false;
      v.volume = 1;
      void v.play().catch(() => setPlaying(false));
    } else {
      v.pause();
    }
  }, [playing, segment.id]);

  // 整段播放过 85% 自动标记学会(视频是 loop，用进度而非 ended 事件)
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let marked = false;
    const onTime = () => {
      if (marked) return;
      const d = v.duration;
      // 只对练习段(非静止/非删除)自动标记，避免脏数据使 learnedCount 虚高
      if (d > 0 && v.currentTime / d >= 0.85 && practiceSegments.some((s) => s.id === segment.id)) {
        marked = true;
        markLearned(segment.id);
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [segment.id, markLearned]);

  const idx = practiceSegments.findIndex((s) => s.id === segment.id);
  const prevSeg = idx > 0 ? practiceSegments[idx - 1] : null;
  const nextSeg = idx >= 0 && idx < practiceSegments.length - 1 ? practiceSegments[idx + 1] : null;

  const toggleImmersive = React.useCallback(() => {
    setImmersive((cur) => {
      const next = !cur;
      if (next && stageRef.current && document.fullscreenEnabled) {
        stageRef.current.requestFullscreen?.().catch(() => null);
      } else if (!next && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => null);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowLeft":
          if (prevSeg) {
            e.preventDefault();
            onNavigate(prevSeg.id);
          }
          break;
        case "ArrowRight":
          if (nextSeg) {
            e.preventDefault();
            onNavigate(nextSeg.id);
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleImmersive();
          break;
        case "Escape":
          if (immersive) {
            e.preventDefault();
            setImmersive(false);
          }
          break;
        case " ":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "m":
        case "M":
          setMirror((m) => !m);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevSeg, nextSeg, immersive, onNavigate, toggleImmersive]);

  React.useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const difficulty = clampDifficulty(segment.difficulty);
  const isPracticeSeg = practiceSegments.some((s) => s.id === segment.id);
  const segLearned = isLearned(segment.id);
  const allLearned =
    practiceSegments.length > 0 && practiceSegments.every((s) => isLearned(s.id));
  const demoReady = lessonIsDemoReady(lesson);
  const segmentTotal = Math.max(practiceSegments.length, 1);
  const currentOrder = idx >= 0 ? idx + 1 : 1;
  const headingText = `${practiceSegments.length} 段 • ${currentOrder}/${segmentTotal}`;

  return (
    <main
      ref={stageRef}
      className="fixed inset-0 overflow-hidden bg-[#050505] text-white selection:bg-[#ff0055] selection:text-white"
    >
      <DotFieldBackground mouseRef={mouseRef} />

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Michroma&family=Noto+Sans+SC:wght@500;700;900&display=swap");
        body {
          font-family: "Michroma", "Noto Sans SC", sans-serif;
          background: #050505;
          cursor: ${showCustomCursor ? "none" : "auto"};
        }
        @keyframes dp-step-hint-in {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .dp-step-hint {
          animation: dp-step-hint-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      {showCustomCursor ? (
        <>
          <div
            className="pointer-events-none fixed left-0 top-0 z-[120] h-3 w-3 rounded-full bg-[#ccff00] mix-blend-difference"
            style={{ transform: `translate(${mousePos.x - 6}px, ${mousePos.y - 6}px)` }}
          />
          <div
            className="pointer-events-none fixed left-0 top-0 z-[119] h-10 w-10 rounded-full border border-[#00f3ff]/70"
            style={{ transform: `translate(${mousePos.x - 20}px, ${mousePos.y - 20}px)` }}
          />
        </>
      ) : null}

      <div className="relative z-10 flex h-full">
        <section className="relative flex flex-1 items-center justify-center px-5 lg:px-6">
          {!immersive ? (
            <Link
              href={`/lesson/${lesson.id}`}
              className="absolute left-5 top-5 z-30 inline-flex max-w-[min(48vw,560px)] items-center gap-2 rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-sm font-medium text-white/82 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="truncate">{`返回 ${lesson.title}`}</span>
            </Link>
          ) : null}

          {prevSeg ? (
            <button
              type="button"
              onClick={() => onNavigate(prevSeg.id)}
              className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/70 transition hover:bg-black/55 hover:text-white"
              aria-label={`上一段 ${prevSeg.section_label}`}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}

          {nextSeg ? (
            <button
              type="button"
              onClick={() => onNavigate(nextSeg.id)}
              className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/70 transition hover:bg-black/55 hover:text-white"
              aria-label={`下一段 ${nextSeg.section_label}`}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}

          <div
            className="relative w-[min(34vw,520px)] min-w-[300px] overflow-hidden rounded-[26px] border border-white/15 bg-black/70 transition-all duration-300"
            style={{
              aspectRatio: "9/16",
              maxHeight: immersive ? "100vh" : "calc(100vh - 130px)",
              borderRadius: immersive ? "0px" : "26px",
              boxShadow: immersive ? "none" : "0 22px 60px rgba(0,0,0,0.66)",
              cursor: magnifier ? "none" : undefined,
            }}
            onMouseMove={(e) => {
              if (!magnifier) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setLensPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                w: rect.width,
                h: rect.height,
                visible: true,
              });
            }}
            onMouseLeave={() => setLensPos((p) => ({ ...p, visible: false }))}
            onWheel={(e) => {
              if (!magnifier) return;
              setMagnifierZoom((z) =>
                Math.min(MAG_ZOOM_MAX, Math.max(MAG_ZOOM_MIN, +(z - e.deltaY * 0.003).toFixed(1)))
              );
            }}
          >
            <video
              ref={videoRef}
              src={segment.clip_url}
              poster={segment.thumbnail}
              loop
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: mirror ? "scaleX(-1)" : undefined }}
              onClick={() => setPlaying((p) => !p)}
            />

            <XuangeGuideOverlay videoRef={videoRef} particleUrl={segment.particle_url} mirror={mirror} />

            {magnifier ? (
              <MagnifierLens
                videoRef={videoRef}
                mirror={mirror}
                pos={lensPos}
                zoom={magnifierZoom}
                follow={magnifierFollow}
                poseDoc={poseDoc}
                partIdxs={BODY_PARTS[magnifierPart].idxs}
              />
            ) : null}

            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/95">
              {`${segment.section_label} · 第 ${segment.index + 1}`}
            </div>

            <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/95">
              {"★".repeat(difficulty)}
              <span className="text-white/28">{"★".repeat(5 - difficulty)}</span>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 scale-[0.8] origin-top md:scale-[0.86]">
              <BeatCounterBadge
                currentBeat={currentBeat}
                beatCount={segment.beat_count}
                className="border-white/18 bg-[rgba(115,115,122,0.58)] shadow-[0_20px_45px_rgba(0,0,0,0.35)]"
              />
            </div>

            {currentStep ? (
              <div
                key={`${segment.id}-${currentStep.beats}`}
                className="dp-step-hint pointer-events-none absolute left-1/2 top-[112px] z-20 w-[88%] -translate-x-1/2 text-center text-[18px] font-semibold leading-snug text-white md:text-[20px]"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.95)" }}
              >
                {currentStep.content}
              </div>
            ) : null}

            {immersive ? (
              <div className="pointer-events-none absolute bottom-6 right-6 rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-[11px] text-white/70">
                ←/→ 切段 · Space 暂停 · M 镜像 · Esc 退出
              </div>
            ) : null}
          </div>

          {!immersive ? (
            <KeyframeScrubber
              key={segment.id}
              videoRef={videoRef}
              clipUrl={segment.clip_url}
              durationHint={segment.duration}
              beatCount={segment.beat_count}
              beatCues={segment.teaching?.beat_cues ?? []}
              steps={segment.teaching?.steps ?? []}
              thumbnail={segment.thumbnail}
              mirror={mirror}
              className="absolute bottom-[64px] left-1/2 z-30 w-[min(34vw,520px)] min-w-[300px] -translate-x-1/2"
            />
          ) : null}

          <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 shadow-[0_14px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90"
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
                setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
              }}
              className="rounded-full bg-white/8 px-3 py-1 text-[12px] font-semibold tracking-[0.2em] text-white/90 transition hover:bg-white/16"
            >
              {speed}x
            </button>

            <button
              type="button"
              onClick={toggleImmersive}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                immersive ? "bg-amber-400/30 text-amber-100" : "bg-white/8 text-white/70 hover:bg-white/16"
              }`}
              aria-label={immersive ? "退出全屏" : "全屏播放"}
              title={immersive ? "退出全屏 (Esc)" : "全屏 (F)"}
            >
              {immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setMirror((m) => !m)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                mirror ? "bg-fuchsia-500/30 text-fuchsia-100" : "bg-white/8 text-white/70 hover:bg-white/16"
              }`}
              aria-label="镜像"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setMagnifier((v) => !v)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                magnifier ? "bg-[#00f3ff]/30 text-[#00f3ff]" : "bg-white/8 text-white/70 hover:bg-white/16"
              }`}
              aria-label="放大镜"
              title="动作放大镜"
            >
              <Search className="h-3.5 w-3.5" />
            </button>

            {magnifier ? (
              <div className="flex items-center gap-0.5 rounded-full bg-[#00f3ff]/15 px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => setMagnifierZoom((z) => Math.max(MAG_ZOOM_MIN, +(z - 0.2).toFixed(1)))}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] leading-none text-[#00f3ff] transition hover:bg-[#00f3ff]/25"
                  aria-label="缩小"
                >
                  −
                </button>
                <span
                  className="min-w-[36px] text-center text-[12px] font-semibold text-[#00f3ff]"
                  title="也可在画面上滚动鼠标滚轮调节"
                >
                  {magnifierZoom.toFixed(1)}×
                </span>
                <button
                  type="button"
                  onClick={() => setMagnifierZoom((z) => Math.min(MAG_ZOOM_MAX, +(z + 0.2).toFixed(1)))}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] leading-none text-[#00f3ff] transition hover:bg-[#00f3ff]/25"
                  aria-label="放大"
                >
                  +
                </button>
              </div>
            ) : null}

            {magnifier ? (
              <button
                type="button"
                onClick={() => setMagnifierFollow((v) => !v)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                  magnifierFollow
                    ? "bg-[#ccff00]/20 text-[#ccff00] hover:bg-[#ccff00]/30"
                    : "bg-white/8 text-white/70 hover:bg-white/16"
                }`}
                title={magnifierFollow ? "自动跟随舞者(点击切手动)" : "手动跟随鼠标(点击切自动)"}
              >
                <Crosshair className="h-3 w-3" />
                {magnifierFollow ? "跟随" : "手动"}
              </button>
            ) : null}

            {magnifier && magnifierFollow ? (
              <button
                type="button"
                onClick={() => {
                  const next = (magnifierPart + 1) % BODY_PARTS.length;
                  setMagnifierPart(next);
                  setMagnifierZoom(BODY_PARTS[next].zoom);
                }}
                className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85 transition hover:bg-white/16"
                title="切换跟随部位"
              >
                {BODY_PARTS[magnifierPart].label}
              </button>
            ) : null}
          </div>
        </section>

        <aside
          className={`relative w-[350px] border-l border-white/10 bg-black/72 transition-all duration-300 ${
            immersive ? "hidden" : "flex"
          } flex-col`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_80%,rgba(255,0,85,0.12),transparent_45%)]" />

          <div className="relative z-10 flex h-full flex-col">
            <div className="px-6 pb-3 pt-8">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-medium tracking-[0.22em] text-white/42">动作段落</div>
                <div className="text-[11px] font-semibold tracking-[0.16em] text-emerald-300/80">
                  已学 {learnedCount}/{total || practiceSegments.length}
                </div>
              </div>
              <div className="mt-1 text-[28px] font-black leading-none text-white">{headingText}</div>
            </div>

            <div className="px-5 pb-3">
              <div className="overflow-hidden rounded-2xl border border-[#00f3ff]/30 bg-black/40 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setTeachingExpanded((p) => !p)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                  aria-expanded={teachingExpanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
                      <span className="rounded-full border border-[#ccff00]/40 bg-[#ccff00]/15 px-2 py-0.5 font-bold text-[#ccff00]">
                        AI 图文教学
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-white/75">
                      {segment.teaching?.status === "ready"
                        ? segment.teaching.summary
                        : segment.teaching?.status === "pending"
                          ? "教学生成中..."
                          : segment.teaching?.status === "failed"
                            ? "教学未就绪（可去课程页重新生成）"
                            : "暂无教学内容"}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-white/65 transition-transform",
                      teachingExpanded && "rotate-180"
                    )}
                  />
                </button>
                {teachingExpanded && segment.teaching ? (
                  <div className="border-t border-white/10 p-4">
                    <TeachingPanelKpop
                      segment={segment}
                      currentBeat={currentBeat}
                      autoScrollSteps
                      className="border-0 bg-transparent p-0 shadow-none"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 px-6 pb-3">
              <button
                type="button"
                onClick={() => prevSeg && onNavigate(prevSeg.id)}
                disabled={!prevSeg}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 text-[13px] text-white/75 transition hover:bg-white/10 disabled:opacity-35"
              >
                <ChevronUp className="h-4 w-4" />
                上一段
              </button>
              <button
                type="button"
                onClick={() => nextSeg && onNavigate(nextSeg.id)}
                disabled={!nextSeg}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 text-[13px] text-white/75 transition hover:bg-white/10 disabled:opacity-35"
              >
                <ChevronDown className="h-4 w-4" />
                下一段
              </button>
            </div>

            <div className="px-6 pb-3">
              <button
                type="button"
                onClick={() => isPracticeSeg && toggleLearned(segment.id)}
                disabled={!isPracticeSeg}
                className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-semibold transition disabled:opacity-40 ${
                  segLearned
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                    : "border-white/12 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                <Check className="h-4 w-4" />
                {segLearned ? "已学会" : "标记这段学会"}
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-5">
              {practiceSegments.map((s) => {
                const active = s.id === segment.id;
                const rowDifficulty = clampDifficulty(s.difficulty);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigate(s.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-white/25 bg-black/68 shadow-[0_14px_40px_rgba(0,0,0,0.5)]"
                        : "border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div
                      className="h-12 w-12 flex-shrink-0 rounded-xl bg-cover bg-center"
                      style={{ backgroundImage: `url("${s.thumbnail}")` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[17px] font-semibold ${active ? "text-white" : "text-white/82"}`}>
                        {`${s.section_label} · 第 ${s.index + 1}`}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-white/48">
                        <span>{s.duration.toFixed(1)}s</span>
                        <span>·</span>
                        <span>{"★".repeat(rowDifficulty)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-white/10 p-5">
              {demoReady && allLearned ? (
                <Link
                  href={`/lesson/${lesson.id}/tracking-desktop`}
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(157,78,221,0.32)] transition hover:brightness-110"
                >
                  <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />
                  <span className="font-semibold text-white">整支跟拍挑战</span>
                </Link>
              ) : (
                <div
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/45"
                  title={!demoReady ? "缺少切片或姿态数据" : "先学完所有动作卡再来挑战"}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {!demoReady
                      ? "整支跟拍挑战未就绪"
                      : `先学完所有动作卡 (${learnedCount}/${total || practiceSegments.length})`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default DesktopPlayer;
