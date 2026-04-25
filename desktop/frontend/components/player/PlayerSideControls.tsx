import React from "react";
import { Eye, FlipHorizontal2 } from "lucide-react";

export function PlayerSideControls({
  speedLabel,
  mirror,
  guideMode,
  onCycleGuideMode,
  onToggleMirror,
  onCycleSpeed,
}: {
  speedLabel: string;
  mirror: boolean;
  guideMode: "beat" | "all" | "cue" | "off";
  onCycleGuideMode: () => void;
  onToggleMirror: () => void;
  onCycleSpeed: () => void;
}) {
  const guideActive = guideMode !== "off";
  const guideText =
    guideMode === "beat" ? "节拍" : guideMode === "all" ? "都开" : guideMode === "cue" ? "词" : "关";

  return (
    <div className="flex flex-col gap-5">
      <RoundControlButton label="学习提示" active={guideActive} onClick={onCycleGuideMode}>
        <div className="flex flex-col items-center gap-1">
          <Eye className="h-5 w-5" />
          <span className="text-[10px] font-medium">{guideText}</span>
        </div>
      </RoundControlButton>

      <RoundControlButton label="镜像" active={mirror} onClick={onToggleMirror}>
        <FlipHorizontal2 className="h-6 w-6" />
      </RoundControlButton>

      <RoundControlButton
        label="倍速"
        active
        onClick={onCycleSpeed}
        className="bg-brand text-white"
      >
        <span className="text-[18px] font-semibold">{speedLabel}</span>
      </RoundControlButton>
    </div>
  );
}

function RoundControlButton({
  children,
  label,
  onClick,
  active = false,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={[
        "flex h-20 w-20 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white/92 backdrop-blur-sm transition",
        active ? "shadow-[0_12px_30px_rgba(168,85,247,0.28)]" : "hover:bg-black/45",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
