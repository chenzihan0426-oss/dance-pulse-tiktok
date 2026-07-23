"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useImportJob } from "@/hooks/useImportJob";
import { cn } from "@/lib/utils";

/** 与导入页左侧叙事对齐的三阶段 */
const PIPELINE = [
  { index: "01", title: "下载解析", desc: "拉取视频，识别节拍与段落", min: 0, max: 45 },
  { index: "02", title: "切成动作卡", desc: "按 8 拍切成可跟练卡片", min: 45, max: 80 },
  { index: "03", title: "进入课程", desc: "完成后直达课程页开练", min: 80, max: 100 },
] as const;

export default function ImportProcessingPage() {
  return (
    <React.Suspense
      fallback={
        <ProcessingLayout progress={4} activeStep={0} title="准备导入任务..." body="正在读取任务信息。" />
      }
    >
      <ImportProcessingContent />
    </React.Suspense>
  );
}

function ImportProcessingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams?.get("job") ?? null;
  const { job, loading, error } = useImportJob(jobId);

  React.useEffect(() => {
    if (job?.status === "ready" && job.lesson_id) {
      router.replace(`/lesson/${job.lesson_id}`);
    }
  }, [job, router]);

  const progress = Math.max(0, Math.min(100, job?.progress ?? (loading ? 6 : 0)));
  const failed = Boolean(error || job?.status === "failed");
  const ready = job?.status === "ready";

  const activeStep = ready
    ? 2
    : failed
      ? Math.max(0, PIPELINE.findIndex((s) => progress < s.max))
      : progress >= 80
        ? 2
        : progress >= 45
          ? 1
          : 0;

  const title = failed
    ? "导入遇到了一点问题"
    : loading && !job
      ? "正在连接导入任务"
      : ready
        ? "课程已就绪"
        : "AI 正在拆解动作";

  const body =
    error ??
    job?.error ??
    job?.fallback_hint ??
    (loading && !job ? "稍等，正在接通任务通道。" : "请稍候，进度会实时更新。");

  return (
    <ProcessingLayout
      progress={progress}
      activeStep={activeStep}
      title={title}
      body={body}
      failed={failed}
      jobId={jobId}
      onRetry={() => router.push("/import")}
      onLearn={() => router.push("/learn")}
    />
  );
}

