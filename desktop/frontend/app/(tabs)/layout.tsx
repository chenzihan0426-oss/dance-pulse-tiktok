"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AmbientScene } from "@/components/effects/AmbientScene";
import { DesktopNavbar } from "@/components/DesktopNavbar";

export default function TabsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const isHome = pathname === "/";

  // 导航栏始终显示；首页 hero 全屏，导航浮在顶部不占位
  // 全 tabs 统一首页粒子背景；首页用完整光标，其它页用简洁光标
  return (
    <div className={`relative min-h-screen bg-[#050505] text-white ${isHome ? "" : "pt-16"}`}>
      <AmbientScene cursorVariant={isHome ? "hero" : "simple"} />
      <div className="relative z-10">
        <DesktopNavbar />
        {children}
      </div>
    </div>
  );
}
