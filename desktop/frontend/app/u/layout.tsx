"use client";

import type { ReactNode } from "react";
import { AmbientPageShell } from "@/components/effects/AmbientPageShell";

export default function UserProfileLayout({ children }: { children: ReactNode }) {
  return <AmbientPageShell>{children}</AmbientPageShell>;
}
