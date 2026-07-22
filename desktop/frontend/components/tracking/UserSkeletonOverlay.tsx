"use client";

// 在摄像头画面上绘制用户实时骨架(关键点由 useSessionScoring 提供)。
// 摘取自 feature/feedback 分支的镜头跟踪部分;热点高亮(依赖整套
// feedback 库)未随迁,保持功能边界干净。

import * as React from "react";

import { drawSkeleton } from "@/lib/pose/skeleton";
import type { Keypoint } from "@/lib/pose/types";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement>;
  kptsRef: React.MutableRefObject<Keypoint[] | null>;
  mirror?: boolean;
  active?: boolean;
  className?: string;
};

export default function UserSkeletonOverlay({
  videoRef,
  kptsRef,
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

      drawSkeleton(ctx, kp, canvas.width, canvas.height, {
        color: "#ccff00",
        width: 5,
        pointRadius: 6,
        alpha: 0.95,
        mirror: mirrorRef.current,
        minVisibility: 0.35,
      });
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
