"use client";

// 关键帧进度条:卡片下方、控件上方的可拖拽进度条。
//   - 进度条实时反映视频播放位置(rAF 读 video.currentTime)
//   - 关键动作节点(来自 teaching.beat_cues 非空项)在条上标点
//   - 光标悬停节点 -> 浮出该动作名 + 该关键帧小图
//   - 点击节点 / 拖拽 -> seek 视频到对应帧
// 关键帧小图用一个离屏 <video> 逐个 seek 截帧生成(一次性,缓存)。
// 设计沿用产品既有风格:圆角轨道 bg-white/10、霓虹描边、白色滑块。

import * as React from "react";

import type { TeachingStep } from "@/lib/types";
import { parseBeatsRange } from "@/components/TeachingPanelKpop";

export interface KeyframeNode {
  beat: number; // 1-based 拍序号
  name: string; // 关键动作名
  t: number; // clip 内秒数
  ratio: number; // 0..1 在条上的位置
}

// 从教学数据提取关键动作节点(纯函数,便于测试)。
// 优先 beat_cues(单拍精确名);为空则回退 teaching.steps(每段起始拍)。
export function extractKeyframeNodes(
  beatCues: (string | null)[],
  steps: TeachingStep[],
  beatCount: number,
  duration: number
): KeyframeNode[] {
  const bc = Math.max(beatCount, 1);
  const out: KeyframeNode[] = [];

  let hasCue = false;
  for (let i = 0; i < bc; i++) {
    const name = beatCues?.[i];
    if (name && name.trim()) {
      hasCue = true;
      const ratio = i / bc;
      out.push({ beat: i + 1, name: name.trim(), t: ratio * duration, ratio });
    }
  }
  if (hasCue) return out;

  const seen = new Set<number>();
  for (const s of steps ?? []) {
    const r = parseBeatsRange(s.beats);
    if (!r || !s.content?.trim()) continue;
    const startBeat = Math.min(Math.max(1, r[0]), bc);
    if (seen.has(startBeat)) continue;
    seen.add(startBeat);
    const ratio = (startBeat - 1) / bc;
    out.push({ beat: startBeat, name: s.content.trim(), t: ratio * duration, ratio });
  }
  out.sort((a, b) => a.ratio - b.ratio);
  return out;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  clipUrl: string;
  durationHint: number; // segment.duration,video.duration 未就绪时的兜底
  beatCount: number;
  beatCues: (string | null)[];
  steps: TeachingStep[]; // beat_cues 为空时的回退数据源
  thumbnail: string; // 截帧失败时的兜底图
  mirror: boolean;
  className?: string;
}

