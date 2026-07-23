"use client";

// PC 跟拍页左栏专用: 粒子引导视频叠在老师原视频上
// 粒子是 segment 级的 (时间从 0 开始), 主视频是 lesson 全局时间,
// 要把 teacherTime - segStart 作为粒子的 currentTime 同步。

import * as React from "react";

export default function SegmentParticleLayer({
  src,
  segStart,
  teacherTime,
  playing,
}: {
  src: string;
  segStart: number;
  teacherTime: number;
  playing: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);

  const relTime = Math.max(0, teacherTime - segStart);

  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = 1;
    if (Math.abs(v.currentTime - relTime) > 0.25) {
      try { v.currentTime = relTime; } catch { /* seek 失败忽略 */ }
    }
    if (playing) void v.play().catch(() => null);
    else v.pause();
  }, [relTime, playing]);

  return (
    <video
      ref={ref}
      src={src}
      crossOrigin="anonymous"
      muted
      playsInline
      loop
      preload="auto"
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      style={{ mixBlendMode: "screen" }}
      aria-hidden
    />
  );
}
