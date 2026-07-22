"use client";

import type { ReactNode } from "react";
import { AmbientScene } from "@/components/effects/AmbientScene";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <AmbientScene cursorVariant="simple" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
