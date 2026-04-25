"use client";

// Background Pulse: 每次命中,镜子整块背景色瞬闪(黄/粉/金),340ms 淡出
// 不挡视频, 用 mix-blend-mode: overlay 做色彩 infusion

import * as React from "react";
import type { HitLevel } from "./HitEffects";

const COLOR_BY_LEVEL: Record<HitLevel, string> = {
  soft: "rgba(255, 235, 120, 0.5)",   // 黄
  mid: "rgba(255, 130, 180, 0.55)",   // 粉
  strong: "rgba(255, 200, 80, 0.65)", // 金
  mega: "rgba(255, 100, 240, 0.75)",  // 紫粉 (combo milestone 超炫)
};

export default function BackgroundPulseOverlay({
  hitToken,
  level = "strong",
}: {
  hitToken: number;
  level?: HitLevel;
}) {
  if (hitToken <= 0) return null;
  const bg = COLOR_BY_LEVEL[level];
  return (
    <div
      key={`bgpulse-${hitToken}`}
      className="hit-bg-pulse pointer-events-none absolute inset-0 z-40"
      style={{
        background: bg,
        mixBlendMode: "overlay",
      }}
      aria-hidden
    />
  );
}
