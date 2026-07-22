"use client";

import type { ReactNode } from "react";
import { AmbientPageShell } from "@/components/effects/AmbientPageShell";

export default function ImportLayout({ children }: { children: ReactNode }) {
  return <AmbientPageShell>{children}</AmbientPageShell>;
}