export function KeyframeScrubber({
  videoRef,
  clipUrl,
  durationHint,
  beatCount,
  beatCues,
  steps,
  thumbnail,
  mirror,
  className,
}: Props) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0); // 0..1
  const [dragging, setDragging] = React.useState(false);
  const draggingRef = React.useRef(false);
  draggingRef.current = dragging;
  const [hover, setHover] = React.useState<number | null>(null); // 悬停节点 index
  // 节点 index -> 关键帧小图 dataURL
  const [thumbs, setThumbs] = React.useState<Record<number, string>>({});

  const duration = React.useMemo(() => {
    const vd = videoRef.current?.duration;
    return vd && Number.isFinite(vd) && vd > 0 ? vd : Math.max(durationHint, 0.01);
    // 每次 clip 变化重算
  }, [videoRef, durationHint, clipUrl]);

  // 关键动作节点:优先 beat_cues(单拍精确),否则回退 teaching.steps(取每段起始拍)
  const nodes = React.useMemo<KeyframeNode[]>(
    () => extractKeyframeNodes(beatCues, steps, beatCount, duration),
    [beatCues, beatCount, steps, duration]
  );

  // rAF 同步播放进度(拖拽时不覆盖用户操作)
  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && !draggingRef.current) {
        const d = v.duration && Number.isFinite(v.duration) ? v.duration : duration;
        const p = d > 0 ? Math.min(1, Math.max(0, v.currentTime / d)) : 0;
        setProgress((prev) => (Math.abs(prev - p) < 0.001 ? prev : p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, duration]);

  // 一次性截取各关键帧小图(离屏 video 逐个 seek)
  React.useEffect(() => {
    if (!nodes.length || !clipUrl) return;
    let cancelled = false;
    const off = document.createElement("video");
    off.src = clipUrl;
    off.muted = true;
    off.crossOrigin = "anonymous";
    off.preload = "auto";
    // 9:16 小图
    const CW = 96;
    const CH = 170;
    const canvas = document.createElement("canvas");
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext("2d");

    const captureAt = (t: number): Promise<string | null> =>
      new Promise((resolve) => {
        const onSeeked = () => {
          off.removeEventListener("seeked", onSeeked);
          if (!ctx || off.videoWidth === 0) return resolve(null);
          // object-cover 映射
          const scale = Math.max(CW / off.videoWidth, CH / off.videoHeight);
          const dw = off.videoWidth * scale;
          const dh = off.videoHeight * scale;
          const dx = (CW - dw) / 2;
          const dy = (CH - dh) / 2;
          try {
            ctx.clearRect(0, 0, CW, CH);
            ctx.drawImage(off, dx, dy, dw, dh);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          } catch {
            resolve(null); // 跨域污染等 -> 用兜底图
          }
        };
        off.addEventListener("seeked", onSeeked);
        off.currentTime = Math.min(t, Math.max(0, (off.duration || durationHint) - 0.05));
      });

    const run = async () => {
      await new Promise<void>((res) => {
        if (off.readyState >= 1) return res();
        off.addEventListener("loadedmetadata", () => res(), { once: true });
      });
      for (let i = 0; i < nodes.length; i++) {
        if (cancelled) break;
        const url = await captureAt(nodes[i].t);
        if (cancelled) break;
        if (url) setThumbs((prev) => ({ ...prev, [i]: url }));
      }
    };
    void run();
    return () => {
      cancelled = true;
      off.removeAttribute("src");
      off.load();
    };
  }, [nodes, clipUrl, durationHint]);

  const seekToRatio = React.useCallback(
    (ratio: number) => {
      const v = videoRef.current;
      if (!v) return;
      const d = v.duration && Number.isFinite(v.duration) ? v.duration : duration;
      v.currentTime = Math.min(d - 0.02, Math.max(0, ratio * d));
      setProgress(Math.min(1, Math.max(0, ratio)));
    },
    [videoRef, duration]
  );

  const ratioFromEvent = React.useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  // 拖拽:指针按下后跟随移动,松开结束
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => seekToRatio(ratioFromEvent(e.clientX));
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, ratioFromEvent, seekToRatio]);

  return (
    <div className={className}>
      <div className="rounded-[18px] border border-white/12 bg-black/55 px-4 py-3 backdrop-blur-md">
        {/* 轨道 */}
        <div
          ref={trackRef}
          className="relative h-2.5 cursor-pointer select-none rounded-full bg-white/12"
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
            seekToRatio(ratioFromEvent(e.clientX));
          }}
        >
          {/* 已播放进度 */}
          <div
            className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff]"
            style={{ width: `${progress * 100}%` }}
          />

          {/* 关键动作节点 */}
          {nodes.map((n, i) => (
            <div
              key={n.beat}
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${n.ratio * 100}%` }}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              onPointerDown={(e) => {
                // 节点点击优先于轨道拖拽:跳到该帧,不进入拖拽
                e.stopPropagation();
                seekToRatio(n.ratio);
              }}
            >
              <div
                className={`h-3.5 w-3.5 rounded-full border-2 border-[#050505] transition-transform ${
                  hover === i
                    ? "scale-125 bg-[#ccff00]"
                    : "bg-white shadow-[0_0_0_2px_rgba(204,255,0,0.35)]"
                }`}
              />

              {/* 悬停提示:动作名 + 关键帧小图 */}
              {hover === i ? (
                <div className="pointer-events-none absolute bottom-[26px] left-1/2 z-30 w-[104px] -translate-x-1/2">
                  <div className="overflow-hidden rounded-xl border border-white/20 bg-black/85 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbs[i] ?? thumbnail}
                      alt={n.name}
                      className="h-[136px] w-full object-cover"
                      style={{ transform: mirror ? "scaleX(-1)" : undefined }}
                    />
                    <div className="px-2 py-1.5 text-center">
                      <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-white">{n.name}</div>
                      <div className="mt-0.5 text-[9px] tracking-wider text-white/45">第 {n.beat} 拍</div>
                    </div>
                  </div>
                  {/* 小三角 */}
                  <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-white/20 bg-black/85" />
                </div>
              ) : null}
            </div>
          ))}

          {/* 播放滑块 */}
          <div
            className="pointer-events-none absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white shadow-[0_0_0_4px_rgba(157,78,221,0.22)]"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default KeyframeScrubber;
