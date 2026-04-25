"use client";

import React from "react";
import Link from "next/link";
import { GraduationCap, Home, Sparkles, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "首页", icon: Home, exact: true },
  { href: "/learn", label: "学习", icon: GraduationCap },
  { href: "/community", label: "社区", icon: Sparkles },
  { href: "/me", label: "我的", icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname() ?? "";

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/8 bg-[#0d0b17]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur-sm md:hidden">
        <div className="grid grid-cols-4 gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-[18px] px-2 py-2 text-[12px] transition",
                  active ? "text-white" : "text-white/40 hover:text-white/70"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "stroke-[2.4]" : "stroke-[2]")} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <nav className="fixed inset-x-0 top-0 z-40 hidden border-b border-white/8 bg-[#0d0b17]/88 backdrop-blur-md md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-8 py-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
