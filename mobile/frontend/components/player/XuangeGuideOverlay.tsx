"use client";

// 学习页专用: 在原视频老师身上叠加轩哥的粒子引导视频
// 粒子视频是黑底 + 白/金/青发光粒子, 用 mix-blend-mode: screen 直接叠上去,
// 黑底透明、粒子显示, 类似给老师加了荧光特效。
//
// 严格跟随主 video 的播放状态和 currentTime, 避免漂移。

import * as React from "react";

export function XuangeGuideOverlay({
  videoRef,
  particleUrl,
  mirror = false,
  className,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  particleUrl?: string;
  mirror?: boolean;
  className?: string;
}) {
  const particleRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const main = videoRef.current;
    const pv = particleRef.current;
    if (!main || !pv || !particleUrl) return;

    const syncTime = () => {
      if (Math.abs(pv.currentTime - main.currentTime) > 0.25) {
        try { pv.currentTime = main.currentTime; } catch { /* seek 可能失败 */ }
      }
      pv.playbackRate = main.playbackRate;
    };
    const syncPlay = () => {
      syncTime();
      if (!main.paused) void pv.play().catch(() => null);
      else pv.pause();
    };
    const onSeeked = () => { try { pv.currentTime = main.currentTime; } catch { /* */ } };

    main.addEventListener("play", syncPlay);
    main.addEventListener("pause", syncPlay);
    main.addEventListener("seeked", onSeeked);
    main.addEventListener("ratechange", syncPlay);
    main.addEventListener("timeupdate", syncTime);

    syncPlay();

    return () => {
      main.removeEventListener("play", syncPlay);
      main.removeEventListener("pause", syncPlay);
      main.removeEventListener("seeked", onSeeked);
      main.removeEventListener("ratechange", syncPlay);
      main.removeEventListener("timeupdate", syncTime);
    };
  }, [videoRef, particleUrl]);

  if (!particleUrl) return null;

  return (
    <video
      ref={particleRef}
      src={particleUrl}
      muted
      playsInline
      loop
      preload="auto"
      className={className ?? "pointer-events-none absolute inset-0 z-20 h-full w-full object-contain"}
      style={{
        mixBlendMode: "screen",
        transform: mirror ? "scaleX(-1)" : undefined,
      }}
      aria-hidden
    />
  );
}

export default XuangeGuideOverlay;
