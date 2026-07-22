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

      // 双虚线骨架:每根骨头 = 两条平行虚线(沿骨骼方向左右各偏移),
      // 中空管状轮廓比单实线更清晰,虚线让画面不被遮死。
      const HALF_GAP = 5; // 双线各偏移 5px(管径 10px)
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([10, 7]);

      const drawBonePass = (strokeStyle: string, lineWidth: number) => {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        for (const [a, b] of POSE_CONNECTIONS) {
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
          // 单位法向量:垂直于骨骼方向
          const nx = (-dy / len) * HALF_GAP;
          const ny = (dx / len) * HALF_GAP;
          ctx.beginPath();
          ctx.moveTo(x1 + nx, y1 + ny);
          ctx.lineTo(x2 + nx, y2 + ny);
          ctx.moveTo(x1 - nx, y1 - ny);
          ctx.lineTo(x2 - nx, y2 - ny);
          ctx.stroke();
        }
      };

      // 底层深色描边托底(亮背景可读),上层纯白双虚线
      drawBonePass("rgba(0,0,0,0.4)", 6.5);
      drawBonePass("rgba(255,255,255,0.95)", 4);

      ctx.setLineDash([]);

      // 关节点:空心白圈(与中空管状骨骼呼应,不糊住关节)
      for (const idx of DRAWN_KEYPOINTS) {
        const p = pts[idx];
        if (!p || p.visibility < MIN_VIS) continue;
        const x = px(p);
        const y = py(p);
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 5.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 3.5;
        ctx.stroke();
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
