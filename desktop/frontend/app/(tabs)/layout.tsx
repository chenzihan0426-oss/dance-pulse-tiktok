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
  const isHome = pathname === "/";

  // 导航栏始终显示，确保首页也能进社区 / 导入；首页 hero 全屏，导航浮在顶部不占位
  return (
    <div className={`relative min-h-screen bg-black text-white ${isHome ? "" : "pt-16"}`}>
      <DesktopNavbar />
      {children}
    </div>
  );
}
