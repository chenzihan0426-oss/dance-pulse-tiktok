"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pause,
  Play,
  FlipHorizontal2,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { Lesson, Segment } from "@/lib/types";
import { XuangeGuideOverlay } from "@/components/player/XuangeGuideOverlay";
import { BeatCounterBadge } from "@/components/player/BeatCounterBadge";
import { TeachingPanelKpop, parseBeatsRange } from "@/components/TeachingPanelKpop";
import { cn } from "@/lib/utils";

// 排序：1x 起步，先降速 (0.75 → 0.5)，再升速 (1.25 → 1.5)，循环回 1x
const SPEEDS = [1, 0.75, 0.5, 1.25, 1.5] as const;

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function DotFieldBackground({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const spacing = 28;

    const dots: Array<{
      ox: number;
      oy: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
    }> = [];

    const reset = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      dots.length = 0;
      for (let x = -spacing; x <= width + spacing; x += spacing) {
        for (let y = -spacing; y <= height + spacing; y += spacing) {
          dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
        }
      }
    };

    let t = 0;
    const render = () => {
      t += 0.028;
      ctx.fillStyle = "#040404";
      ctx.fillRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < dots.length; i += 1) {
        const p = dots[i];
        const waveX = Math.sin(p.oy * 0.005 + t) * 9;
        const waveY = Math.cos(p.ox * 0.006 + t) * 10;
        const tx = p.ox + waveX;
        const ty = p.oy + waveY;

        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180) {
          const force = ((180 - dist) / 180) ** 2;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 2.8;
          p.vy -= Math.sin(angle) * force * 2.8;
        }

        p.vx += (tx - p.x) * 0.05;
        p.vy += (ty - p.y) * 0.05;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;

        const mag = Math.hypot(p.x - p.ox, p.y - p.oy);
        let r = 255;
        let g = 0;
        let b = 122;
        if (mag > 8) {
          const f = Math.min((mag - 8) / 24, 1);
          r = Math.round(255 - 55 * f);
          g = Math.round(243 * f);
          b = Math.round(122 + 133 * f);
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    reset();
    render();

    const onResize = () => reset();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden />;
}

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
  const [segId, setSegId] = React.useState(initialSegmentId);
  const segment = React.useMemo(() => lesson.segments.find((s) => s.id === segId) ?? lesson.segments[0], [lesson, segId]);

  const onNavigate = React.useCallback(
    (nextId: string) => {
      if (nextId === segId) return;
      setSegId(nextId);
      onSegmentChange?.(nextId);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/player/${nextId}?lesson=${lesson.id}`);
      }
    },
    [lesson.id, onSegmentChange, segId]
  );

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = React.useState(1);
  const [mirror, setMirror] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [immersive, setImmersive] = React.useState(false);
  const [currentBeat, setCurrentBeat] = React.useState(1);

  const [showCustomCursor, setShowCustomCursor] = React.useState(false);
  const [mousePos, setMousePos] = React.useState({ x: -1000, y: -1000 });
  const mouseRef = React.useRef({ x: -1000, y: -1000 });

  // AI 图文教学折叠卡片，切换 segment 时自动收起
  const [teachingExpanded, setTeachingExpanded] = React.useState(false);
  React.useEffect(() => {
    setTeachingExpanded(false);
  }, [segment.id]);

  // 当前 beat 命中的教学 step（用于视频上 overlay 提示词）
  const currentStep = React.useMemo(() => {
    const steps = segment.teaching?.steps ?? [];
    if (!steps.length) return null;
    const hit = steps.find((s) => {
      const r = parseBeatsRange(s.beats);
      return r !== null && currentBeat >= r[0] && currentBeat <= r[1];
    });
    return hit ?? null;
  }, [segment.teaching, currentBeat]);

  React.useEffect(() => {
    setShowCustomCursor(window.matchMedia("(pointer:fine)").matches);
    const onMove = (e: MouseEvent) => {
      const next = { x: e.clientX, y: e.clientY };
      setMousePos(next);
      mouseRef.current = next;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

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
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
    };
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
    } else {
      v.pause();
    }
  }, [playing, segment.id]);

  const idx = practiceSegments.findIndex((s) => s.id === segment.id);
  const prevSeg = idx > 0 ? practiceSegments[idx - 1] : null;
  const nextSeg = idx >= 0 && idx < practiceSegments.length - 1 ? practiceSegments[idx + 1] : null;

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
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowLeft":
          if (prevSeg) {
            e.preventDefault();
            onNavigate(prevSeg.id);
          }
          break;
        case "ArrowRight":
          if (nextSeg) {
            e.preventDefault();
            onNavigate(nextSeg.id);
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleImmersive();
          break;
        case "Escape":
          if (immersive) {
            e.preventDefault();
            setImmersive(false);
          }
          break;
        case " ":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "m":
        case "M":
          setMirror((m) => !m);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevSeg, nextSeg, immersive, onNavigate, toggleImmersive]);

  React.useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const difficulty = clampDifficulty(segment.difficulty);
  const segmentTotal = Math.max(practiceSegments.length, 1);
  const currentOrder = idx >= 0 ? idx + 1 : 1;
  const headingText = `${practiceSegments.length} 段 • ${currentOrder}/${segmentTotal}`;

  return (
    <main
      ref={stageRef}
      className="fixed inset-0 overflow-hidden bg-[#050505] text-white selection:bg-[#ff0055] selection:text-white"
    >
      <DotFieldBackground mouseRef={mouseRef} />

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Michroma&family=Noto+Sans+SC:wght@500;700;900&display=swap");
        body {
          font-family: "Michroma", "Noto Sans SC", sans-serif;
          background: #050505;
          cursor: ${showCustomCursor ? "none" : "auto"};
        }
        @keyframes dp-step-hint-in {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .dp-step-hint {
          animation: dp-step-hint-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      {showCustomCursor ? (
        <>
          <div
            className="pointer-events-none fixed left-0 top-0 z-[120] h-3 w-3 rounded-full bg-[#ccff00] mix-blend-difference"
            style={{ transform: `translate(${mousePos.x - 6}px, ${mousePos.y - 6}px)` }}
          />
          <div
            className="pointer-events-none fixed left-0 top-0 z-[119] h-10 w-10 rounded-full border border-[#00f3ff]/70"
            style={{ transform: `translate(${mousePos.x - 20}px, ${mousePos.y - 20}px)` }}
          />
        </>
      ) : null}

      <div className="relative z-10 flex h-full">
        <section className="relative flex flex-1 items-center justify-center px-5 lg:px-6">
          {!immersive ? (
            <Link
              href={`/lesson/${lesson.id}`}
              className="absolute left-5 top-5 z-30 inline-flex max-w-[min(48vw,560px)] items-center gap-2 rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-sm font-medium text-white/82 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="truncate">{`返回 ${lesson.title}`}</span>
            </Link>
          ) : null}

          {prevSeg ? (
            <button
              type="button"
              onClick={() => onNavigate(prevSeg.id)}
              className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/70 transition hover:bg-black/55 hover:text-white"
              aria-label={`上一段 ${prevSeg.section_label}`}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}

          {nextSeg ? (
            <button
              type="button"
              onClick={() => onNavigate(nextSeg.id)}
              className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/70 transition hover:bg-black/55 hover:text-white"
              aria-label={`下一段 ${nextSeg.section_label}`}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}

          <div
            className="relative w-[min(34vw,520px)] min-w-[300px] overflow-hidden rounded-[26px] border border-white/15 bg-black/70 transition-all duration-300"
            style={{
              aspectRatio: "9/16",
              maxHeight: immersive ? "100vh" : "calc(100vh - 130px)",
              borderRadius: immersive ? "0px" : "26px",
              boxShadow: immersive ? "none" : "0 22px 60px rgba(0,0,0,0.66)",
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

            <XuangeGuideOverlay videoRef={videoRef} particleUrl={segment.particle_url} mirror={mirror} />

            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/95">
              {`${segment.section_label} · 第 ${segment.index + 1}`}
            </div>

            <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/95">
              {"★".repeat(difficulty)}
              <span className="text-white/28">{"★".repeat(5 - difficulty)}</span>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 scale-[0.8] origin-top md:scale-[0.86]">
              <BeatCounterBadge
                currentBeat={currentBeat}
                beatCount={segment.beat_count}
                className="border-white/18 bg-[rgba(115,115,122,0.58)] shadow-[0_20px_45px_rgba(0,0,0,0.35)]"
              />
            </div>

            {currentStep ? (
              <div
                key={`${segment.id}-${currentStep.beats}`}
                className="dp-step-hint pointer-events-none absolute left-1/2 top-[112px] z-20 w-[88%] -translate-x-1/2 text-center text-[18px] font-semibold leading-snug text-white md:text-[20px]"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.95)" }}
              >
                {currentStep.content}
              </div>
            ) : null}

            {immersive ? (
              <div className="pointer-events-none absolute bottom-6 right-6 rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-[11px] text-white/70">
                ←/→ 切段 · Space 暂停 · M 镜像 · Esc 退出
              </div>
            ) : null}
          </div>

          <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3 py-1.5 shadow-[0_14px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90"
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
              className="rounded-full bg-white/8 px-3 py-1 text-[12px] font-semibold tracking-[0.2em] text-white/90 transition hover:bg-white/16"
            >
              {speed}x
            </button>

            <button
              type="button"
              onClick={toggleImmersive}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                immersive ? "bg-amber-400/30 text-amber-100" : "bg-white/8 text-white/70 hover:bg-white/16"
              }`}
              aria-label={immersive ? "退出全屏" : "全屏播放"}
              title={immersive ? "退出全屏 (Esc)" : "全屏 (F)"}
            >
              {immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setMirror((m) => !m)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                mirror ? "bg-fuchsia-500/30 text-fuchsia-100" : "bg-white/8 text-white/70 hover:bg-white/16"
              }`}
              aria-label="镜像"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        <aside
          className={`relative w-[350px] border-l border-white/10 bg-black/72 transition-all duration-300 ${
            immersive ? "hidden" : "flex"
          } flex-col`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_80%,rgba(255,0,85,0.12),transparent_45%)]" />

          <div className="relative z-10 flex h-full flex-col">
            <div className="px-6 pb-3 pt-8">
              <div className="text-[11px] font-medium tracking-[0.22em] text-white/42">动作段落</div>
              <div className="mt-1 text-[28px] font-black leading-none text-white">{headingText}</div>
            </div>

            <div className="px-5 pb-3">
              <div className="overflow-hidden rounded-2xl border border-[#00f3ff]/30 bg-black/40 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setTeachingExpanded((p) => !p)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                  aria-expanded={teachingExpanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
                      <span className="rounded-full border border-[#ccff00]/40 bg-[#ccff00]/15 px-2 py-0.5 font-bold text-[#ccff00]">
                        AI 图文教学
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-white/75">
                      {segment.teaching?.status === "ready"
                        ? segment.teaching.summary
                        : segment.teaching?.status === "pending"
                          ? "教学生成中..."
                          : segment.teaching?.status === "failed"
                            ? "教学未就绪（可去课程页重新生成）"
                            : "暂无教学内容"}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-white/65 transition-transform",
                      teachingExpanded && "rotate-180"
                    )}
                  />
                </button>
                {teachingExpanded && segment.teaching ? (
                  <div className="border-t border-white/10 p-4">
                    <TeachingPanelKpop
                      segment={segment}
                      currentBeat={currentBeat}
                      autoScrollSteps
                      className="border-0 bg-transparent p-0 shadow-none"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 px-6 pb-3">
              <button
                type="button"
                onClick={() => prevSeg && onNavigate(prevSeg.id)}
                disabled={!prevSeg}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 text-[13px] text-white/75 transition hover:bg-white/10 disabled:opacity-35"
              >
                <ChevronUp className="h-4 w-4" />
                上一段
              </button>
              <button
                type="button"
                onClick={() => nextSeg && onNavigate(nextSeg.id)}
                disabled={!nextSeg}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 text-[13px] text-white/75 transition hover:bg-white/10 disabled:opacity-35"
              >
                <ChevronDown className="h-4 w-4" />
                下一段
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-5">
              {practiceSegments.map((s) => {
                const active = s.id === segment.id;
                const rowDifficulty = clampDifficulty(s.difficulty);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigate(s.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-white/25 bg-black/68 shadow-[0_14px_40px_rgba(0,0,0,0.5)]"
                        : "border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div
                      className="h-12 w-12 flex-shrink-0 rounded-xl bg-cover bg-center"
                      style={{ backgroundImage: `url("${s.thumbnail}")` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[17px] font-semibold ${active ? "text-white" : "text-white/82"}`}>
                        {`${s.section_label} · 第 ${s.index + 1}`}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-white/48">
                        <span>{s.duration.toFixed(1)}s</span>
                        <span>·</span>
                        <span>{"★".repeat(rowDifficulty)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-white/10 p-5">
              <Link
                href={`/lesson/${lesson.id}/tracking-desktop`}
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(157,78,221,0.32)] transition hover:brightness-110"
              >
                <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />
                <span className="font-semibold text-white">整支跟拍挑战</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default DesktopPlayer;
