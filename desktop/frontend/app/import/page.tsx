"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, FileUp, Link2, Loader2, Sparkles, Upload } from "lucide-react";
import { importFromUrl, uploadVideo } from "@/lib/api";
import { cn } from "@/lib/utils";

const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const TRAILING_PUNCTUATION = /["'“”‘’，。！？!?、,;；）)\]}>]+$/g;
const VIDEO_HOST_PATTERNS = [
  "douyin.com",
  "iesdouyin.com",
  "bilibili.com",
  "b23.tv",
  "kuaishou.com",
  "v.kuaishou.com",
  "chenzhongtech.com",
  "xiaohongshu.com",
  "xhslink.com",
];

const PLATFORMS = [
  { id: "douyin", label: "抖音", accent: "#ff0055" },
  { id: "bilibili", label: "B站", accent: "#00f3ff" },
  { id: "kuaishou", label: "快手", accent: "#ffaa00" },
  { id: "xhs", label: "小红书", accent: "#ccff00" },
] as const;

const PIPELINE = [
  { index: "01", title: "下载解析", desc: "拉取视频，识别节拍与段落" },
  { index: "02", title: "切成动作卡", desc: "按 8 拍切成可跟练卡片" },
  { index: "03", title: "进入课程", desc: "完成后直达课程页开练" },
] as const;

function matchesSupportedHost(url: string): boolean {
  return VIDEO_HOST_PATTERNS.some((host) => url.includes(host));
}

function extractVideoUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const matches = raw.match(URL_PATTERN) ?? [];
  for (const match of matches) {
    const normalized = match.replace(TRAILING_PUNCTUATION, "");
    if (matchesSupportedHost(normalized)) {
      return normalized;
    }
  }

  const normalized = raw.replace(TRAILING_PUNCTUATION, "");
  if (matchesSupportedHost(normalized)) {
    return normalized;
  }

  return null;
}

