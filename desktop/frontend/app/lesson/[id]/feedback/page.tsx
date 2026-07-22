"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, History } from "lucide-react";

import { AmbientPageShell } from "@/components/effects/AmbientPageShell";
import type { FeedbackHistoryItem, FeedbackReport } from "@/lib/feedback";
import { getPreviousFeedbackSummary, listFeedbackHistory, loadFeedbackReport } from "@/lib/feedback";
import { listTrackingSessions, type TrackingSessionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-[#ccff00]";
  if (score >= 50) return "text-amber-300";
  return "text-[#ff5c8a]";
}

export default function FeedbackPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params?.id ?? "";
  const router = useRouter();
  const [report, setReport] = React.useState<FeedbackReport | null>(null);
  const [history, setHistory] = React.useState<FeedbackHistoryItem[]>([]);
  const [previous, setPrevious] = React.useState<FeedbackHistoryItem | null>(null);
  const [serverSessions, setServerSessions] = React.useState<TrackingSessionSummary[]>([]);

  React.useEffect(() => {
    const current = loadFeedbackReport(lessonId);
    setReport(current);
    setHistory(listFeedbackHistory(lessonId));
    setPrevious(getPreviousFeedbackSummary(lessonId, current?.createdAt));
    void listTrackingSessions(lessonId)
      .then(setServerSessions)
      .catch(() => setServerSessions([]));
  }, [lessonId]);

  if (!report) {
    return (
      <AmbientPageShell>
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center text-white">
          <p className="text-[13px] uppercase tracking-[0.28em] text-white/35">Feedback</p>
          <h1 className="mt-4 text-2xl font-bold">还没有本课的跟拍报告</h1>
          <p className="mt-3 max-w-md text-[14px] leading-6 text-white/50">
            完成一次跟拍挑战后，会在这里生成总分、诊断建议、分段点评与历史对比。
          </p>
          {history.length > 0 ? (
            <div className="mt-8 w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
              <div className="mb-3 flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-white/40">
                <History className="h-3.5 w-3.5" />
                本课历史成绩
              </div>
              <ul className="space-y-2">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex items-center justify-between text-[13px] text-white/70">
                    <span>{new Date(h.createdAt).toLocaleString()}</span>
                    <span className={cn("font-mono font-bold", scoreTone(h.overallBoneScore))}>
                      {h.overallBoneScore}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            href={`/lesson/${lessonId}/tracking-desktop`}
            className="mt-8 rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-6 py-3 text-[13px] font-semibold text-white"
          >
            去跟拍挑战
          </Link>
        </main>
      </AmbientPageShell>
    );
  }

  const delta =
    previous != null ? report.overallBoneScore - previous.overallBoneScore : null;

  return (
    <AmbientPageShell>
      <main className="relative mx-auto min-h-screen max-w-5xl px-6 pb-20 pt-10 text-white md:px-10">
        <button
          type="button"
          onClick={() => router.push(`/lesson/${lessonId}`)}
          className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-white/40 transition hover:text-[#00f3ff]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回课程
        </button>

        <header className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#00f3ff]/80">
              DancePulse · Feedback · 最终报告
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {report.lessonTitle ?? "跟拍评分报告"}
            </h1>
            <p className="mt-3 text-[15px] font-semibold leading-7 text-white">
              {report.headline || "完成本次跟拍后可查看诊断建议。"}
            </p>
            <p className="mt-2 text-[13px] text-white/45">
              主指标：骨段方向余弦 · {report.frameCount} 帧 · {new Date(report.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/40 px-6 py-4 text-right backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">总分</div>
            <div className={cn("mt-1 font-mono text-5xl font-black", scoreTone(report.overallBoneScore))}>
              {report.overallBoneScore}
            </div>
            <div className="mt-1 text-[12px] text-white/35">融合对照分 {report.overallFusedScore}</div>
            {delta != null ? (
              <div
                className={cn(
                  "mt-2 text-[12px] font-semibold",
                  delta > 0 ? "text-emerald-300" : delta < 0 ? "text-[#ff8fb3]" : "text-white/45",
                )}
              >
                较上次 {delta > 0 ? `+${delta}` : delta}
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-white/35">本课首次报告</div>
            )}
          </div>
        </header>

        {(report.insights?.length ?? 0) > 0 ? (
          <section className="mt-10">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/45">问题与建议</h2>
            <ul className="mt-4 space-y-3">
              {report.insights.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent px-5 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        item.severity === "high"
                          ? "bg-[#ff0055]/25 text-[#ff8fb3]"
                          : item.severity === "medium"
                            ? "bg-amber-400/20 text-amber-200"
                            : "bg-white/10 text-white/60",
                      )}
                    >
                      {item.severity === "high" ? "优先" : item.severity === "medium" ? "关注" : "提示"}
                    </span>
                    <span className="text-[16px] font-semibold text-white">{item.title}</span>
                  </div>
                  <p className="mt-2 text-[14px] leading-6 text-white/75">{item.problem}</p>
                  <p className="mt-1.5 text-[13px] leading-6 text-[#00f3ff]/85">建议：{item.tip}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(report.segmentComments?.length ?? 0) > 0 ? (
          <section className="mt-10">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/45">分段点评</h2>
            <ul className="mt-4 space-y-2">
              {report.segmentComments.map((c) => (
                <li
                  key={c.segmentId}
                  className="rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-[14px] leading-6 text-white/80"
                >
                  {c.comment}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">最需加强 · 骨段</div>
            {report.worstBone ? (
              <>
                <div className="mt-3 text-xl font-semibold text-[#ff5c8a]">{report.worstBone.label}</div>
                <div className="mt-1 font-mono text-[13px] text-white/50">
                  cos {report.worstBone.meanCosine.toFixed(3)} · {report.worstBone.score} 分
                </div>
              </>
            ) : (
              <div className="mt-3 text-white/40">暂无数据</div>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">最需加强 · 关节角</div>
            {report.worstJoint ? (
              <>
                <div className="mt-3 text-xl font-semibold text-amber-300">{report.worstJoint.label}</div>
                <div className="mt-1 font-mono text-[13px] text-white/50">
                  误差 {(report.worstJoint.meanError * 100).toFixed(0)}%
                </div>
              </>
            ) : (
              <div className="mt-3 text-white/40">暂无数据</div>
            )}
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/45">分段明细</h2>
          {report.segments.map((seg) => (
            <article
              key={seg.segmentId}
              className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
                <div>
                  <div className="text-[16px] font-semibold">{seg.label}</div>
                  <div className="mt-0.5 text-[12px] text-white/40">{seg.frameCount} 帧采样</div>
                </div>
                <div className="text-right">
                  <div className={cn("font-mono text-2xl font-bold", scoreTone(seg.boneScore))}>{seg.boneScore}</div>
                  <div className="text-[11px] text-white/35">融合 {seg.fusedScore}</div>
                </div>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/35">骨段余弦分</div>
                  <ul className="space-y-1.5">
                    {seg.bones.slice(0, 6).map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="text-white/70">{b.label}</span>
                        <span className="font-mono text-white/45">
                          {b.meanCosine.toFixed(2)} · {b.score}
                        </span>
                      </li>
                    ))}
                    {seg.bones.length === 0 ? <li className="text-white/35">无有效骨段</li> : null}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/35">关节角度误差</div>
                  <ul className="space-y-1.5">
                    {seg.joints.slice(0, 6).map((j) => (
                      <li key={j.id} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="text-white/70">{j.label}</span>
                        <span className="font-mono text-white/45">{(j.meanError * 100).toFixed(0)}%</span>
                      </li>
                    ))}
                    {seg.joints.length === 0 ? <li className="text-white/35">无有效关节</li> : null}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* 阶段 4：历史回看 + 同课对比 */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.22em] text-white/45">
            <History className="h-3.5 w-3.5" />
            本课历史 · 同课对比
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">本地记录</div>
              {history.length === 0 ? (
                <p className="mt-3 text-[13px] text-white/40">暂无历史</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {history.slice(0, 8).map((h, i) => (
                    <li
                      key={h.id}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-3 py-2 text-[13px]",
                        i === 0 ? "bg-[#ccff00]/10 text-white" : "text-white/65",
                      )}
                    >
                      <span>
                        {i === 0 ? "本次 · " : ""}
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                      <span className={cn("font-mono font-bold", scoreTone(h.overallBoneScore))}>
                        {h.overallBoneScore}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">服务端会话</div>
              {serverSessions.length === 0 ? (
                <p className="mt-3 text-[13px] text-white/40">暂无已同步会话（或未登录）</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {serverSessions.slice(0, 8).map((s) => (
                    <li key={s.sessionId} className="flex items-center justify-between text-[13px] text-white/65">
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      <span className={cn("font-mono font-bold", scoreTone(s.overallScore))}>{s.overallScore}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={`/lesson/${lessonId}/tracking-desktop`}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-[13px] font-semibold text-white/85 transition hover:border-[#00f3ff]/40 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            再挑战一次
          </Link>
          <Link
            href={`/lesson/${lessonId}`}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-5 py-2.5 text-[13px] font-semibold text-white"
          >
            回课程页
          </Link>
        </div>
      </main>
    </AmbientPageShell>
  );
}
