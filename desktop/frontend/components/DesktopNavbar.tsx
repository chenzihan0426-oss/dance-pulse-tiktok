"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Music, User, Sparkles } from "lucide-react";

const NAV = [
  { href: "/", label: "首页", icon: Home },
  { href: "/learn", label: "课程", icon: Music },
  { href: "/community", label: "社区", icon: Sparkles },
  { href: "/me", label: "我的", icon: User },
];

export function DesktopNavbar() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/5 bg-black/50 px-10 backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-fuchsia-500 text-[14px] font-black text-white">
          舞
        </div>
        <span className="text-[16px] font-semibold tracking-wide text-white">DancePulse</span>
      </Link>

      <nav className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:bg-white/6 hover:text-white/85"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/import"
        className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition hover:bg-white/90"
      >
        上传视频
      </Link>
    </header>
  );
}

export default DesktopNavbar;
