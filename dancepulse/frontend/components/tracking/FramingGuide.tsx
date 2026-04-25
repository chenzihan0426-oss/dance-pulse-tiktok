"use client";

// 取景引导:
//   1. 半透明虚线人形框, 提示用户"全身站这个区域"
//   2. 基于 MediaPipe 实时 kpts 算 body bbox, 不在安全区时给 coaching 提示
//      (往后退 / 靠近 / 抬高摄像头 / 降低摄像头)
//   3. 人体完全入镜后自动隐藏 (不打扰), 超出时才浮出

import * as React from "react";

export type BodyBounds = {
  topY: number;    // 0..1 normalized (0 = 画面顶)
  botY: number;
  leftX: number;
  rightX: number;
  vis: number;     // 最低可见度
};

const CHECK_INTERVAL_MS = 250;

export default function FramingGuide({
  boundsRef,
  cameraReady,
}: {
  boundsRef: React.MutableRefObject<BodyBounds | null>;
  cameraReady: boolean;
}) {
  const [coaching, setCoaching] = React.useState<string | null>(null);
  const [okSeen, setOkSeen] = React.useState(false); // 一旦检测到全身入镜, 此后框隐藏

  React.useEffect(() => {
    if (!cameraReady) return;
    const id = window.setInterval(() => {
      const b = boundsRef.current;
      if (!b || b.vis < 0.4) {
        setCoaching("看不清你,调整下光线 / 摄像头位置");
        return;
      }
      const height = b.botY - b.topY;

      let msg: string | null = null;
      if (b.topY < 0.04) msg = "头顶出镜了 · 把摄像头往下/往后";
      else if (b.botY > 0.96) msg = "脚出镜了 · 把摄像头往上 或 往后退";
      else if (height < 0.50) msg = "离远了 · 靠近摄像头一点";
      else if (height > 0.92) msg = "离太近了 · 往后退一步";

      if (msg) {
        setCoaching(msg);
      } else {
        setCoaching(null);
        if (height >= 0.55 && height <= 0.90 && b.topY > 0.05 && b.botY < 0.95) {
          setOkSeen(true);
        }
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [boundsRef, cameraReady]);

  if (!cameraReady) return null;

  // 框: 当未 OK 或者提示出现时显示
  const showFrame = !okSeen || coaching !== null;

  return (
    <>
      {showFrame ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[25] rounded-[20px] border-2 border-dashed border-white/30 transition-opacity"
          style={{
            // 锁定 9:16 人形比例: 高度占容器 88%, 宽度按比例自动算
            // 不论容器宽高 (16:9 / 9:16 / 任意) 框始终是人形纵向比例
            aspectRatio: "9 / 16",
            height: "88%",
            transform: "translate(-50%, -50%)",
            opacity: coaching ? 0.7 : 0.3,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)",
          }}
        >
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/75 backdrop-blur">
            全身取景
          </div>
        </div>
      ) : null}

      {coaching ? (
        <div className="pointer-events-none absolute left-1/2 top-[calc(6%+1rem)] z-[26] -translate-x-1/2 rounded-full bg-amber-400/95 px-4 py-1.5 text-[13px] font-bold text-amber-950 shadow-[0_8px_20px_rgba(251,191,36,0.35)]">
          📐 {coaching}
        </div>
      ) : null}

      {okSeen && !coaching ? (
        <div className="pointer-events-none absolute left-1/2 top-[calc(6%+1rem)] z-[26] -translate-x-1/2 rounded-full bg-emerald-400/95 px-4 py-1 text-[12px] font-bold text-emerald-950 opacity-70">
          ✓ 全身已入镜
        </div>
      ) : null}
    </>
  );
}
