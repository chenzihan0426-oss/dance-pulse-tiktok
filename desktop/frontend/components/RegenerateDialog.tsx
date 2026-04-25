"use client";

import * as React from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import type { RegeneratePayload } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: RegeneratePayload) => Promise<void> | void;
  submitting?: boolean;
}

export function RegenerateDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: Props) {
  const [granularity, setGranularity] = React.useState<4 | 8 | 16>(8);
  const [stillHandling, setStillHandling] = React.useState<
    "mark" | "merge" | "delete"
  >("mark");
  const [sectionDetection, setSectionDetection] = React.useState(true);

  const submit = async () => {
    await onSubmit({
      granularity,
      still_handling: stillHandling,
      section_detection: sectionDetection,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !submitting && onOpenChange(v)}
      title="重新切分"
      description="所有当前未提交的修改将被丢弃。此操作不可撤销。"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "处理中…" : "重新切分"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="切片粒度">
          <div className="flex gap-2">
            {[4, 8, 16].map((n) => (
              <RadioPill
                key={n}
                label={`${n} 拍`}
                active={granularity === n}
                onClick={() => setGranularity(n as 4 | 8 | 16)}
              />
            ))}
          </div>
        </Field>

        <Field label="静止片段处理">
          <div className="flex gap-2">
            {(
              [
                { key: "mark", label: "标记" },
                { key: "merge", label: "合并" },
                { key: "delete", label: "删除" },
              ] as const
            ).map((o) => (
              <RadioPill
                key={o.key}
                label={o.label}
                active={stillHandling === o.key}
                onClick={() => setStillHandling(o.key)}
              />
            ))}
          </div>
        </Field>

        <Field label="段落检测">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={sectionDetection}
              onChange={(e) => setSectionDetection(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            <span className="text-sm">
              自动识别 Verse / Chorus / Bridge 段落
            </span>
          </label>
        </Field>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function RadioPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-4 py-1.5 text-sm transition-colors " +
        (active
          ? "border-brand bg-brand/10 text-brand-700"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800")
      }
    >
      {label}
    </button>
  );
}
