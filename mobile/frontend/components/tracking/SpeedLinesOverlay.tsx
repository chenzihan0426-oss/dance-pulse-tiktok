"use client";

// Speed Lines: 漫画打击感,从中心向外放射的多条白色线条
// 出现瞬间线条最长,快速向中心收缩并淡出 (360ms)

import * as React from "react";
import type { HitLevel } from "./HitEffects";

const LINE_COUNT_BY_LEVEL: Record<HitLevel, number> = {
  soft: 0,        // OK 不触发(太嘈杂)
  mid: 12,
  strong: 18,
  mega: 24,
};

export default function SpeedLinesOverlay({
  hitToken,
  level = "strong",
}: {
  hitToken: number;
  level?: HitLevel;
}) {
  const count = LINE_COUNT_BY_LEVEL[level];
  if (hitToken <= 0 || count === 0) return null;

  // 用 conic-gradient 重复条纹作 speed lines, mask 中心镂空
  const stripeAngle = 360 / count / 2; // 亮条宽度
  return (
    <div
      key={`speed-${hitToken}`}
      className="hit-speed-lines pointer-events-none absolute inset-0 z-45"
      style={{
        background: `repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0) 0deg ${stripeAngle * 2 - 1}deg, rgba(255,255,255,0.85) ${stripeAngle * 2 - 1}deg ${stripeAngle * 2}deg)`,
        WebkitMaskImage: "radial-gradient(ellipse 42% 42% at center, transparent 30%, black 100%)",
        maskImage: "radial-gradient(ellipse 42% 42% at center, transparent 30%, black 100%)",
        mixBlendMode: "screen",
      }}
      aria-hidden
    />
  );
}
