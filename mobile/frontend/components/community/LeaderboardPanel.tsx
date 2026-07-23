import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import {
  MY_LEADERBOARD_PLACEHOLDER,
  SONG_CHALLENGE_BOARDS,
  WEEKLY_LEADERBOARD,
  type LeaderboardRow,
} from "@/lib/communityShowcase";

function Delta({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-[#ccff00]">
        <ArrowUp className="h-3 w-3" />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-[#ff0055]">
        <ArrowDown className="h-3 w-3" />
        {Math.abs(delta)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-white/35">
      <Minus className="h-3 w-3" />
      0
    </span>
  );
}

function rankAccent(rank: number) {
  if (rank === 1) return "#ccff00";
  if (rank === 2) return "#00f3ff";
  if (rank === 3) return "#ffaa00";
  return "rgba(255,255,255,0.45)";
}

function RankRow({ row, emphasize }: { row: LeaderboardRow; emphasize?: boolean }) {
  const accent = rankAccent(row.rank);
  const inner = (
    <div
      className={`flex min-h-[56px] items-center gap-3 border px-3 py-3 transition active:bg-black/50 ${
        emphasize
          ? "border-[#ccff00]/35 bg-[#ccff00]/8"
          : "border-white/8 bg-black/35 active:border-white/18"
      }`}
    >
      <div className="w-7 text-center font-mono text-[18px] font-black" style={{ color: accent }}>
        {row.rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[14px] font-semibold text-white">{row.displayName}</div>
          <Delta delta={row.delta} />
        </div>
        <div className="mt-0.5 truncate text-[11px] text-white/45">
          {row.lessonTitle}
          {row.worksThisWeek ? ` · 本周 ${row.worksThisWeek} 作` : ""}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[20px] font-black text-white">{row.score || "—"}</div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">pts</div>
      </div>
    </div>
  );

  if (!row.resultId) return inner;
  return <Link href={`/community/result/${row.resultId}`}>{inner}</Link>;
}

export function LeaderboardPanel() {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[#ccff00]" />
          <h3
            className="text-[20px] font-black text-white"
            style={{ fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif", transform: "skewX(-4deg)" }}
          >
            本周综合榜 Top 10
          </h3>
        </div>
        <div className="space-y-2">
          {WEEKLY_LEADERBOARD.map((row) => (
            <RankRow key={`${row.rank}-${row.resultId}`} row={row} />
          ))}
          <div className="pt-2">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">你的赛位</div>
            <RankRow row={MY_LEADERBOARD_PLACEHOLDER} emphasize />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        {SONG_CHALLENGE_BOARDS.map((board) => (
          <div key={board.lessonId} className="border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#00f3ff]/80">
                  Song Board
                </div>
                <h4 className="mt-1 text-[16px] font-semibold text-white">{board.lessonTitle}</h4>
                <div className="mt-1 font-mono text-[12px] text-white/45">
                  {board.participants} 人 · MAX {board.topScore}
                </div>
              </div>
              <Link
                href={`/lesson/${board.lessonId}/tracking`}
                className="shrink-0 bg-[#ccff00] px-3 py-2 text-[11px] font-bold text-black transition active:bg-white"
                style={{ transform: "skewX(-6deg)" }}
              >
                <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>去跟跳</span>
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {board.rows.map((row) => (
                <RankRow key={row.resultId} row={row} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
