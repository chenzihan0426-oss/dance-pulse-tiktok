"use client";

// 游戏化评分 HUD
//   - 左上角: Combo (大数字, 0 时隐藏)
//   - 右上角(小窗之下): Total Score
//   - 底部中间: tally (PERFECT / GOOD / OK / MISS 计数)
//   - 飘字: score events 在画面中迸出 "+100 PERFECT" 类, 上飘消失

import * as React from "react";
import type { Grade } from "@/lib/pose/scoring";

type ScoreEvent = {
  id: number;
  grade: Grade;
  value: number;
  x: number; // 百分比
  y: number; // 百分比
};

const GRADE_COLOR: Record<Grade, string> = {
  PERFECT: "text-amber-300",
  GOOD: "text-emerald-300",
  OK: "text-sky-300",
  MISS: "text-rose-300",
};

export function ScoreHud({
  totalScore,
  combo,
  tallies,
  events,
  playing,
  floatingOnly = false,
}: {
  totalScore: number;
  combo: number;
  tallies: Record<Grade, number>;
  events: ScoreEvent[];
  playing: boolean;
  floatingOnly?: boolean;
}) {
  // 清理老事件
  const [visible, setVisible] = React.useState<ScoreEvent[]>([]);
  const seenRef = React.useRef<Map<number, number>>(new Map());

  React.useEffect(() => {
    const now = performance.now();
    const fresh = events.filter((e) => !seenRef.current.has(e.id));
    fresh.forEach((e) => seenRef.current.set(e.id, now));
    if (fresh.length) setVisible((prev) => [...prev.slice(-6), ...fresh]);

    // 1.1s 后清理
    const timer = window.setTimeout(() => {
      const t = performance.now();
      setVisible((prev) => prev.filter((e) => t - (seenRef.current.get(e.id) ?? 0) < 1100));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [events]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 非 floatingOnly 才画指标,否则只飘字 */}
      {!floatingOnly && combo >= 2 ? (
        <div className="absolute left-6 top-6 flex items-baseline gap-2">
          <span className="text-[12px] uppercase tracking-[0.2em] text-white/55">Combo</span>
          <span className="text-[44px] font-bold tabular-nums leading-none text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">
            {combo}
          </span>
        </div>
      ) : null}

      {/* Total Score + Tally: 仅非 floatingOnly 模式显示 */}
      {!floatingOnly ? (
        <>
          <div className="absolute right-4 top-24 min-w-[140px] max-w-[240px] rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-right backdrop-blur">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">Score</div>
            <div className="font-mono text-[28px] font-semibold leading-none text-white">
              {totalScore.toLocaleString()}
            </div>
          </div>
          {playing ? (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur">
              {(["PERFECT", "GOOD", "OK", "MISS"] as const).map((g) => (
                <span key={g} className={`text-[12px] font-semibold ${GRADE_COLOR[g]}`}>
                  {g} · {tallies[g]}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {/* 飘字 */}
      {visible.map((e) => {
        const age = performance.now() - (seenRef.current.get(e.id) ?? 0);
        const t = Math.min(1, age / 1000);
        const translateY = -60 * t;
        const opacity = 1 - t;
        return (
          <div
            key={e.id}
            className={`absolute flex flex-col items-center text-center font-bold leading-none ${GRADE_COLOR[e.grade]}`}
            style={{
              left: `${e.x}%`,
              top: `${e.y}%`,
              transform: `translate(-50%, calc(-50% + ${translateY}px))`,
              opacity,
              textShadow: "0 0 10px rgba(0,0,0,0.75)",
            }}
          >
            <span className="text-[34px]">{e.grade}</span>
            {e.value > 0 ? <span className="mt-0.5 text-[16px]">+{e.value}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export default ScoreHud;
