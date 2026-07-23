"use client";

import type { CommunityHubTab } from "@/lib/communityShowcase";

const TABS: Array<{ id: CommunityHubTab; label: string; hint: string }> = [
  { id: "hot", label: "热门", hint: "Hot" },
  { id: "recommend", label: "推荐", hint: "For You" },
  { id: "following", label: "关注", hint: "Friends" },
  { id: "arena", label: "竞技场", hint: "Arena" },
];

export function CommunityHubTabs({
  value,
  onChange,
}: {
  value: CommunityHubTab;
  onChange: (tab: CommunityHubTab) => void;
}) {
  return (
    <div className="w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex min-w-full gap-1 border border-white/10 bg-black/35 p-1 backdrop-blur-sm sm:min-w-0">
        {TABS.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative min-h-[52px] min-w-[76px] flex-1 px-3 py-2.5 text-left transition active:scale-[0.98] ${
                active ? "bg-white text-black" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
              style={active ? { transform: "skewX(-6deg)" } : undefined}
            >
              <div style={active ? { transform: "skewX(6deg)" } : undefined}>
                <div className="text-[13px] font-bold tracking-wide">{tab.label}</div>
                <div
                  className={`text-[10px] uppercase tracking-[0.12em] ${active ? "text-black/50" : "text-white/30"}`}
                >
                  {tab.hint}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
