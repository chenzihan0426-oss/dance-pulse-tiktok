"use client";

import * as React from "react";

import type { TeacherFrame } from "@/lib/pose/scoring";

type SkeletonTuning = {
  scale: number;
  offsetX: number;
  offsetY: number;
  skeletonScale?: number;
  skeletonOffsetX?: number;
  skeletonOffsetY?: number;
  skeletonIntensity?: number;
};

type DrawPoint = {
  x: number;
  y: number;
  vis: number;
};

type GlowColor = {
  rail: string;
  core: string;
  halo: string;
};

const DEFAULT_SOURCE_ASPECT = 9 / 16;
const MIN_VIS = 0.06;
const SMOOTHING = 0.42;
const SKELETON_MAX_DPR = 1.25;
const SKELETON_TARGET_FPS = 30;

const EDGES: Array<[number, number]> = [
  [0, 11],
  [0, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
  [15, 19],
  [16, 20],
];

const ACCENT_POINTS = new Set([15, 16, 27, 28, 31, 32]);
const HEAD_POINTS = [0, 1, 2, 3, 4, 5, 6];

function nearestFrame(frames: TeacherFrame[], tSec: number): TeacherFrame | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < tSec) lo = mid + 1;
    else hi = mid;
  }
  const cur = frames[lo];
  const prev = lo > 0 ? frames[lo - 1] : null;
  return prev && Math.abs(prev.t - tSec) < Math.abs(cur.t - tSec) ? prev : cur;
}

function normalizedVisibility(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.86;
  return Math.max(0.16, Math.min(1, value));
}

function toCanvasPoint(
  point: TeacherFrame["keypoints"][number],
  width: number,
  height: number,
  tuning: SkeletonTuning,
  sourceAspect: number,
): DrawPoint {
  const containerAspect = width / height;
  let fitX = 1;
  let fitY = 1;
  if (sourceAspect > containerAspect) {
    fitY = containerAspect / sourceAspect;
  } else {
    fitX = sourceAspect / containerAspect;
  }

  const skeletonScale = tuning.skeletonScale ?? 1.08;
  const nx =
    (point.x - 0.5) * 2 * fitX * tuning.scale * skeletonScale +
    tuning.offsetX +
    (tuning.skeletonOffsetX ?? 0);
  const ny =
    (point.y - 0.5) * 2 * fitY * tuning.scale * skeletonScale +
    tuning.offsetY +
    (tuning.skeletonOffsetY ?? 0);
  return {
    x: ((nx + 1) / 2) * width,
    y: ((ny + 1) / 2) * height,
    vis: normalizedVisibility(point.visibility),
  };
}

