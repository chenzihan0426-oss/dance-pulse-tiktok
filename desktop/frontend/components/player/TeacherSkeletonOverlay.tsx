"use client";

// 卡片学习页的老师骨架叠加:白色、粗细均匀、随视频逐帧跟踪。
// 数据来自已加载的 poseDoc(与放大镜共用,不重复请求)。
// object-cover 坐标映射与镜像处理和 MagnifierLens 保持一致。

import * as React from "react";

import { POSE_CONNECTIONS, DRAWN_KEYPOINTS } from "@/lib/pose/skeleton";

type PoseKp = { x: number; y: number; visibility: number };
type PoseFullFrame = { t: number; points: PoseKp[] | null };
type PoseFullDoc = { frames: PoseFullFrame[] };

const MIN_VIS = 0.35;

// 按时间二分找最近帧(与 DesktopPlayer.interpCenter 同思路,画骨架用最近帧即可)
function frameAt(frames: PoseFullFrame[], tSec: number): PoseFullFrame | null {
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
  if (prev && Math.abs(prev.t - tSec) < Math.abs(cur.t - tSec)) return prev;
  return cur;
}

export function TeacherSkeletonOverlay({
  videoRef,
  poseDoc,
  mirror,
  visible,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  poseDoc: PoseFullDoc | null;
  mirror: boolean;
  visible: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const poseRef = React.useRef(poseDoc);
  poseRef.current = poseDoc;
  const mirrorRef = React.useRef(mirror);
  mirrorRef.current = mirror;
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;
  // 预分配的画布尺寸缓存(ResizeObserver 更新,避免每帧 getBoundingClientRect)
  const sizeRef = React.useRef({ w: 0, h: 0 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const parent = canvas.parentElement;
    const syncSize = () => {
      const rect = (parent ?? canvas).getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(parent ?? canvas);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { w: cw, h: ch } = sizeRef.current;
      ctx.clearRect(0, 0, cw, ch);

      if (!visibleRef.current) return;
      const doc = poseRef.current;
      if (!doc || video.videoWidth === 0) return;
      const frame = frameAt(doc.frames, video.currentTime);
      const pts = frame?.points;
      if (!pts) return;

      // object-cover 映射:归一化坐标 -> 容器像素
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(cw / vw, ch / vh);
      const offX = (cw - vw * scale) / 2;
      const offY = (ch - vh * scale) / 2;
      const px = (p: PoseKp) => {
        const x = p.x * vw * scale + offX;
        return mirrorRef.current ? cw - x : x;
      };
      const py = (p: PoseKp) => p.y * vh * scale + offY;

      // 珠链式点状骨架(样式对齐 pipeline/_xuange_pose_guide.py 的玄哥引导视觉):
      // 每根骨头 = 两排平行的小圆点链(偏移 ±HALF_GAP),关节 = 同心圆环+圆心点。
      // 头部单独画圆形珠链头圈(不用鼻-肩连线,三角形观感别扭)。
      const HALF_GAP = 4; // 双链各偏移 4px
      const DOT_R = 1.5; // 链上珠点半径(细珠,对齐玄哥引导的精细感)
      const DOT_SPACING = 7; // 珠点间距(px)

      const drawBeadLine = (
        x1: number, y1: number, x2: number, y2: number,
        r: number, fill: string
      ) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const steps = Math.max(1, Math.round(len / DOT_SPACING));
        ctx.fillStyle = fill;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          ctx.beginPath();
          ctx.arc(x1 + dx * t, y1 + dy * t, r, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // 头部连线(鼻-肩)不画,由头圈替代
      const BODY_CONNECTIONS = POSE_CONNECTIONS.filter(([a, b]) => a !== 0 && b !== 0);

      const drawBonesPass = (r: number, fill: string) => {
        for (const [a, b] of BODY_CONNECTIONS) {
          const pa = pts[a];
          const pb = pts[b];
          if (!pa || !pb || pa.visibility < MIN_VIS || pb.visibility < MIN_VIS) continue;
          const x1 = px(pa);
          const y1 = py(pa);
          const x2 = px(pb);
          const y2 = py(pb);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len < 1) continue;
          const nx = (-dy / len) * HALF_GAP;
          const ny = (dx / len) * HALF_GAP;
          drawBeadLine(x1 + nx, y1 + ny, x2 + nx, y2 + ny, r, fill);
          drawBeadLine(x1 - nx, y1 - ny, x2 - nx, y2 - ny, r, fill);
        }
      };

      // 圆形头圈:双耳中点为圆心,耳距推半径(耳不可见时退回鼻+肩宽估计)
      const drawHeadCircle = (r: number, fill: string) => {
        const nose = pts[0];
        const earL = pts[7];
        const earR = pts[8];
        let cx: number | null = null;
        let cy: number | null = null;
        let headR = 0;
        if (earL && earR && earL.visibility >= MIN_VIS && earR.visibility >= MIN_VIS) {
          cx = (px(earL) + px(earR)) / 2;
          cy = (py(earL) + py(earR)) / 2;
          headR = Math.max(14, Math.hypot(px(earR) - px(earL), py(earR) - py(earL)) * 0.85);
        } else if (nose && nose.visibility >= MIN_VIS) {
          const shL = pts[11];
          const shR = pts[12];
          const shoulderW =
            shL && shR && shL.visibility >= MIN_VIS && shR.visibility >= MIN_VIS
              ? Math.hypot(px(shR) - px(shL), py(shR) - py(shL))
              : 80;
          cx = px(nose);
          cy = py(nose) - shoulderW * 0.1;
          headR = Math.max(14, shoulderW * 0.32);
        }
        if (cx === null || cy === null) return;
        const steps = Math.max(10, Math.round((2 * Math.PI * headR) / DOT_SPACING));
        ctx.fillStyle = fill;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * headR, cy + Math.sin(a) * headR, r, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // 底层深色珠点托底(亮背景可读),上层纯白珠点
      drawBonesPass(DOT_R + 1, "rgba(0,0,0,0.4)");
      drawHeadCircle(DOT_R + 1, "rgba(0,0,0,0.4)");
      drawBonesPass(DOT_R, "rgba(255,255,255,0.95)");
      drawHeadCircle(DOT_R, "rgba(255,255,255,0.95)");

      // 关节:同心圆环 + 圆心点(鼻子跳过 —— 头部已有头圈)
      for (const idx of DRAWN_KEYPOINTS) {
        if (idx === 0) continue;
        const p = pts[idx];
        if (!p || p.visibility < MIN_VIS) continue;
        const x = px(p);
        const y = py(p);
        // 深色托底环
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 3;
        ctx.stroke();
        // 白色外环
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 圆心点
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden
    />
  );
}

export default TeacherSkeletonOverlay;