function ProcessingLayout({
  progress,
  activeStep,
  title,
  body,
  failed = false,
  jobId,
  onRetry,
  onLearn,
}: {
  progress: number;
  activeStep: number;
  title: string;
  body: string;
  failed?: boolean;
  jobId?: string | null;
  onRetry?: () => void;
  onLearn?: () => void;
}) {
  return (
    <main className="relative mx-auto min-h-screen max-w-6xl px-6 pb-20 pt-10 text-white md:px-10 md:pt-14">
      <style jsx global>{`
        @keyframes dp-step-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(0, 243, 255, 0.55), 0 0 22px rgba(0, 243, 255, 0.35);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(0, 243, 255, 0), 0 0 36px rgba(255, 0, 85, 0.45);
          }
        }
        @keyframes dp-step-title-glow {
          0%,
          100% {
            text-shadow: 0 0 8px rgba(0, 243, 255, 0.35);
          }
          50% {
            text-shadow: 0 0 18px rgba(255, 0, 85, 0.55), 0 0 28px rgba(0, 243, 255, 0.35);
          }
        }
        @keyframes dp-progress-shimmer {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 200% 50%;
          }
        }
        .dp-import-step-active {
          animation: dp-step-pulse 1.6s ease-in-out infinite;
        }
        .dp-import-title-active {
          animation: dp-step-title-glow 1.6s ease-in-out infinite;
        }
        .dp-import-bar-fill {
          background: linear-gradient(90deg, #ff0055, #ffaa00, #ccff00, #00f3ff, #9d4edd, #ff0055);
          background-size: 200% 100%;
          animation: dp-progress-shimmer 2.2s linear infinite;
        }
      `}</style>

      <button
        type="button"
        onClick={onRetry}
        className="group mb-10 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-white/40 transition hover:text-[#00f3ff]"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" />
        返回导入
      </button>

      <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <section className="relative">
          <div className="pointer-events-none absolute -left-8 top-0 h-40 w-40 rounded-full bg-[#ff0055]/20 blur-3xl" />
          <div className="pointer-events-none absolute left-24 top-24 h-32 w-32 rounded-full bg-[#00f3ff]/15 blur-3xl" />

          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#00f3ff]/80">
            DancePulse · Importing
          </p>
          <h1 className="mt-4 max-w-xl text-[36px] font-black leading-[1.08] tracking-tight md:text-[48px]">
            <span className="bg-gradient-to-r from-[#ff0055] via-[#ffaa00] to-[#00f3ff] bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] font-semibold leading-7 text-white">{body}</p>

          <ol className="mt-12 space-y-0">
            {PIPELINE.map((step, i) => {
              const done = progress >= step.max || (activeStep > i && !failed);
              const active = !failed && activeStep === i && !done;
              return (
                <li key={step.index} className="relative flex gap-4 pb-8 last:pb-0">
                  {i < PIPELINE.length - 1 ? (
                    <span
                      className={cn(
                        "absolute left-[15px] top-9 h-[calc(100%-20px)] w-px transition-colors duration-500",
                        done ? "bg-gradient-to-b from-[#00f3ff] to-[#9d4edd]/40" : "bg-white/10"
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-black/60 text-[11px] font-bold transition-all duration-500",
                      done
                        ? "border-emerald-300/70 text-emerald-300 shadow-[0_0_22px_rgba(52,211,153,0.45)]"
                        : active
                          ? "dp-import-step-active border-[#00f3ff] text-[#00f3ff]"
                          : "border-white/20 text-white/35"
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : step.index}
                  </span>
                  <div className="pt-0.5">
                    <div
                      className={cn(
                        "text-[15px] font-semibold transition-colors duration-500",
                        done ? "text-emerald-200" : active ? "dp-import-title-active text-white" : "text-white/45"
                      )}
                    >
                      {step.title}
                      {active ? (
                        <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-[#00f3ff]" />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[13px] leading-6 transition-colors",
                        active ? "text-white/70" : "text-white/35"
                      )}
                    >
                      {done ? "已完成" : active ? "进行中…" : step.desc}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-md md:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#9d4edd]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-[#ff0055]/15 blur-3xl" />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/45">
                <Sparkles className="h-3.5 w-3.5 text-[#ff0055]" />
                实时进度
              </div>
              <div className="font-mono text-[22px] font-bold tabular-nums text-[#00f3ff]">{Math.round(progress)}%</div>
            </div>

            <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
              <div
                className="dp-import-bar-fill absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(failed ? progress : Math.max(progress, 4), 4)}%` }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_55%)]" />
            </div>

            <div className="mt-3 flex justify-between text-[11px] uppercase tracking-[0.16em] text-white/30">
              <span>开始</span>
              <span>切卡</span>
              <span>完成</span>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
              <div className="text-[13px] font-semibold text-white">当前阶段</div>
              <div className="mt-1 text-[14px] text-white/70">
                {failed ? "已中断，可返回重试" : PIPELINE[activeStep]?.title ?? "准备中"}
              </div>
              <div className="mt-3 text-[13px] leading-6 text-white/45">{body}</div>
            </div>

            {(failed || !jobId) && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-4 py-3 text-[13px] font-bold text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  {jobId ? "重新导入" : "返回导入页"}
                </button>
                {failed ? (
                  <button
                    type="button"
                    onClick={onLearn}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-semibold text-white/80"
                  >
                    返回学习页
                  </button>
                ) : null}
              </div>
            )}

            {!failed && jobId ? (
              <p className="mt-6 text-center text-[12px] text-white/35">
                完成后会自动进入课程页 ·{" "}
                <Link href="/import" className="text-[#00f3ff]/80 underline-offset-2 hover:underline">
                  取消并返回
                </Link>
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
