"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, FileUp, Link2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importFromUrl, uploadVideo } from "@/lib/api";

const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const TRAILING_PUNCTUATION = /["'“”‘’，。！？!?、,;；）)\]}>]+$/g;
function extractDouyinUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const matches = raw.match(URL_PATTERN) ?? [];
  for (const match of matches) {
    const normalized = match.replace(TRAILING_PUNCTUATION, "");
    if (normalized.includes("douyin.com") || normalized.includes("iesdouyin.com")) {
      return normalized;
    }
  }

  const normalized = raw.replace(TRAILING_PUNCTUATION, "");
  if (normalized.includes("douyin.com") || normalized.includes("iesdouyin.com")) {
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
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleUrlImport = async () => {
    if (!url.trim()) return;
    const extractedUrl = extractDouyinUrl(url);
    if (!extractedUrl) {
      setError("未识别到有效的抖音链接，请直接粘贴分享文案或完整链接");
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

  const handleFileImport = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await uploadVideo(file);
      router.push(`/import/processing?job=${response.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8 text-white">
      <button
        type="button"
        onClick={() => router.push("/learn")}
        className="mb-8 inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        返回学习页
      </button>

      <section className="rounded-[32px] bg-bg-surface px-6 py-7">
        <p className="text-[13px] uppercase tracking-[0.22em] text-white/35">
          IMPORT
        </p>
        <h1 className="mt-4 text-[28px] font-semibold tracking-tight text-white">
          导入新视频
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-white/45">
          粘贴抖音链接，或者上传本地 MP4。系统会自动下载视频、拆分节拍、生成课程卡片。
        </p>

        <textarea
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="粘贴抖音链接"
          className="mt-8 h-40 w-full rounded-[24px] border border-white/8 bg-bg-root px-5 py-4 text-[20px] leading-8 text-white placeholder:text-white/28"
        />

        <div className="mt-5 flex items-center justify-between gap-4 rounded-[20px] bg-bg-root px-4 py-4">
          <div>
            <div className="text-[15px] font-medium text-white">本地上传</div>
            <div className="mt-1 text-[13px] text-white/40">
              如果你已经有 MP4，也可以直接上传。
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="hidden"
          />
          <Button
            variant="secondary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-11 rounded-full px-4"
          >
            <Plus className="h-4 w-4" />
            {file ? "已选择" : "选择文件"}
          </Button>
        </div>

        {file && (
          <button
            type="button"
            onClick={handleFileImport}
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-[15px] font-medium text-white transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            上传并开始处理
          </button>
        )}

        <div className="mt-8 space-y-3">
          <StepHint
            index="01"
            title="下载并解析视频"
            description="我们会先获取视频内容，并识别节拍和段落。"
          />
          <StepHint
            index="02"
            title="自动切成动作卡"
            description="系统会把整支舞切成更适合跟练的短卡片。"
          />
          <StepHint
            index="03"
            title="进入课程继续学习"
            description="导入完成后会直接进入课程页，不再强制跳确认页。"
          />
        </div>

        <Button
          className="mt-8 h-14 w-full rounded-[18px] text-[15px]"
          variant="primary"
          onClick={handleUrlImport}
          disabled={!url.trim() || submitting}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          解析链接并开始处理
        </Button>

        {error && (
          <div className="mt-5 whitespace-pre-wrap rounded-[20px] bg-state-danger/10 px-4 py-4 text-sm text-red-200">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

function StepHint({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] bg-bg-root px-4 py-4">
      <div className="text-[12px] uppercase tracking-[0.18em] text-brand-light/80">
        {index}
      </div>
      <div className="mt-2 text-[15px] font-medium text-white">{title}</div>
      <div className="mt-1 text-[13px] leading-6 text-white/40">{description}</div>
    </div>
  );
}
