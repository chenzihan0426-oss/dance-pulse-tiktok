import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarkLearnedCTA({
  animating,
  onTap,
  onLongPress,
}: {
  animating: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const longPressTimer = React.useRef<number | null>(null);
  const longPressTriggered = React.useRef(false);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = React.useCallback(() => {
    longPressTriggered.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress();
    }, 500);
  }, [clearLongPress, onLongPress]);

  const handlePointerUp = React.useCallback(() => {
    const shouldTap = !longPressTriggered.current;
    clearLongPress();
    if (shouldTap) {
      onTap();
    }
  }, [clearLongPress, onTap]);

  React.useEffect(() => clearLongPress, [clearLongPress]);

  return (
    <div className="relative">
      {animating && (
        <div className="pointer-events-none absolute inset-x-10 -top-6 h-20 rounded-full bg-brand/30 blur-3xl" />
      )}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        className={cn(
          "relative flex h-24 w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(90deg,#A855F7_0%,#C15BFF_50%,#A855F7_100%)] text-[22px] font-semibold text-white transition",
          animating && "scale-[0.985] brightness-110"
        )}
      >
        <Check className="h-8 w-8" />
        已学会 · 下一张
      </button>
      <p className="mt-5 text-center text-[14px] text-white/40">
        长按查看 AI 分步教学
      </p>
    </div>
  );
}
