"use client";

import * as React from "react";

/** 与首页一致的点阵粒子场：波浪漂移 + 鼠标斥力 */
export function ParticleFieldBackground({
  mouseRef,
}: {
  mouseRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let particles: Array<{
      originX: number;
      originY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      baseSize: number;
    }> = [];
    const spacing = 24;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const initCanvas = () => {
      canvas.width = width;
      canvas.height = height;
      particles = [];
      for (let x = -spacing; x < width + spacing; x += spacing) {
        for (let y = -spacing; y < height + spacing; y += spacing) {
          particles.push({ originX: x, originY: y, x, y, vx: 0, vy: 0, baseSize: 1.5 });
        }
      }
    };
    initCanvas();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      initCanvas();
    };
    window.addEventListener("resize", handleResize);

    let time = 0;
    const render = () => {
      time += 0.03;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const waveX = Math.sin(p.originY * 0.005 + time) * 12;
        const waveY = Math.sin(p.originX * 0.008 + time) * Math.cos(p.originY * 0.008 + time) * 20;

        const targetX = p.originX + waveX;
        const targetY = p.originY + waveY;

        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 180) {
          const force = Math.pow((180 - dist) / 180, 2);
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 4;
          p.vy -= Math.sin(angle) * force * 4;
        }

        p.vx += (targetX - p.x) * 0.04;
        p.vy += (targetY - p.y) * 0.04;
        p.vx *= 0.88;
        p.vy *= 0.88;
        p.x += p.vx;
        p.y += p.vy;

        const devX = p.x - p.originX;
        const devY = p.y - p.originY;
        const totalDev = Math.sqrt(devX * devX + devY * devY);

        let r: number;
        let g: number;
        let b: number;
        if (totalDev < 15) {
          const factor = totalDev / 15;
          r = Math.floor(255 * factor);
          g = Math.floor(243 * (1 - factor));
          b = Math.floor(255 + (85 - 255) * factor);
        } else {
          const factor = Math.min((totalDev - 15) / 25, 1);
          r = Math.floor(255 + (204 - 255) * factor);
          g = Math.floor(255 * factor);
          b = Math.floor(85 * (1 - factor));
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.baseSize + totalDev * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
}
