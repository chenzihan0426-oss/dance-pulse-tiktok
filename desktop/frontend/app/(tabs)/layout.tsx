"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DesktopNavbar } from "@/components/DesktopNavbar";

export default function TabsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const showNavbar = pathname !== "/";

  return (
    <div className={`relative min-h-screen bg-black text-white ${showNavbar ? "pt-16" : ""}`}>
      {showNavbar ? <DesktopNavbar /> : null}
      {children}
    </div>
  );
}
