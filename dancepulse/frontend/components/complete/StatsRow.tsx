import React from "react";

export function StatsRow({
  items,
}: {
  items: { value: string; unit: string; label: string }[];
}) {
  return (
    <div className="flex items-baseline justify-center gap-5 text-center">
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <div className="h-7 w-px bg-white/10" /> : null}
          <div className="min-w-[88px]">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-[32px] font-semibold leading-none tracking-tight text-white tabular-nums">
                {item.value}
              </span>
              <span className="text-[14px] font-medium text-white/50">{item.unit}</span>
            </div>
            <div className="mt-1 text-[11px] text-white/45">{item.label}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