function edgeColor(from: number, to: number): GlowColor {
  const arm = from === 11 || from === 12 || from === 13 || from === 14 || to === 15 || to === 16;
  const leg = from === 23 || from === 24 || from === 25 || from === 26 || to === 27 || to === 28 || to === 31 || to === 32;
  if (arm) {
    return {
      rail: "rgba(190, 220, 255,",
      core: "rgba(255, 255, 255,",
      halo: "rgba(120, 155, 255,",
    };
  }
  if (leg) {
    return {
      rail: "rgba(66, 235, 255,",
      core: "rgba(180, 255, 226,",
      halo: "rgba(0, 210, 255,",
    };
  }
  return {
    rail: "rgba(165, 255, 218,",
    core: "rgba(222, 255, 246,",
    halo: "rgba(58, 255, 196,",
  };
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
) {
  ctx.fillStyle = `${color} ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawDoubleRail(
  ctx: CanvasRenderingContext2D,
  a: DrawPoint,
  b: DrawPoint,
  from: number,
  to: number,
  dpr: number,
  intensity: number,
) {
  const alpha = Math.min(1, Math.max(0, ((a.vis + b.vis) / 2) * 1.2));
  if (alpha < MIN_VIS) return;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 2) return;
  const nx = -dy / length;
  const ny = dx / length;
  const color = edgeColor(from, to);
  const railGap = Math.max(5, Math.min(15, length * 0.07)) * dpr;
  const dotStep = 8.2 * dpr;
  const dotRadius = Math.max(1.25, 1.85 * dpr * intensity);
  const dotCount = Math.max(3, Math.floor(length / dotStep));

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = `${color.halo} ${0.52 * alpha * intensity})`;
  ctx.shadowBlur = 18 * dpr * intensity;
  ctx.lineWidth = 11 * dpr;
  ctx.strokeStyle = `${color.halo} ${0.12 * alpha * intensity})`;
  for (const side of [-1, 1]) {
    const ox = nx * railGap * side;
    const oy = ny * railGap * side;
    ctx.beginPath();
    ctx.moveTo(a.x + ox, a.y + oy);
    ctx.lineTo(b.x + ox, b.y + oy);
    ctx.stroke();
  }

  ctx.shadowColor = `${color.halo} ${0.46 * alpha * intensity})`;
  ctx.shadowBlur = 9 * dpr * intensity;
  ctx.strokeStyle = `${color.core} ${0.24 * alpha})`;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.shadowBlur = 8 * dpr * intensity;
  ctx.shadowColor = `${color.halo} ${0.78 * alpha * intensity})`;
  for (const side of [-1, 1]) {
    const ox = nx * railGap * side;
    const oy = ny * railGap * side;
    for (let i = 0; i <= dotCount; i += 1) {
      const t = i / dotCount;
      const taper = Math.sin(Math.PI * t);
      const radius = dotRadius * (0.82 + taper * 0.32);
      const x = a.x + dx * t + ox;
      const y = a.y + dy * t + oy;
      const useCore = i % 4 === 0;
      drawDot(ctx, x, y, useCore ? radius * 1.15 : radius, useCore ? color.core : color.rail, alpha * (useCore ? 0.95 : 0.72));
    }
  }
}

function drawHeadRing(ctx: CanvasRenderingContext2D, points: DrawPoint[], dpr: number, intensity: number) {
  const visible = HEAD_POINTS.map((index) => points[index]).filter((point) => point && point.vis >= MIN_VIS);
  const shoulders = [points[11], points[12]].filter((point) => point && point.vis >= MIN_VIS);
  if (!visible.length || shoulders.length < 2) return;
  const cx = visible.reduce((sum, point) => sum + point.x, 0) / visible.length;
  const cy = visible.reduce((sum, point) => sum + point.y, 0) / visible.length;
  const shoulderSpan = Math.hypot(shoulders[0].x - shoulders[1].x, shoulders[0].y - shoulders[1].y);
  const radius = Math.max(15 * dpr, shoulderSpan * 0.34);
  const dots = 34;

  ctx.shadowBlur = 12 * dpr * intensity;
  ctx.shadowColor = `rgba(160, 195, 255, ${0.8 * intensity})`;
  for (let i = 0; i < dots; i += 1) {
    const angle = (i / dots) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 1.05;
    drawDot(ctx, x, y, 1.75 * dpr, "rgba(230, 246, 255,", i % 4 === 0 ? 0.95 : 0.68);
  }
}

function drawJoint(
  ctx: CanvasRenderingContext2D,
  point: DrawPoint,
  index: number,
  now: number,
  dpr: number,
  intensity: number,
) {
  if (point.vis < MIN_VIS) return;
  const alpha = Math.min(1, point.vis * 1.25);
  const accent = ACCENT_POINTS.has(index);
  const radius = (accent ? 8.5 : 6.2) * dpr * (0.92 + intensity * 0.16);

  ctx.shadowBlur = (accent ? 24 : 17) * dpr * intensity;
  ctx.shadowColor = accent ? `rgba(255, 234, 0, ${alpha})` : `rgba(128, 190, 255, ${alpha})`;

  const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 1.6);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  gradient.addColorStop(0.34, accent ? `rgba(255, 234, 0, ${0.95 * alpha})` : `rgba(122, 188, 255, ${0.92 * alpha})`);
  gradient.addColorStop(1, accent ? "rgba(255, 61, 214, 0)" : "rgba(0, 245, 255, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 1.6, 0, Math.PI * 2);
  ctx.fill();

  const sparkleAngle = (index * 2.399 + Math.floor(now / 380) * 0.35) % (Math.PI * 2);
  const sparkle = (accent ? 9 : 6) * dpr;
  const px = point.x + Math.cos(sparkleAngle) * sparkle;
  const py = point.y + Math.sin(sparkleAngle) * sparkle;
  ctx.fillStyle = accent ? `rgba(255, 61, 214, ${0.78 * alpha})` : `rgba(102, 255, 204, ${0.74 * alpha})`;
  ctx.beginPath();
  ctx.arc(px, py, (accent ? 2.4 : 1.8) * dpr, 0, Math.PI * 2);
  ctx.fill();
}

export default function AdaptiveSkeletonOverlay({
  framesRef,
  currentTimeSec,
  currentTimeRef,
  tuning,
  mirror = true,
  active = true,
  sourceAspect = DEFAULT_SOURCE_ASPECT,
  className,
}: {
  framesRef: React.MutableRefObject<TeacherFrame[]>;
  currentTimeSec?: number;
  currentTimeRef?: React.MutableRefObject<number>;
  tuning: SkeletonTuning;
  mirror?: boolean;
  active?: boolean;
  sourceAspect?: number;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const timeRef = React.useRef(currentTimeSec ?? 0);
  const tuningRef = React.useRef(tuning);
  const sourceAspectRef = React.useRef(sourceAspect);
  const previousPointsRef = React.useRef<DrawPoint[]>([]);

  React.useEffect(() => {
    if (typeof currentTimeSec === "number") timeRef.current = currentTimeSec;
  }, [currentTimeSec]);

  React.useEffect(() => {
    tuningRef.current = tuning;
  }, [tuning]);

  React.useEffect(() => {
    sourceAspectRef.current =
      Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : DEFAULT_SOURCE_ASPECT;
  }, [sourceAspect]);

  React.useEffect(() => {
    if (!active) return;
    let raf = 0;
    let disposed = false;
    let lastDrawMs = 0;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(tick);
        return;
      }

      if (now - lastDrawMs < 1000 / SKELETON_TARGET_FPS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastDrawMs = now;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, SKELETON_MAX_DPR);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        previousPointsRef.current = [];
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, width, height);

      const frame = nearestFrame(framesRef.current, currentTimeRef?.current ?? timeRef.current);
      if (frame?.keypoints?.length) {
        const target = frame.keypoints.map((point) =>
          toCanvasPoint(point, width, height, tuningRef.current, sourceAspectRef.current)
        );
        const previous = previousPointsRef.current;
        const points = target.map((point, index) => {
          const prev = previous[index];
          if (!prev) return point;
          return {
            x: prev.x + (point.x - prev.x) * SMOOTHING,
            y: prev.y + (point.y - prev.y) * SMOOTHING,
            vis: point.vis,
          };
        });
        previousPointsRef.current = points;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const intensity = Math.max(0.55, Math.min(1.65, tuningRef.current.skeletonIntensity ?? 1.15));
        for (const [from, to] of EDGES) {
          const a = points[from];
          const b = points[to];
          if (a && b) drawDoubleRail(ctx, a, b, from, to, dpr, intensity);
        }
        drawHeadRing(ctx, points, dpr, intensity);
        points.forEach((point, index) => drawJoint(ctx, point, index, now, dpr, intensity));
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [active, currentTimeRef, framesRef]);

  return (
    <canvas
      ref={canvasRef}
      data-adaptive-skeleton="true"
      className={className ?? "pointer-events-none absolute inset-0 z-[24] h-full w-full"}
      style={{ transform: mirror ? "scaleX(-1)" : "none" }}
      aria-hidden
    />
  );
}