export default function ImportPage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleUrlImport = async () => {
    if (!url.trim()) return;
    const extractedUrl = extractVideoUrl(url);
    if (!extractedUrl) {
      setError("未识别到支持的视频链接，请粘贴抖音 / B站 / 快手 / 小红书的分享文案或完整链接");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await importFromUrl(extractedUrl);
      setUrl(extractedUrl);
      router.push(`/import/processing?job=${response.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileImport = async (nextFile?: File | null) => {
    const target = nextFile ?? file;
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await uploadVideo(target);
      router.push(`/import/processing?job=${response.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onPickFile = (picked: File | null) => {
    if (!picked) return;
    if (!picked.type.includes("mp4") && !picked.name.toLowerCase().endsWith(".mp4")) {
      setError("目前仅支持 MP4 文件");
      return;
    }
    setFile(picked);
    setError(null);
  };

  return (
    <main className="relative mx-auto min-h-screen max-w-6xl px-6 pb-20 pt-10 text-white md:px-10 md:pt-14">
      <button
        type="button"
        onClick={() => router.push("/learn")}
        className="group mb-10 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-white/40 transition hover:text-[#00f3ff]"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" />
        返回学习
      </button>

      <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        {/* Left: brand narrative */}
        <section className="relative">
          <div className="pointer-events-none absolute -left-8 top-0 h-40 w-40 rounded-full bg-[#ff0055]/20 blur-3xl" />
          <div className="pointer-events-none absolute left-24 top-24 h-32 w-32 rounded-full bg-[#00f3ff]/15 blur-3xl" />

          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#00f3ff]/80">
            DancePulse · Import
          </p>
          <h1 className="mt-4 max-w-xl text-[42px] font-black leading-[1.05] tracking-tight md:text-[56px]">
            <span className="bg-gradient-to-r from-[#ff0055] via-[#ffaa00] to-[#00f3ff] bg-clip-text text-transparent">
              导入新视频
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] font-semibold leading-7 text-white">
            粘贴平台分享链接，或拖入本地 MP4。我们会自动拆节拍、生成动作卡，把一支舞变成可跟练课程。
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <span
                key={p.id}
                className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 backdrop-blur"
                style={{ boxShadow: `inset 0 0 0 1px ${p.accent}22` }}
              >
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.accent }} />
                {p.label}
              </span>
            ))}
          </div>

          <ol className="mt-12 space-y-0">
            {PIPELINE.map((step, i) => {
              // 提交中：01 闪烁；提交前：全部静态
              const active = submitting && i === 0;
              return (
              <li key={step.index} className="relative flex gap-4 pb-8 last:pb-0">
                {i < PIPELINE.length - 1 ? (
                  <span className="absolute left-[15px] top-9 h-[calc(100%-20px)] w-px bg-gradient-to-b from-[#00f3ff]/50 to-transparent" />
                ) : null}
                <span
                  className={cn(
                    "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-black/60 text-[11px] font-bold text-[#00f3ff] transition-all",
                    active
                      ? "animate-pulse border-[#00f3ff] shadow-[0_0_28px_rgba(0,243,255,0.55)]"
                      : "border-[#00f3ff]/40 shadow-[0_0_20px_rgba(0,243,255,0.25)]"
                  )}
                >
                  {step.index}
                </span>
                <div className="pt-0.5">
                  <div
                    className={cn(
                      "text-[15px] font-semibold text-white",
                      active && "drop-shadow-[0_0_12px_rgba(0,243,255,0.55)]"
                    )}
                  >
                    {step.title}
                  </div>
                  <div className="mt-1 text-[13px] leading-6 text-white/40">{step.desc}</div>
                </div>
              </li>
              );
            })}
          </ol>
        </section>

        {/* Right: actions */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-md md:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#9d4edd]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-[#ff0055]/15 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/45">
              <Link2 className="h-3.5 w-3.5 text-[#ff0055]" />
              链接导入
            </div>
            <label className="mt-4 block">
              <span className="sr-only">视频链接</span>
              <textarea
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={"粘贴抖音 / B站 / 快手 / 小红书\n分享文案或完整链接"}
                rows={5}
                className={cn(
                  "w-full resize-none rounded-2xl border bg-black/50 px-4 py-4 text-[15px] leading-7 text-white outline-none transition placeholder:text-white/28",
                  "border-white/10 focus:border-[#00f3ff]/55 focus:shadow-[0_0_0_3px_rgba(0,243,255,0.12)]"
                )}
              />
            </label>

            <button
              type="button"
              onClick={() => void handleUrlImport()}
              disabled={!url.trim() || submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff0055] via-[#9d4edd] to-[#00f3ff] px-4 py-3.5 text-[14px] font-bold tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting && !file ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              解析链接并开始处理
            </button>

            <div className="my-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-white/30">
              <span className="h-px flex-1 bg-white/10" />
              或
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/45">
              <Upload className="h-3.5 w-3.5 text-[#ccff00]" />
              本地 MP4
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4"
              onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onPickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition",
                dragOver
                  ? "border-[#ccff00]/70 bg-[#ccff00]/10"
                  : "border-white/15 bg-black/35 hover:border-[#00f3ff]/45 hover:bg-black/50"
              )}
            >
              <FileUp className={cn("h-6 w-6", dragOver ? "text-[#ccff00]" : "text-white/55")} />
              <div className="text-[14px] font-medium text-white/85">
                {file ? file.name : "点击选择，或拖拽 MP4 到这里"}
              </div>
              <div className="text-[12px] text-white/35">
                {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "仅 MP4 · 建议竖屏舞蹈素材"}
              </div>
            </button>

            {file ? (
              <button
                type="button"
                onClick={() => void handleFileImport()}
                disabled={submitting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ccff00]/35 bg-[#ccff00]/10 px-4 py-3.5 text-[14px] font-semibold text-[#ccff00] transition hover:bg-[#ccff00]/18 disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                上传并开始处理
              </button>
            ) : null}

            {error ? (
              <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] leading-6 text-red-100">
                {error}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
