"use client";

// Motion Trail: 用户手腕移动时后面留金色光轨
// 父组件维护一个 wristHistoryRef (最近 N 帧左右手腕位置),
// 本组件每帧 RAF 读取并画到 canvas, 越旧的点越淡

import * as React from "react";

export type WristFrame = {
  lx: number; ly: number; lvis: number;
  rx: number; ry: number; rvis: number;
  t: number;
};

const HISTORY_LIFE_MS = 420; // 点存活时间
const MIN_VIS = 0.4;

export default function MotionTrailOverlay({
  historyRef,
  mirror = true,
}: {
  historyRef: React.MutableRefObject<WristFrame[]>;
  mirror?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    let raf = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const c = canvasRef.current;
      if (!c) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, Math.floor(rect.width * dpr));
      const ch = Math.max(1, Math.floor(rect.height * dpr));
      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }
      const ctx = c.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, cw, ch);

      const history = historyRef.current;
      const now = performance.now();
      // 丢弃过期帧
      while (history.length && now - history[0].t > HISTORY_LIFE_MS) {
        history.shift();
      }
      if (history.length < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const drawTrail = (getXY: (f: WristFrame) => [number, number, number]) => {
        const points = history.map((f) => {
          const [nx, ny, vis] = getXY(f);
          const x = (mirror ? 1 - nx : nx) * cw;
          const y = ny * ch;
          const age = (now - f.t) / HISTORY_LIFE_MS; // 0 = new, 1 = dying
          const alpha = Math.max(0, (1 - age)) * Math.min(1, vis * 1.4);
          return { x, y, alpha };
        });
        // 连线带 gradient alpha
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const avgA = (a.alpha + b.alpha) / 2;
          if (avgA <= 0.02) continue;
          ctx.strokeStyle = `rgba(255, 215, 120, ${avgA * 0.85})`;
          ctx.lineWidth = Math.max(4, dpr * 6 * avgA);
          ctx.shadowColor = "rgba(255, 200, 80, 0.9)";
          ctx.shadowBlur = 18 * dpr;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        // 末端高亮圆
        const last = points[points.length - 1];
        if (last.alpha > 0.1) {
          ctx.shadowBlur = 24 * dpr;
          ctx.fillStyle = `rgba(255, 240, 180, ${last.alpha})`;
          ctx.beginPath();
          ctx.arc(last.x, last.y, Math.max(5, dpr * 7), 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // 左右手腕分别画 (只画可见的)
      const lastVisLeft = history[history.length - 1].lvis;
      const lastVisRight = history[history.length - 1].rvis;
      if (lastVisLeft >= MIN_VIS) {
        drawTrail((f) => [f.lx, f.ly, f.lvis]);
      }
      if (lastVisRight >= MIN_VIS) {
        drawTrail((f) => [f.rx, f.ry, f.rvis]);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [historyRef, mirror]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      aria-hidden
    />
  );
}
