"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImportJob } from "@/hooks/useImportJob";

const STEPS = [
  { key: "download", label: "下载视频", threshold: 20 },
  { key: "beat", label: "识别节拍", threshold: 45 },
  { key: "segment", label: "切分动作卡", threshold: 75 },
  { key: "teaching", label: "生成分步教学", threshold: 100 },
] as const;

export default function ImportProcessingPage() {
  return (
    <React.Suspense fallback={<ProcessingShell title="准备导入任务..." body="正在读取任务信息。" />}>
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

  const progress = job?.progress ?? 0;
  const statusText = error
    ? "导入遇到了一点问题"
    : job?.status === "failed"
      ? "导入失败"
      : loading
        ? "正在连接导入任务"
        : "AI 正在帮你拆解动作";

  return (
    <ProcessingShell
      title={statusText}
      body={error ?? job?.error ?? job?.fallback_hint ?? "稍等一下，我们正在准备你的课程。"}
    >

        <div className="mt-8 h-2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${Math.max(6, progress)}%` }}
          />
        </div>
        <div className="mt-3 text-right text-[13px] font-medium text-brand-light">
          {progress}%
        </div>

        <div className="mt-8 space-y-4">
          {STEPS.map((step, index) => {
            const active = (job?.phase ?? "download") === step.key;
            const complete = progress >= step.threshold || job?.status === "ready";

            return (
              <div
                key={step.key}
                className="flex items-center gap-4 rounded-[22px] bg-bg-root px-4 py-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                  {complete ? (
                    <CheckCircle2 className="h-5 w-5 text-brand-light" />
                  ) : active ? (
                    <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
                  ) : (
                    <span className="text-sm text-white/40">{index + 1}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium text-white">{step.label}</div>
                  <div className="mt-1 text-[13px] text-white/40">
                    {complete
                      ? "已完成"
                      : active
                        ? "正在进行中"
                        : "等待前一步完成"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(error || job?.status === "failed") && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => router.push("/import")}
            >
              <RotateCcw className="h-4 w-4" />
              重新导入
            </Button>
            <Link href="/learn" className="w-full">
              <Button variant="secondary" className="w-full">
                返回学习页
              </Button>
            </Link>
          </div>
        )}

        {!jobId && (
          <div className="mt-8">
            <Link href="/import">
              <Button variant="primary" className="w-full">
                返回导入页
              </Button>
            </Link>
          </div>
        )}
    </ProcessingShell>
  );
}

function ProcessingShell({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 text-white">
      <div className="rounded-[32px] bg-bg-surface px-6 py-8">
        <p className="text-[13px] uppercase tracking-[0.22em] text-white/35">
          IMPORTING
        </p>
        <h1 className="mt-4 text-[28px] font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-4 text-[14px] leading-7 text-white/45">{body}</p>
        {children}
      </div>
    </main>
  );
}
