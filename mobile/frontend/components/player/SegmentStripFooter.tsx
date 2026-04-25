import React from "react";
import { Check } from "lucide-react";
import type { Segment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SegmentStripFooter({
  currentId,
  segments,
  learnedSet,
  onSelect,
}: {
  currentId: string;
  segments: Segment[];
  learnedSet: Set<string>;
  onSelect?: (segmentId: string) => void;
}) {
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  React.useEffect(() => {
    const activeNode = itemRefs.current[currentId];
    if (!activeNode) return;
    activeNode.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentId]);

  return (
    <div
      ref={stripRef}
      className="flex items-center gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [overscroll-behavior-x:contain] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
    >
      {segments.map((segment) => {
        const learned = learnedSet.has(segment.id);
        const active = segment.id === currentId;
        return (
          <button
            type="button"
            key={segment.id}
            ref={(node) => {
              itemRefs.current[segment.id] = node;
            }}
            onClick={() => onSelect?.(segment.id)}
            aria-pressed={active}
            aria-label={`切换到动作 ${segment.index + 1}`}
            className={cn(
              "relative h-24 min-w-[76px] shrink-0 overflow-hidden rounded-[16px] border text-white transition duration-200",
              learned
                ? "border-emerald-400/20 bg-emerald-950/80 text-emerald-300"
                : "border-white/6 bg-white/[0.05] text-white/35",
              active &&
                "scale-[1.03] border-brand-light ring-2 ring-brand-light/80 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_12px_28px_rgba(168,85,247,0.28)]"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={segment.thumbnail}
              alt={`动作 ${segment.index + 1}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className={cn(
                "absolute inset-0",
                learned ? "bg-emerald-950/72" : active ? "bg-brand/28" : "bg-black/35"
              )}
            />

            <div className="relative z-10 flex h-full w-full items-center justify-center">
              {learned ? (
                <div className="flex flex-col items-center justify-center gap-1">
                  <Check className="h-7 w-7" />
                  {active && (
                    <span className="text-[11px] font-medium tracking-[0.14em] text-white/85">
                      当前
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[18px] font-medium text-white/90">
                  {segment.index + 1}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
