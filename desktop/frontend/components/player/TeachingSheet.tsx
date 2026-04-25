import React from "react";
import { Sheet } from "@/components/ui/sheet";
import { TeachingPanel } from "@/components/TeachingPanel";
import type { Segment } from "@/lib/types";

export function TeachingSheet({
  open,
  onOpenChange,
  onRegenerate,
  regenerating,
  segment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  segment: Segment;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title={segment.teaching?.summary || "AI 分步教学"}
      className="mx-auto w-full max-w-[430px] rounded-t-[28px] border-x border-t border-white/8 bg-[#14111f]"
    >
      <TeachingPanel
        segment={segment}
        regenerating={regenerating}
        onRegenerate={onRegenerate}
        className="border-0 bg-transparent p-0 shadow-none"
      />
    </Sheet>
  );
}
