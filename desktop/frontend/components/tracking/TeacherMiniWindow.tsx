"use client";

// 全身镜右上角小窗:
//   底层: 整支 lesson 原视频(带背景), 跟全局 playhead 同步
//   上层: 当前 segment 的粒子引导视频, 按 segment 内时间同步, screen blend 叠加
// 跟学习页一样的做法 —— 原视频 + 粒子重叠。

import * as React from "react";

export function TeacherMiniWindow({
  lessonVideoUrl,
  particleUrl,
  segStart,
  lessonPlayhead,
  playing,
}: {
  lessonVideoUrl: string;
  particleUrl?: string;
  segStart: number;
  lessonPlayhead: number;
  playing: boolean;
}) {
  const lessonRef = React.useRef<HTMLVideoElement>(null);
  const partRef = React.useRef<HTMLVideoElement>(null);

  // 底层 lesson video 同步全局 playhead
  React.useEffect(() => {
    const v = lessonRef.current;
    if (!v) return;
    v.playbackRate = 1;
    if (Math.abs(v.currentTime - lessonPlayhead) > 0.25) {
      try { v.currentTime = lessonPlayhead; } catch { /* seek 失败忽略 */ }
    }
    if (playing) void v.play().catch(() => null);
    else v.pause();
  }, [lessonPlayhead, playing]);

  // 粒子 video 同步 segment 内时间
  const segRelTime = Math.max(0, lessonPlayhead - segStart);
  React.useEffect(() => {
    const v = partRef.current;
    if (!v) return;
    v.playbackRate = 1;
    if (Math.abs(v.currentTime - segRelTime) > 0.25) {
      try { v.currentTime = segRelTime; } catch { /* */ }
    }
    if (playing) void v.play().catch(() => null);
    else v.pause();
  }, [segRelTime, playing]);

  return (
    <div className="pointer-events-none relative h-full w-full">
      <video
        ref={lessonRef}
        src={lessonVideoUrl}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {particleUrl ? (
        <video
          ref={partRef}
          src={particleUrl}
          crossOrigin="anonymous"
          muted
          playsInline
          loop
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ mixBlendMode: "screen" }}
        />
      ) : null}
    </div>
  );
}

export default TeacherMiniWindow;
