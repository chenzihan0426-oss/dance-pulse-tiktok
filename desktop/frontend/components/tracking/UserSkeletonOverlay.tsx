"use client";

// 在摄像头画面上绘制用户实时骨架(关键点由 useSessionScoring 提供)。
// 摘取自 feature/feedback 分支;按 hotspotRef 高亮当前最差关节
// (粉红描边 + 脉动圆点)。

import * as React from "react";

import type { LiveHotspot } from "@/lib/feedback/liveHotspot";
import { drawSkeleton } from "@/lib/pose/skeleton";
import type { Keypoint } from "@/lib/pose/types";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement>;
  kptsRef: React.MutableRefObject<Keypoint[] | null>;
  hotspotRef?: React.MutableRefObject<LiveHotspot | null>;
  mirror?: boolean;
  active?: boolean;
  className?: string;
};

export default function UserSkeletonOverlay({
  videoRef,
  kptsRef,
  hotspotRef,
  mirror = true,
  active = true,
  className,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const mirrorRef = React.useRef(mirror);
  React.useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);

  React.useEffect(() => {
    if (!active) return;
    let rafId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || video.readyState < 2) return;

      const vw = video.videoWidth || video.clientWidth;
      const vh = video.videoHeight || video.clientHeight;
      if (!vw || !vh) return;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const kp = kptsRef.current;
      if (!kp || kp.length < 17) return;

      const doMirror = mirrorRef.current;
      drawSkeleton(ctx, kp, canvas.width, canvas.height, {
        color: "#ccff00",
        width: 5,
        pointRadius: 6,
        alpha: 0.95,
        mirror: doMirror,
        minVisibility: 0.35,
      });

      // 最差关节高亮:粉红描边 + 脉动圆点(与 feature/feedback 同款)
      const hot = hotspotRef?.current;
      if (!hot) return;

      const px = (nx: number) => (doMirror ? 1 - nx : nx) * canvas.width;
      const py = (ny: number) => ny * canvas.height;
      const visOk = (i: number) => (kp[i]?.[2] ?? 0) >= 0.35;

      const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255, 92, 138, 0.95)";
      ctx.fillStyle = "rgba(255, 92, 138, 0.95)";
      ctx.lineWidth = 7;
      ctx.shadowColor = "rgba(255, 0, 85, 0.65)";
      ctx.shadowBlur = 12;

      for (const [a, b] of hot.edges) {
        if (!visOk(a) || !visOk(b) || !kp[a] || !kp[b]) continue;
        ctx.beginPath();
        ctx.moveTo(px(kp[a][0]), py(kp[a][1]));
        ctx.lineTo(px(kp[b][0]), py(kp[b][1]));
        ctx.stroke();
      }

      const v = hot.vertex;
      if (visOk(v) && kp[v]) {
        const r = 10 * pulse;
        ctx.beginPath();
        ctx.arc(px(kp[v][0]), py(kp[v][1]), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.stroke();
      }
      ctx.restore();
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "pointer-events-none absolute inset-0 z-[30] h-full w-full object-cover"}
      aria-hidden
    />
  );
}
