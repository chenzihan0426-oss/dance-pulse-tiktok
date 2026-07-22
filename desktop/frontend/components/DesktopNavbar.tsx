"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DancePulseLogo } from "@/components/brand/DancePulseLogo";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/learn", label: "课程" },
  { href: "/community", label: "社区" },
  { href: "/me", label: "我的" },
];

export function DesktopNavbar() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/5 bg-black/35 px-10 backdrop-blur-xl">
      <Link href="/" className="group flex items-center gap-2.5">
        <DancePulseLogo className="h-11 w-11 shrink-0 transition group-hover:scale-105" />
        <span
          className="bg-[linear-gradient(90deg,#ff0055,#ffaa00,#ccff00,#00f3ff,#ff0055)] bg-[length:200%_auto] bg-clip-text text-[17px] font-black uppercase tracking-[0.08em] text-transparent transition group-hover:animate-[shine_2.4s_linear_infinite]"
          style={{
            fontFamily: "'Black Han Sans', 'Michroma', sans-serif",
            transform: "skewX(-6deg)",
            WebkitTextStroke: "0.4px rgba(255,255,255,0.18)",
          }}
        >
          DancePulse
        </span>
      </Link>

      <nav className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const isCommunity = item.href === "/community";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group/nav relative flex items-center gap-2 px-4 py-1.5 transition ${
                active ? "bg-white/10" : "hover:bg-white/6"
              }`}
              style={{ transform: "skewX(-8deg)" }}
            >
              <span
                className="inline-flex items-center gap-2"
                style={{
                  transform: "skewX(8deg)",
                  fontFamily: "'Black Han Sans', 'Noto Sans SC', sans-serif",
                  letterSpacing: "0.14em",
                  fontWeight: 900,
                }}
              >
                <span
                  className={`text-[16px] leading-none transition ${
                    active ? "text-white" : "text-white/80 group-hover/nav:text-white"
                  }`}
                >
                  {item.label}
                </span>
                {isCommunity ? (
                  <span className="dp-live-badge inline-flex items-center gap-1 bg-[#ff0055] px-1.5 py-[1px] text-[9px] font-bold tracking-wide text-white">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="dp-live-ping absolute inline-flex h-full w-full rounded-full bg-white" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    LIVE
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <Link
        href="/import"
        className="bg-[#ccff00] px-4 py-1.5 text-[13px] font-bold text-black transition hover:bg-white"
        style={{ transform: "skewX(-6deg)" }}
      >
        <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>导入视频</span>
      </Link>
    </header>
  );
}

export default DesktopNavbar;
