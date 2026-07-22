"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Music,
  Play,
  Sparkles,
  TrendingDown,
  Video,
  X,
  Zap,
} from "lucide-react";
import { getLesson, getTrackingDifficulty, regenerateTeaching, type DifficultyAggregate } from "@/lib/api";
import { getLastViewedSegmentId } from "@/lib/storage";
import type { Lesson, Segment } from "@/lib/types";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { lessonIsDemoReady, segmentIsReady } from "@/lib/demoReady";
import { TeachingPanelKpop } from "@/components/TeachingPanelKpop";
import { cn } from "@/lib/utils";

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 关节英文名 -> 中文,用于卡片"难点"提示
const JOINT_LABELS: Record<string, string> = {
  leftElbow: "左肘",
  rightElbow: "右肘",
  leftShoulder: "左肩",
  rightShoulder: "右肩",
  leftKnee: "左膝",
  rightKnee: "右膝",
  leftHip: "左胯",
  rightHip: "右胯",
};

function ParticleBackground({ mouseRef }: { mouseRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let particles: Array<{
      originX: number;
      originY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      baseSize: number;
    }> = [];
    const spacing = 24;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const initCanvas = () => {
      canvas.width = width;
      canvas.height = height;
      particles = [];
      for (let x = -spacing; x < width + spacing; x += spacing) {
        for (let y = -spacing; y < height + spacing; y += spacing) {
          particles.push({ originX: x, originY: y, x, y, vx: 0, vy: 0, baseSize: 1.5 });
        }
      }
    };
    initCanvas();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      initCanvas();
    };
    window.addEventListener("resize", handleResize);

    let time = 0;
    const render = () => {
      time += 0.03;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const waveX = Math.sin(p.originY * 0.005 + time) * 12;
        const waveY = Math.sin(p.originX * 0.008 + time) * Math.cos(p.originY * 0.008 + time) * 20;
        const targetX = p.originX + waveX;
        const targetY = p.originY + waveY;

        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 180) {
          const force = Math.pow((180 - dist) / 180, 2);
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 4;
          p.vy -= Math.sin(angle) * force * 4;
        }

        p.vx += (targetX - p.x) * 0.04;
        p.vy += (targetY - p.y) * 0.04;
        p.vx *= 0.88;
        p.vy *= 0.88;
        p.x += p.vx;
        p.y += p.vy;

        const devX = p.x - p.originX;
        const devY = p.y - p.originY;
        const totalDev = Math.sqrt(devX * devX + devY * devY);

        let r: number;
        let g: number;
        let b: number;
        if (totalDev < 15) {
          const factor = totalDev / 15;
          r = Math.floor(255 * factor);
          g = Math.floor(243 * (1 - factor));
          b = Math.floor(255 + (85 - 255) * factor);
        } else {
          const factor = Math.min((totalDev - 15) / 25, 1);
          r = Math.floor(255 + (204 - 255) * factor);
          g = Math.floor(255 * factor);
          b = Math.floor(85 * (1 - factor));
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.baseSize + totalDev * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [mouseRef]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />;
}

export default function LessonPageDesktop() {
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "";

  const [lesson, setLesson] = React.useState<Lesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastViewedSegmentId, setLastSegId] = React.useState<string | null>(null);
  // 逐动作难度聚合(随拍比对得出的机器测量难点),segmentId -> agg
  const [difficultyMap, setDifficultyMap] = React.useState<Map<string, DifficultyAggregate>>(new Map());

  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = React.useState(false);
  const [showCustomCursor, setShowCustomCursor] = React.useState(false);
  const mouseRef = React.useRef({ x: -1000, y: -1000 });

  // AI 图文教学：当前展开的 segment id + 重生成中的 segment id
  const [activeTeachingSegId, setActiveTeachingSegId] = React.useState<string | null>(null);
  const [regeneratingSegId, setRegeneratingSegId] = React.useState<string | null>(null);
  const detailRef = React.useRef<HTMLDivElement | null>(null);

  const { setTotal, isLearned, learnedCount, total } = useLearningProgress(lessonId);

  React.useEffect(() => {
    setShowCustomCursor(window.matchMedia("(pointer:fine)").matches);

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLesson(lessonId)
      .then((detail) => {
        if (cancelled) return;
        setLesson(detail);
        setTotal(detail.segments.filter((s) => !s.is_still && !s.deleted).length);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, setTotal]);

  // 拉取该课的逐动作难度聚合(global scope),用于在卡片上标注难点。
  // 失败静默(功能未产生数据时后端返回空数组即可)。
  React.useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    getTrackingDifficulty(lessonId, "global")
      .then((aggs) => {
        if (cancelled) return;
        setDifficultyMap(new Map(aggs.map((a) => [a.segmentId, a])));
      })
      .catch(() => {
        /* 难度聚合是增强信息,拉取失败不影响页面 */
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  React.useEffect(() => {
    if (!lesson) return;
    setLastSegId(getLastViewedSegmentId(lesson.id));
  }, [lesson]);

  const handleToggleTeaching = React.useCallback((segId: string) => {
    setActiveTeachingSegId((prev) => {
      const next = prev === segId ? null : segId;
      if (next) {
        // 切换到新 segment 时滚动到详情面板
        requestAnimationFrame(() => {
          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }, []);

  const handleRegenerate = React.useCallback(
    async (segId: string) => {
      if (!lesson) return;
      setRegeneratingSegId(segId);
      try {
        await regenerateTeaching(lesson.id, segId);
        // 1.2s 后整体拉一次，然后每 3s 轮询直到非 pending（最多 6 次 = 18s）
        let tries = 0;
        const poll = async () => {
          try {
            const fresh = await getLesson(lesson.id);
            setLesson(fresh);
            const updated = fresh.segments.find((s) => s.id === segId);
            if (updated?.teaching?.status === "pending" && tries < 6) {
              tries += 1;
              setTimeout(poll, 3000);
            }
          } catch (err) {
            console.error("poll teaching failed", err);
          }
        };
        setTimeout(poll, 1200);
      } catch (err) {
        console.error("regenerate teaching failed", err);
      } finally {
        setRegeneratingSegId(null);
      }
    },
    [lesson]
  );

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-white/40">加载中...</main>;
  }
  if (error || !lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white/60">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-red-200">
          {error ?? "课程不存在"}
        </div>
      </main>
    );
  }

  const activeSegments: Segment[] = lesson.segments.filter((s) => !s.deleted && !s.is_still);
  const demoReady = lessonIsDemoReady(lesson);
  const allLearned = activeSegments.length > 0 && activeSegments.every((s) => isLearned(s.id));
  const resumeSegId = lastViewedSegmentId ?? activeSegments[0]?.id;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050505] pb-28 font-sans text-white selection:bg-[#ff0055] selection:text-white">
      <ParticleBackground mouseRef={mouseRef} />

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Michroma&family=Noto+Sans+SC:wght@900&display=swap");

        body {
          font-family: "Michroma", sans-serif;
          cursor: ${showCustomCursor ? "none" : "auto"};
          background: #050505;
        }

        .cursor-dot {
          transition: transform 0.1s ease-out;
        }

        .cursor-ring {
          transition:
            transform 0.3s ease-out,
            width 0.2s,
            height 0.2s;
        }

        .kpop-glitch {
          position: relative;
          display: inline-block;
          transform: skewX(-12deg);
          background: linear-gradient(90deg, #ff0055, #ffaa00, #ccff00, #00f3ff, #9d4edd, #ff0055);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          -webkit-text-stroke: 1px rgba(255, 255, 255, 0.1);
          text-shadow: 4px 4px 0 rgba(255, 0, 85, 0.2);
          font-family: "Black Han Sans", "Noto Sans SC", sans-serif;
          animation: shine 3s linear infinite;
        }

        .kpop-glitch::before,
        .kpop-glitch::after {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          content: attr(data-text);
          opacity: 0.6;
          -webkit-text-stroke: 0;
        }

        .kpop-glitch::before {
          z-index: -1;
          left: 4px;
          text-shadow: -2px 0 #00f3ff;
          -webkit-text-fill-color: #00f3ff;
          animation: glitch-anim-1 2s infinite linear alternate-reverse;
        }

        .kpop-glitch::after {
          z-index: -2;
          left: -4px;
          text-shadow: 2px 0 #ff0055;
          -webkit-text-fill-color: #ff0055;
          animation: glitch-anim-2 3s infinite linear alternate-reverse;
        }

        .kpop-text {
          background: linear-gradient(90deg, #00f3ff, #ccff00, #ff0055, #9d4edd, #00f3ff);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shine 3s linear infinite;
        }

        .btn-strike {
          position: relative;
          overflow: hidden;
          transform: skewX(-15deg);
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .btn-strike::after {
          position: absolute;
          bottom: 0;
          left: -100%;
          z-index: -1;
          width: 100%;
          height: 100%;
          content: "";
          background: #ccff00;
          transition: left 0.3s cubic-bezier(0.7, 0, 0.3, 1);
        }

        .btn-strike:hover::after {
          left: 0;
        }

        .btn-strike:hover {
          color: #050505;
        }

        .marquee-container {
          display: flex;
          white-space: nowrap;
          font-family: "Black Han Sans", sans-serif;
          animation: marquee 20s linear infinite;
        }

        .neon-card {
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .neon-card:hover {
          transform: translateY(-8px) scale(1.015);
        }

        .neon-card::before {
          position: absolute;
          inset: 0;
          z-index: -1;
          content: "";
          background: var(--hover-color, #ff0055);
          opacity: 0;
          filter: blur(40px);
          transition: opacity 0.4s ease;
        }

        .neon-card:hover::before {
          opacity: 0.45;
        }

        @keyframes shine {
          to {
            background-position: 200% center;
          }
        }

        @keyframes glitch-anim-1 {
          0% {
            clip-path: inset(20% 0 80% 0);
            transform: translate(-2px, 1px);
          }
          20% {
            clip-path: inset(60% 0 10% 0);
            transform: translate(2px, -1px);
          }
          40% {
            clip-path: inset(40% 0 50% 0);
            transform: translate(-2px, 2px);
          }
          60% {
            clip-path: inset(80% 0 5% 0);
            transform: translate(2px, -2px);
          }
          80% {
            clip-path: inset(10% 0 70% 0);
            transform: translate(-1px, 1px);
          }
          100% {
            clip-path: inset(30% 0 50% 0);
            transform: translate(1px, -1px);
          }
        }

        @keyframes glitch-anim-2 {
          0% {
            clip-path: inset(10% 0 60% 0);
            transform: translate(2px, -1px);
          }
          20% {
            clip-path: inset(30% 0 20% 0);
            transform: translate(-2px, 1px);
          }
          40% {
            clip-path: inset(70% 0 10% 0);
            transform: translate(2px, 2px);
          }
          60% {
            clip-path: inset(20% 0 50% 0);
            transform: translate(-2px, -2px);
          }
          80% {
            clip-path: inset(50% 0 30% 0);
            transform: translate(1px, 1px);
          }
          100% {
            clip-path: inset(5% 0 80% 0);
            transform: translate(-1px, -1px);
          }
        }

        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>

      {showCustomCursor ? (
        <>
          <div
            className="cursor-dot pointer-events-none fixed left-0 top-0 z-[100] h-3 w-3 rounded-full bg-[#ccff00] mix-blend-difference"
            style={{ transform: `translate(${mousePos.x - 6}px, ${mousePos.y - 6}px) scale(${isHovering ? 0.5 : 1})` }}
          />
          <div
            className="cursor-ring pointer-events-none fixed left-0 top-0 z-[100] h-10 w-10 rounded-full border border-[#00f3ff] mix-blend-screen"
            style={{
              transform: `translate(${mousePos.x - 20}px, ${mousePos.y - 20}px) scale(${isHovering ? 1.5 : 1})`,
              opacity: isHovering ? 0.8 : 0.3,
              borderColor: isHovering ? "#ff0055" : "#00f3ff",
            }}
          />
        </>
      ) : null}

      <section className="relative z-10 overflow-hidden px-6 pb-16 pt-14 md:px-12 md:pt-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center">
          <div className="w-full max-w-[360px]">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm text-white/65 transition hover:text-white"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </Link>
            <div className="aspect-[9/16] overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-[0_35px_70px_rgba(0,0,0,0.55)]">
              <video
                src={lesson.video_url}
                poster={lesson.thumbnail}
                className="h-full w-full object-cover"
                muted
                autoPlay
                loop
                playsInline
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-5 lg:pl-10 xl:pl-14">
            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                demoReady
                  ? "border border-amber-300/40 bg-amber-400/10 text-amber-200"
                  : "border border-white/10 bg-white/6 text-white/45"
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {demoReady ? "DEMO 就绪" : "跟拍未就绪"}
            </div>

            <h1
              className="kpop-glitch text-5xl font-black leading-[1.05] tracking-tight md:text-7xl"
              data-text={lesson.title}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              {lesson.title}
            </h1>

            <div className="flex flex-wrap items-center gap-5 text-[13px] text-white/60">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(lesson.duration)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5" />
                BPM {Math.round(lesson.bpm)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                {activeSegments.length} 段动作
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {resumeSegId ? (
                <Link
                  href={`/player/${resumeSegId}?lesson=${lesson.id}`}
                  className="btn-strike z-10 px-7 py-3 text-[15px] font-bold uppercase tracking-widest transition-colors"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Play className="h-4 w-4 fill-current" />
                    {lastViewedSegmentId ? "继续学习" : "开始学习"}
                  </span>
                </Link>
              ) : null}

              {demoReady && allLearned ? (
                <Link
                  href={`/lesson/${lesson.id}/tracking-desktop`}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  <Sparkles className="h-4 w-4" />
                  跟拍挑战
                </Link>
              ) : (
                <span
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm text-white/40"
                  title={!demoReady ? "课程数据未处理完整" : "先学完所有动作卡再来挑战"}
                >
                  {!demoReady
                    ? "跟拍挑战未就绪"
                    : `先学完动作卡 (${learnedCount}/${total || activeSegments.length})`}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 my-8 w-full scale-105 -rotate-2 overflow-hidden border-y border-[#ccff00]/50 bg-[#ccff00] py-3 text-[#050505]">
        <div className="marquee-container text-xl font-black uppercase tracking-widest">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-4">
              <span>LESSON MODE</span>
              <Sparkles size={20} />
              <span>DANCE PULSE</span>
              <Zap size={20} />
              <span>SEGMENT FLOW</span>
              <Video size={20} />
            </div>
          ))}
        </div>
      </div>

      <section id="segments" className="relative z-10 mx-auto max-w-7xl px-6 pb-10 md:px-12">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="text-4xl font-bold uppercase tracking-tighter md:text-5xl">
            动作
            <br />
            <span className="kpop-text">SEGMENTS</span>
          </h2>
          <span className="text-xs uppercase tracking-[0.2em] text-white/45">
            READY {activeSegments.filter(segmentIsReady).length}/{activeSegments.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {activeSegments.map((seg, idx) => {
            const learned = isLearned(seg.id);
            const ready = segmentIsReady(seg);
            const cover = idx % 2 === 0 ? "#00f3ff" : "#ff0055";
            const teachingStatus = seg.teaching?.status;
            const isExpanded = activeTeachingSegId === seg.id;
            const showTeachingBtn = !seg.is_still && !!seg.teaching;

            return (
              <div
                key={seg.id}
                className="neon-card group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] p-1"
                style={{ "--hover-color": cover } as React.CSSProperties}
              >
                <Link
                  href={`/player/${seg.id}?lesson=${lesson.id}`}
                  className="block"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  <div
                    className="aspect-[9/16] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.04]"
                    style={{ backgroundImage: `url("${seg.thumbnail}")` }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,0.85)_100%)]" />
                  <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/85">
                    #{seg.index + 1}
                  </div>
                  {ready ? (
                    <div className="absolute right-3 top-3 rounded-full bg-amber-400/95 px-2 py-0.5 text-[9px] font-bold text-amber-950">
                      READY
                    </div>
                  ) : null}
                  {learned ? (
                    <div className="absolute right-3 top-9 rounded-full bg-emerald-400/95 px-2 py-0.5 text-[9px] font-bold text-emerald-950">
                      LEARNED
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "absolute inset-x-0 px-3",
                      showTeachingBtn ? "bottom-[58px]" : "bottom-3"
                    )}
                  >
                    <div className="line-clamp-1 text-[13px] font-semibold text-white">{seg.section_label}</div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-white/55">
                      <span>{seg.duration.toFixed(1)}s</span>
                      <span>{seg.beat_count} 拍</span>
                    </div>
                    {(() => {
                      const agg = difficultyMap.get(seg.id);
                      if (!agg || agg.attempts <= 0 || agg.measuredDifficulty < 4) return null;
                      const jointLabel = agg.topWorstJoint ? JOINT_LABELS[agg.topWorstJoint] : null;
                      return (
                        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#ff5c8a]/40 bg-[#ff0055]/15 px-2 py-0.5 text-[9px] font-semibold text-[#ff9cbb]">
                          <TrendingDown className="h-2.5 w-2.5" />
                          <span>难点{jointLabel ? ` · ${jointLabel}` : ""}</span>
                        </div>
                      );
                    })()}
                  </div>
                </Link>

                {showTeachingBtn && (
                  <div className="absolute inset-x-1 bottom-1 z-10 rounded-b-xl border-t border-[#00f3ff]/20 bg-black/85 px-3 py-2 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 flex-1 text-[10px] leading-snug text-white/70">
                        {teachingStatus === "ready"
                          ? seg.teaching!.summary
                          : teachingStatus === "pending"
                            ? "教学生成中..."
                            : "教学未就绪"}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleTeaching(seg.id);
                        }}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition",
                          isExpanded
                            ? "border-[#ccff00] bg-[#ccff00] text-[#050505]"
                            : "border-[#00f3ff]/60 bg-[#00f3ff]/10 text-[#00f3ff] hover:bg-[#00f3ff]/20"
                        )}
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>教学</span>
                        <ChevronDown
                          className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {activeTeachingSegId
        ? (() => {
            const activeSeg = activeSegments.find((s) => s.id === activeTeachingSegId);
            if (!activeSeg) return null;
            return (
              <section
                ref={detailRef}
                className="relative z-10 mx-auto max-w-7xl px-6 pb-16 md:px-12"
              >
                <div className="rounded-3xl border border-[#00f3ff]/30 bg-gradient-to-br from-[#0a0a0a] to-[#1a0033]/40 p-6 shadow-[0_30px_80px_rgba(0,243,255,0.12)] md:p-8">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="flex flex-wrap items-baseline gap-3 text-2xl font-black uppercase tracking-tight md:text-3xl">
                      <span className="kpop-text">AI 图文教学</span>
                      <span className="text-sm font-normal normal-case tracking-normal text-white/50">
                        #{activeSeg.index + 1} · {activeSeg.section_label}
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTeachingSegId(null)}
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                      className="rounded-full border border-white/20 bg-white/5 p-2 text-white/70 transition hover:border-[#ff0055]/60 hover:bg-[#ff0055]/10 hover:text-[#ff0055]"
                      aria-label="关闭教学详情"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-6 md:grid-cols-[280px_1fr]">
                    <div
                      className="aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-cover bg-center shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
                      style={{ backgroundImage: `url("${activeSeg.thumbnail}")` }}
                    />
                    <TeachingPanelKpop
                      segment={activeSeg}
                      regenerating={regeneratingSegId === activeSeg.id}
                      onRegenerate={() => handleRegenerate(activeSeg.id)}
                    />
                  </div>
                </div>
              </section>
            );
          })()
        : null}

    </main>
  );
}
