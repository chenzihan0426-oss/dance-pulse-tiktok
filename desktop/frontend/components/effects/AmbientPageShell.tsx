"use client";

import type { ReactNode } from "react";
import { AmbientScene } from "@/components/effects/AmbientScene";

/** 非 tabs 路由的统一氛围壳（导入、用户主页等） */
export function AmbientPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <AmbientScene cursorVariant="simple" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
