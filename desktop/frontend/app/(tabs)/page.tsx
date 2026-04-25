"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, ChevronRight, Play, Sparkles, Video, Zap } from "lucide-react";
import { getLessons } from "@/lib/api";

type HomeLesson = {
  id: string;
  title: string;
  instructor: string;
  difficulty: string;
  progress: number;
  cover: string;
  thumbnail: string;
};

const COVER_COLORS = ["#ff0055", "#00f3ff", "#ccff00", "#9d4edd", "#ffaa00"];
const INSTRUCTORS = ["J-HOPE Style", "Urban King", "Lisa Flow", "Neon Unit", "Street Core"];
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

const FALLBACK_LESSONS: HomeLesson[] = [
  {
    id: "demo-1",
    title: "HIP-HOP 基础律动",
    instructor: "J-HOPE Style",
    difficulty: "Beginner",
    progress: 80,
    cover: "#ff0055",
    thumbnail: "",
  },
  {
    id: "demo-2",
    title: "Popping 震感专项",
    instructor: "Urban King",
    difficulty: "Advanced",
    progress: 15,
    cover: "#00f3ff",
    thumbnail: "",
  },
  {
    id: "demo-3",
    title: "K-pop 女团核心",
    instructor: "Lisa Flow",
    difficulty: "Intermediate",
    progress: 0,
    cover: "#ccff00",
    thumbnail: "",
  },
];

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

export default function DesktopHome() {
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = React.useState(false);
  const [showCustomCursor, setShowCustomCursor] = React.useState(false);
  const mouseRef = React.useRef({ x: -1000, y: -1000 });
  const [lessons, setLessons] = React.useState<HomeLesson[]>([]);

  React.useEffect(() => {
    setShowCustomCursor(window.matchMedia("(pointer:fine)").matches);

    let cancelled = false;
    getLessons()
      .then((items) => {
        if (cancelled) return;
        if (!items.length) {
          setLessons(FALLBACK_LESSONS);
          return;
        }

        const mapped: HomeLesson[] = items.map((lesson, index) => ({
          id: lesson.id,
          title: lesson.title,
          instructor: INSTRUCTORS[index % INSTRUCTORS.length],
          difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
          progress: lesson.demo_ready ? 100 : lesson.confirmed ? 65 : index % 2 === 0 ? 15 : 0,
          cover: COVER_COLORS[index % COVER_COLORS.length],
          thumbnail: lesson.thumbnail,
        }));
        setLessons(mapped);
      })
      .catch(() => {
        if (!cancelled) setLessons(FALLBACK_LESSONS);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050505] font-sans text-white selection:bg-[#ff0055] selection:text-white">
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
          transform: translateY(-10px) scale(1.02);
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
          opacity: 0.6;
        }

        .bar {
          height: 20%;
          animation: equalize 1.2s ease-in-out infinite;
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

        @keyframes shapeGrooveD {
          0%,
          100% {
            transform: translate(-1px, 0) rotate(-1deg);
          }
          50% {
            transform: translate(2px, -1px) rotate(2deg);
          }
        }

        @keyframes shapeGrooveP {
          0%,
          100% {
            transform: translate(1px, 0) rotate(1deg);
          }
          50% {
            transform: translate(-2px, 2px) rotate(-2deg);
          }
        }

        @keyframes holoDriftCyan {
          from {
            transform: translate(0, 0);
            opacity: 0.8;
          }
          to {
            transform: translate(-1.5px, 0.8px);
            opacity: 0.45;
          }
        }

        @keyframes holoDriftPink {
          from {
            transform: translate(0, 0);
            opacity: 0.85;
          }
          to {
            transform: translate(1.5px, -1px);
            opacity: 0.45;
          }
        }

        @keyframes equalize {
          0%,
          100% {
            height: 18%;
          }
          50% {
            height: 100%;
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

      <header className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
        <div className="z-10 flex flex-col items-center text-center">
          <h1
            className="kpop-glitch mt-2 select-none text-7xl font-black uppercase leading-none tracking-tighter md:text-9xl"
            data-text="不如跳舞"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            不如跳舞
          </h1>

          <button
            type="button"
            className="btn-strike z-10 mt-12 cursor-pointer px-10 py-4 text-lg font-bold uppercase tracking-widest transition-colors"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => document.getElementById("lessons")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="relative z-10 flex items-center gap-3">
              开始律动
              <Play size={18} fill="currentColor" />
            </span>
          </button>
        </div>

        <div className="absolute bottom-10 flex h-16 items-end gap-1.5 opacity-30">
          {[...Array(15)].map((_, i) => (
            <div key={i} className="bar w-1.5 bg-white" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </header>

      <div className="relative z-10 my-10 w-full scale-105 -rotate-2 overflow-hidden border-y border-[#ccff00]/50 bg-[#ccff00] py-4 text-[#050505]">
        <div className="marquee-container text-2xl font-black uppercase tracking-widest">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-4">
              <span>不如跳舞 DP</span>
              <Sparkles size={24} />
              <span>DANCE PULSE</span>
              <Zap size={24} />
              <span>STREET VIBE</span>
              <Activity size={24} />
              <span>NEON FLOW</span>
              <Sparkles size={24} />
            </div>
          ))}
        </div>
      </div>

      <section id="lessons" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-16 flex items-end justify-between">
          <h3
            className="text-4xl font-bold uppercase tracking-tighter md:text-6xl"
            style={{ fontFamily: "'Black Han Sans', sans-serif", transform: "skewX(-10deg)" }}
          >
            课程
            <br />
            <span className="kpop-text">LESSONS</span>
          </h3>
          <a
            href="#lessons"
            className="flex cursor-pointer items-center gap-2 text-sm uppercase tracking-widest text-white/50 transition-colors hover:text-white"
            style={{ transform: "skewX(-10deg)" }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            EXPLORE ALL <ChevronRight size={16} />
          </a>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {lessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/lesson/${lesson.id}`}
              className="neon-card group relative flex h-[420px] flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] p-1"
              style={{ "--hover-color": lesson.cover } as React.CSSProperties}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              <div
                className="relative h-3/5 w-full overflow-hidden bg-[#111] bg-cover bg-center"
                style={lesson.thumbnail ? { backgroundImage: `url("${lesson.thumbnail}")` } : undefined}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.8)_0%,transparent_100%)] opacity-20 mix-blend-overlay" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video
                    size={48}
                    color={lesson.cover}
                    className="opacity-50 transition-all duration-500 group-hover:scale-110 group-hover:opacity-100"
                  />
                </div>
                <div className="absolute left-4 top-4 border border-white/10 bg-black/60 px-3 py-1 text-xs font-mono uppercase text-white/80 backdrop-blur-md">
                  {lesson.difficulty}
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <h4
                    className="line-clamp-1 text-xl font-bold uppercase tracking-wide text-white transition-colors group-hover:text-white"
                    style={{ fontFamily: "'Black Han Sans', sans-serif" }}
                  >
                    {lesson.title}
                  </h4>
                  <p className="mt-2 text-sm text-white/40">{lesson.instructor}</p>
                </div>

                <div className="mt-4 w-full">
                  <div className="mb-2 flex justify-between text-xs font-mono text-white/50">
                    <span>PROGRESS</span>
                    <span style={{ color: lesson.progress > 0 ? lesson.cover : undefined }}>{lesson.progress}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full transition-all duration-1000 ease-out"
                      style={{ width: `${lesson.progress}%`, backgroundColor: lesson.cover }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 py-24 text-center text-xs font-medium uppercase tracking-[0.3em] text-white/20">
        DANCE PULSE // STUDIO V1.1
      </footer>
    </main>
  );
}
