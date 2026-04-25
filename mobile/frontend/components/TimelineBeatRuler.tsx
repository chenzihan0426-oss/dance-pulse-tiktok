"use client";

import * as React from "react";
import type { Section } from "@/lib/types";

interface Props {
  duration: number;
  beats: number[];
  sections: Section[];
  pxPerSec: number;
}

// Stable pastel-ish section colors.
const SECTION_COLORS = [
  "rgba(232,93,36,0.12)", // brand
  "rgba(59,130,246,0.12)",
  "rgba(16,185,129,0.12)",
  "rgba(168,85,247,0.12)",
  "rgba(234,179,8,0.12)",
  "rgba(6,182,212,0.12)",
];

export function TimelineBeatRuler({
  duration,
  beats,
  sections,
  pxPerSec,
}: Props) {
  const width = Math.max(1, duration * pxPerSec);

  // Only render a beat tick every N beats if there are a lot of them.
  const beatStride =
    beats.length > 600 ? 8 : beats.length > 300 ? 4 : beats.length > 150 ? 2 : 1;

  // Second labels every 5 seconds.
  const secondStride = duration > 180 ? 10 : duration > 60 ? 5 : 2;

  return (
    <div
      className="relative h-10 border-b border-neutral-200 dark:border-neutral-800"
      style={{ width }}
    >
      {/* section bands */}
      {sections.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-y-0"
          style={{
            left: s.start * pxPerSec,
            width: Math.max(0, (s.end - s.start) * pxPerSec),
            background: SECTION_COLORS[i % SECTION_COLORS.length],
          }}
          aria-hidden
        >
          <div className="pointer-events-none absolute left-1 top-1 rounded bg-white/70 px-1 text-[10px] font-medium text-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200">
            {s.label}
          </div>
        </div>
      ))}

      {/* beat ticks */}
      {beats.map((b, i) => {
        if (i % beatStride !== 0) return null;
        return (
          <div
            key={i}
            className="absolute bottom-0 w-px bg-neutral-300 dark:bg-neutral-700"
            style={{ left: b * pxPerSec, height: i % (beatStride * 4) === 0 ? 10 : 6 }}
            aria-hidden
          />
        );
      })}

      {/* second labels */}
      {Array.from({ length: Math.floor(duration / secondStride) + 1 }, (_, i) => {
        const sec = i * secondStride;
        return (
          <div
            key={sec}
            className="absolute bottom-0 text-[10px] leading-none text-neutral-500"
            style={{ left: sec * pxPerSec + 2 }}
          >
            {sec}s
          </div>
        );
      })}
    </div>
  );
}
