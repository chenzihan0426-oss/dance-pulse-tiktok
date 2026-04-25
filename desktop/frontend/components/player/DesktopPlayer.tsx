"use client";

// PC 端学习播放器: 影院沉浸风
//   - 居中大视频 (9:16 纵向, 最大化利用高度)
//   - 粒子引导叠加 (原视频老师 + 轩哥粒子图)
//   - 右侧轨道: 段落列表, 点击快速切换
//   - 底部薄控件条: 暂停 / 倍速 / 镜像

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pause, Play, FlipHorizontal2, ChevronUp, ChevronDown, Maximize2, Minimize2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Lesson, Segment } from "@/lib/types";
import { XuangeGuideOverlay } from "@/components/player/XuangeGuideOverlay";
import { BeatCounterBadge } from "@/components/player/BeatCounterBadge";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export function DesktopPlayer({
  lesson,
  initialSegmentId,
  practiceSegments,
  onSegmentChange,
}: {
  lesson: Lesson;
  initialSegmentId: string;
  practiceSegments: Segment[];
  onSegmentChange?: (segId: string) => void;
}) {
  // segment 由内部 state 控制,切段不 unmount 整个组件 (保留全屏状态)
  const [segId, setSegId] = React.useState(initialSegmentId);
  const segment = React.useMemo(
    () => lesson.segments.find((s) => s.id === segId) ?? lesson.segments[0],
    [lesson, segId]
  );

  // 切段时同步 URL (history.replaceState 不触发 Next.js 导航)
  const onNavigate = React.useCallback((nextId: string) => {
    if (nextId === segId) return;
    setSegId(nextId);
    onSegmentChange?.(nextId);
    if (typeof window !== "undefined") {
      const url = `/player/${nextId}?lesson=${lesson.id}`;
      window.history.replaceState(null, "", url);
    }
  }, [lesson.id, onSegmentChange, segId]);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = React.useState(1);
  const [mirror, setMirror] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [immersive, setImmersive] = React.useState(false);
  const [currentBeat, setCurrentBeat] = React.useState(1);

  // Beat 计算: 根据 video.currentTime / (duration / beat_count)
  React.useEffect(() => {
    let rafId = 0;
    let disposed = false;
    const beatCount = Math.max(segment.beat_count, 1);
    const beatDuration = segment.duration / beatCount;
    const tick = () => {
      if (disposed) return;
      const v = videoRef.current;
      if (v && beatDuration > 0) {
        const raw = Math.floor(v.currentTime / beatDuration);
        const beat = (raw % beatCount) + 1;
        setCurrentBeat((prev) => (prev === beat ? prev : beat));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(rafId); };
  }, [segment.id, segment.duration, segment.beat_count]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed, segment.id]);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.muted = false;
      v.volume = 1;
      void v.play().catch(() => setPlaying(false));
    }
    else v.pause();
  }, [playing, segment.id]);

  const idx = practiceSegments.findIndex((s) => s.id === segment.id);
  const prevSeg = idx > 0 ? practiceSegments[idx - 1] : null;
  const nextSeg = idx >= 0 && idx < practiceSegments.length - 1 ? practiceSegments[idx + 1] : null;

  // 键盘快捷键: ← 上一段, → 下一段, F 全屏, Space 播放/暂停, Esc 退出全屏
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowLeft":
          if (prevSeg) { e.preventDefault(); onNavigate(prevSeg.id); }
          break;
        case "ArrowRight":
          if (nextSeg) { e.preventDefault(); onNavigate(nextSeg.id); }
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleImmersive();
          break;
        case "Escape":
          if (immersive) { e.preventDefault(); setImmersive(false); }
          break;
        case " ":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "m":
        case "M":
          setMirror((m) => !m);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevSeg, nextSeg, immersive]);

  // 原生全屏 API (F11 模拟): 进入真实全屏, 退出时也同步 state
  const toggleImmersive = React.useCallback(() => {
    setImmersive((cur) => {
      const next = !cur;
      if (next && stageRef.current && document.fullscreenEnabled) {
        stageRef.current.requestFullscreen?.().catch(() => null);
      } else if (!next && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => null);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  return (
    <main ref={stageRef} className="fixed inset-0 flex bg-black text-white">
      {/* 左侧: 视频区 */}
      <section className="relative flex flex-1 items-center justify-center">
        {/* 返回按钮 (全屏态隐藏) */}
        {!immersive ? (
          <Link
            href={`/lesson/${lesson.id}`}
            className="absolute left-8 top-8 z-20 inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-1.5 text-[13px] text-white/70 backdrop-blur hover:bg-white/14 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回 {lesson.title}
          </Link>
        ) : null}

        {/* 左右大箭头 (切段落) */}
        {prevSeg ? (
          <button
            type="button"
            onClick={() => onNavigate(prevSeg.id)}
            className="group absolute left-4 top-1/2 z-20 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white/75 backdrop-blur transition hover:bg-black/60 hover:text-white"
            aria-label={`上一段 ${prevSeg.section_label}`}
            title={`← ${prevSeg.section_label}`}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        ) : null}
        {nextSeg ? (
          <button
            type="button"
            onClick={() => onNavigate(nextSeg.id)}
            className="group absolute right-4 top-1/2 z-20 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white/75 backdrop-blur transition hover:bg-black/60 hover:text-white"
            aria-label={`下一段 ${nextSeg.section_label}`}
            title={`→ ${nextSeg.section_label}`}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        ) : null}

        {/* 视频容器 9:16 */}
        <div
          className="relative h-full overflow-hidden bg-black transition-all duration-300"
          style={{
            aspectRatio: "9/16",
            maxHeight: immersive ? "100vh" : "calc(100vh - 120px)",
            borderRadius: immersive ? "0px" : "28px",
            boxShadow: immersive ? "none" : "0 30px 80px rgba(0,0,0,0.6)",
          }}
        >
          <video
            ref={videoRef}
            src={segment.clip_url}
            poster={segment.thumbnail}
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: mirror ? "scaleX(-1)" : undefined }}
            onClick={() => setPlaying((p) => !p)}
          />
          <XuangeGuideOverlay
            videoRef={videoRef}
            particleUrl={segment.particle_url}
            mirror={mirror}
          />

          {/* 段落标签 */}
          <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
            {segment.section_label} · {segment.index + 1}
          </div>
          <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
            {"★".repeat(segment.difficulty)}
            <span className="text-white/30">{"★".repeat(5 - segment.difficulty)}</span>
          </div>

          {/* Beat 计数: 复用手机端 BeatCounterBadge 样式 */}
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
            <BeatCounterBadge currentBeat={currentBeat} beatCount={segment.beat_count} />
          </div>

          {/* 键盘提示 (全屏态右下角 fade-in) */}
          {immersive ? (
            <div className="pointer-events-none absolute bottom-6 right-6 rounded-lg bg-black/55 px-3 py-2 text-[11px] text-white/55 backdrop-blur">
              ← → 切段 · Space 暂停 · M 镜像 · Esc 退出
            </div>
          ) : null}
        </div>

        {/* 底部控件条 */}
        <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90"
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => {
              const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
              setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
            }}
            className="rounded-full bg-white/8 px-3 py-1.5 font-mono text-[13px] font-semibold tracking-wider text-white/85 transition hover:bg-white/14"
          >
            {speed}x
          </button>
          <button
            type="button"
            onClick={toggleImmersive}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              immersive ? "bg-amber-400/30 text-amber-100" : "bg-white/8 text-white/70 hover:bg-white/14"
            }`}
            aria-label={immersive ? "退出全屏" : "全屏播放"}
            title={immersive ? "退出全屏 (Esc)" : "全屏 (F)"}
          >
            {immersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMirror((m) => !m)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              mirror ? "bg-fuchsia-500/30 text-fuchsia-100" : "bg-white/8 text-white/70 hover:bg-white/14"
            }`}
            aria-label="镜像"
          >
            <FlipHorizontal2 className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* 右侧: 段落列表 */}
      <aside className={`flex w-[320px] flex-col border-l border-white/8 bg-black/50 backdrop-blur transition-all duration-300 ${immersive ? "hidden" : ""}`}>
        <div className="px-6 pb-4 pt-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">动作段落</div>
          <div className="mt-1 text-[20px] font-semibold text-white">
            {practiceSegments.length} 段 · {idx + 1}/{practiceSegments.length}
          </div>
        </div>

        {/* 上下切段快捷键 */}
        <div className="flex items-center gap-2 px-6 pb-3">
          <button
            type="button"
            onClick={() => prevSeg && onNavigate(prevSeg.id)}
            disabled={!prevSeg}
            className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-white/6 text-[12px] text-white/70 transition hover:bg-white/12 disabled:opacity-40"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            上一段
          </button>
          <button
            type="button"
            onClick={() => nextSeg && onNavigate(nextSeg.id)}
            disabled={!nextSeg}
            className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-white/6 text-[12px] text-white/70 transition hover:bg-white/12 disabled:opacity-40"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            下一段
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-6">
          {practiceSegments.map((s) => {
            const active = s.id === segment.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onNavigate(s.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active ? "bg-white/12 ring-1 ring-white/15" : "hover:bg-white/6"
                }`}
              >
                <div
                  className="h-12 w-12 flex-shrink-0 rounded-lg bg-cover bg-center"
                  style={{ backgroundImage: `url("${s.thumbnail}")` }}
                />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-medium ${active ? "text-white" : "text-white/78"}`}>
                    {s.section_label} · 第 {s.index + 1}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/40">
                    <span>{s.duration.toFixed(1)}s</span>
                    <span>·</span>
                    <span>{"★".repeat(s.difficulty)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-white/8 p-6">
          <Link
            href={`/lesson/${lesson.id}/tracking-desktop`}
            className="block w-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 px-4 py-3 text-center text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            整支跟拍挑战
          </Link>
        </div>
      </aside>
    </main>
  );
}

export default DesktopPlayer;
