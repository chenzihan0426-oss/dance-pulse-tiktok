import React from "react";
import type { Lesson } from "@/lib/types";

function formatTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remain = totalSeconds % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function resolveSectionColor(sectionId: string) {
  if (sectionId.includes("intro")) return "bg-white/65";
  if (sectionId.includes("verse")) return "bg-white/55";
  if (sectionId.includes("chorus")) return "bg-brand";
  if (sectionId.includes("outro")) return "bg-white/45";
  return "bg-white/45";
}

export function SectionProgressBar({
  lesson,
  currentTime,
}: {
  lesson: Lesson;
  currentTime: number;
}) {
  const duration = Math.max(lesson.duration, 0.01);
  const sections =
    lesson.sections.length > 0
      ? lesson.sections
      : [{ id: "fullplay", label: "完整预览", start: 0, end: duration }];
  const clampedTime = Math.max(0, Math.min(currentTime, duration));
  const progress = clampedTime / duration;
  const currentSection =
    sections.find((section) => clampedTime >= section.start && clampedTime < section.end) ??
    sections[sections.length - 1];

  return (
    <div className="rounded-[24px] bg-black/30 px-4 py-4 backdrop-blur-sm">
      <div className="relative flex h-3 overflow-hidden rounded-full bg-white/10">
        {sections.map((section) => {
          const startRatio = section.start / duration;
          const endRatio = section.end / duration;
          const width = Math.max((endRatio - startRatio) * 100, 6);
          const passed = clampedTime >= section.end;
          const active = currentSection?.id === section.id;

          return (
            <div
              key={section.id}
              className={[
                "h-full transition-colors",
                active ? resolveSectionColor(section.id) : passed ? "bg-white/36" : "bg-white/12",
              ].join(" ")}
              style={{ width: `${width}%` }}
            />
          );
        })}

        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-white/40 bg-white shadow-[0_0_0_4px_rgba(168,85,247,0.16)]"
          style={{ left: `calc(${progress * 100}% - 8px)` }}
        />
      </div>

      <div className="mt-3 text-center text-[13px] text-white/72">
        {currentSection?.label ?? "完整预览"} · {formatTime(clampedTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}
