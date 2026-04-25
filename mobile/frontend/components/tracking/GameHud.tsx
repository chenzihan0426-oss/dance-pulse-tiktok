"use client";

// 游戏化 HUD: 参考节奏游戏 / Just Dance 的布局
//
// 元素分布:
//   左上: 段落标签(section label), 当前在跳的段落
//   右上: 倒计时 / 总时长
//   顶部居中: Score (大数字)
//   左中: COMBO 竖排大数字 + x倍率徽章(连击高时发光)
//   右中: Tally 竖排 (PERFECT/GOOD/OK/MISS 小字 + 图标)
//   底部: 进度条 + 段落标记
//   全屏浮动: 飘字特效(+XXX PERFECT 从动作点飞出,淡出上飘)

import * as React from "react";
import { Zap, Music, Clock } from "lucide-react";
import type { Grade } from "@/lib/pose/scoring";

type ScoreEvent = {
  id: number;
  grade: Grade;
  value: number;
  x: number;
  y: number;
};

const GRADE_COLOR: Record<Grade, string> = {
  PERFECT: "text-amber-300",
  GOOD: "text-emerald-300",
  OK: "text-sky-300",
  MISS: "text-rose-300",
};

function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Combo 等级 → 色调 + label
function comboTier(combo: number): { color: string; glow: string; label?: string } {
  if (combo >= 20) return { color: "text-fuchsia-300", glow: "drop-shadow-[0_0_18px_rgba(240,85,220,0.9)]", label: "FEVER" };
  if (combo >= 10) return { color: "text-amber-300", glow: "drop-shadow-[0_0_14px_rgba(251,191,36,0.8)]", label: "HOT" };
  if (combo >= 5) return { color: "text-orange-300", glow: "drop-shadow-[0_0_10px_rgba(253,186,116,0.6)]" };
  if (combo >= 2) return { color: "text-sky-300", glow: "drop-shadow-[0_0_6px_rgba(125,211,252,0.5)]" };
  return { color: "text-white/60", glow: "" };
}

export default function GameHud({
  totalScore,
  combo,
  playing,
  sectionLabel,
  playhead,
  duration,
  events,
}: {
  totalScore: number;
  combo: number;
  playing: boolean;
  sectionLabel?: string;
  playhead: number;
  duration: number;
  events: ScoreEvent[];
}) {
  const progressPct = duration > 0 ? Math.min(100, (playhead / duration) * 100) : 0;
  const tier = comboTier(combo);

  // 飘字管理
  const [visibleEvents, setVisibleEvents] = React.useState<ScoreEvent[]>([]);
  const seenRef = React.useRef<Map<number, number>>(new Map());
  React.useEffect(() => {
    const now = performance.now();
    const fresh = events.filter((e) => !seenRef.current.has(e.id));
    fresh.forEach((e) => seenRef.current.set(e.id, now));
    if (fresh.length) setVisibleEvents((p) => [...p.slice(-8), ...fresh]);
    const timer = window.setTimeout(() => {
      const t = performance.now();
      setVisibleEvents((p) => p.filter((e) => t - (seenRef.current.get(e.id) ?? 0) < 1100));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [events]);

  // Score 数字跳动
  const [displayedScore, setDisplayedScore] = React.useState(totalScore);
  React.useEffect(() => {
    if (displayedScore === totalScore) return;
    const diff = totalScore - displayedScore;
    const step = Math.max(1, Math.floor(Math.abs(diff) / 10));
    const id = window.setInterval(() => {
      setDisplayedScore((cur) => {
        const next = diff > 0 ? Math.min(totalScore, cur + step) : Math.max(totalScore, cur - step);
        if (next === totalScore) window.clearInterval(id);
        return next;
      });
    }, 30);
    return () => window.clearInterval(id);
  }, [totalScore, displayedScore]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* 左上: 段落标签 */}
      {sectionLabel ? (
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur">
          <Music className="h-3 w-3 text-fuchsia-300" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-white/85">{sectionLabel}</span>
        </div>
      ) : null}

      {/* 右上: 时间 */}
      <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur">
        <Clock className="h-3 w-3 text-sky-300" />
        <span className="font-mono text-[11px] tabular-nums text-white/85">
          {fmtClock(playhead)} / {fmtClock(duration)}
        </span>
      </div>

      {/* 顶部中央: SCORE 大数字 */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">Score</div>
        <div className="mt-0.5 font-mono text-[42px] font-bold leading-none tabular-nums text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.35)]">
          {displayedScore.toLocaleString()}
        </div>
      </div>

      {/* 左中: COMBO 大徽章 (≥2 显示) */}
      {combo >= 2 ? (
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center rounded-2xl border border-white/10 bg-black/40 px-3 py-3 backdrop-blur ${tier.glow}`}>
          {tier.label ? (
            <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${tier.color}`}>
              {tier.label}
            </div>
          ) : null}
          <div className={`font-mono text-[56px] font-black leading-none tabular-nums ${tier.color}`}>
            {combo}
          </div>
          <div className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tier.color}`}>
            <Zap className="h-3 w-3" />
            Combo
          </div>
        </div>
      ) : null}

      {/* 底部进度条 */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-white/10 backdrop-blur">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-400 to-sky-400 transition-[width] duration-100"
            style={{ width: `${progressPct}%` }}
          />
          {/* 脉冲光点 */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] transition-[left] duration-100"
            style={{ left: `calc(${progressPct}% - 6px)` }}
          />
        </div>
      </div>

      {/* 飘字 */}
      {visibleEvents.map((e) => {
        const age = performance.now() - (seenRef.current.get(e.id) ?? 0);
        const t = Math.min(1, age / 1000);
        const translateY = -70 * t;
        const opacity = 1 - t;
        const scale = 1 + t * 0.3;
        return (
          <div
            key={e.id}
            className={`absolute flex flex-col items-center text-center font-black leading-none ${GRADE_COLOR[e.grade]}`}
            style={{
              left: `${e.x}%`,
              top: `${e.y}%`,
              transform: `translate(-50%, calc(-50% + ${translateY}px)) scale(${scale})`,
              opacity,
              textShadow: "0 0 12px rgba(0,0,0,0.8), 0 0 6px currentColor",
              fontFeatureSettings: "'tnum'",
            }}
          >
            <span className="text-[40px] tracking-tight">{e.grade}</span>
            {e.value > 0 ? <span className="mt-0.5 text-[18px]">+{e.value}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
