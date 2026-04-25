"use client";

// 烟火粒子层: 触发位置迸发一圈星星, 一瞬即逝
// 动画完全由 CSS keyframe 驱动, React 只负责在 trigger 来时插入 DOM,
// 在 duration 结束后再移除 —— 没有每帧 setState 的性能开销。

import * as React from "react";

export type FireworkTrigger = {
  id: number;
  x: number; // 百分比 0-100 (画面宽度)
  y: number; // 百分比 0-100 (画面高度)
  at: number; // performance.now() 时间戳
};

type Burst = FireworkTrigger & {
  particles: Array<{
    id: number;
    tx: number;
    ty: number;
    hue: number;
    size: number;
    delay: number;
  }>;
};

const PARTICLES_PER_BURST = 12;
const BURST_DURATION_MS = 500; // CSS animation 420ms + buffer

export function FireworksOverlay({ triggers }: { triggers: FireworkTrigger[] }) {
  const [active, setActive] = React.useState<Burst[]>([]);
  const seenRef = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    const fresh = triggers.filter((t) => !seenRef.current.has(t.id));
    if (!fresh.length) return;
    fresh.forEach((t) => seenRef.current.add(t.id));

    const items: Burst[] = fresh.map((t) => {
      const particles = Array.from({ length: PARTICLES_PER_BURST }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLES_PER_BURST + Math.random() * 0.4;
        const speed = 55 + Math.random() * 70;
        return {
          id: i,
          tx: Math.cos(angle) * speed,
          ty: Math.sin(angle) * speed - 12,
          hue: 40 + Math.random() * 30,
          size: 4 + Math.random() * 4,
          delay: Math.random() * 30,
        };
      });
      return { ...t, particles };
    });

    setActive((prev) => [...prev.slice(-6), ...items]);

    const timeouts = items.map((it) =>
      window.setTimeout(() => {
        setActive((prev) => prev.filter((p) => p.id !== it.id));
      }, BURST_DURATION_MS)
    );
    return () => { timeouts.forEach(window.clearTimeout); };
  }, [triggers]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {active.map((burst) => (
        <React.Fragment key={burst.id}>
          {/* 中心闪光(CSS 动画,自己淡出) */}
          <div
            className="dp-firework-flash absolute h-16 w-16 rounded-full"
            style={{
              left: `${burst.x}%`,
              top: `${burst.y}%`,
              background: "radial-gradient(circle, rgba(255,245,180,0.95) 0%, rgba(255,245,180,0) 60%)",
            }}
          />
          {/* 粒子(CSS 动画飞出 + 淡出) */}
          {burst.particles.map((p) => (
            <div
              key={p.id}
              className="dp-firework-particle absolute rounded-full"
              style={{
                left: `${burst.x}%`,
                top: `${burst.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                background: `hsl(${p.hue}, 95%, 65%)`,
                boxShadow: `0 0 ${p.size * 3}px hsl(${p.hue}, 95%, 70%)`,
                animationDelay: `${p.delay}ms`,
                ["--dp-tx" as any]: `${p.tx}px`,
                ["--dp-ty" as any]: `${p.ty}px`,
              }}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

export default FireworksOverlay;
