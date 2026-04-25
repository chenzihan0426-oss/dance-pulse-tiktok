"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

export type MatteTuning = {
  scale: number;
  offsetX: number;
  offsetY: number;
  intensity: number;
  opacity: number;
  skeletonScale: number;
  skeletonOffsetX: number;
  skeletonOffsetY: number;
  skeletonIntensity: number;
};

export type TrackingOverlayLayer = "skeleton" | "silhouette";

type Props = {
  value: MatteTuning;
  layer: TrackingOverlayLayer;
  onChange: (next: MatteTuning) => void;
  onLayerChange: (next: TrackingOverlayLayer) => void;
  onReset: () => void;
  className?: string;
};

function updateValue(value: MatteTuning, key: keyof MatteTuning, next: number): MatteTuning {
  return { ...value, [key]: next };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[62px_1fr_42px] items-center gap-2 text-[11px] text-white/72">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-5 w-full accent-amber-300"
      />
      <span className="text-right font-mono text-[10px] text-white/55">{value.toFixed(2)}</span>
    </label>
  );
}

function LayerButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md text-[11px] font-medium transition ${
        active ? "bg-white text-black shadow-sm" : "text-white/66 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function MatteTuningPanel({
  value,
  layer,
  onChange,
  onLayerChange,
  onReset,
  className,
}: Props) {
  return (
    <div
      className={`pointer-events-auto z-50 w-[308px] rounded-lg border border-white/12 bg-black/58 px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md ${className ?? ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/72">画面调节</span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/8 text-white/75 hover:bg-white/14"
          title="重置"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-white/8 p-1">
        <LayerButton active={layer === "silhouette"} onClick={() => onLayerChange("silhouette")}>
          光影
        </LayerButton>
        <LayerButton active={layer === "skeleton"} onClick={() => onLayerChange("skeleton")}>
          骨架
        </LayerButton>
      </div>

      <div className="space-y-1">
        {layer === "silhouette" ? (
          <>
            <div className="pb-0.5 text-[10px] font-medium text-white/40">光影人</div>
            <Slider label="大小" value={value.scale} min={0.85} max={1.9} step={0.01} onChange={(next) => onChange(updateValue(value, "scale", next))} />
            <Slider label="左右" value={value.offsetX} min={-0.45} max={0.45} step={0.01} onChange={(next) => onChange(updateValue(value, "offsetX", next))} />
            <Slider label="上下" value={value.offsetY} min={-0.45} max={0.45} step={0.01} onChange={(next) => onChange(updateValue(value, "offsetY", next))} />
            <Slider label="亮度" value={value.intensity} min={0.45} max={1.45} step={0.01} onChange={(next) => onChange(updateValue(value, "intensity", next))} />
            <Slider label="透明" value={value.opacity} min={0.35} max={1} step={0.01} onChange={(next) => onChange(updateValue(value, "opacity", next))} />
          </>
        ) : (
          <>
            <div className="pb-0.5 text-[10px] font-medium text-white/40">追踪骨架</div>
            <Slider label="大小" value={value.skeletonScale} min={0.75} max={1.6} step={0.01} onChange={(next) => onChange(updateValue(value, "skeletonScale", next))} />
            <Slider label="左右" value={value.skeletonOffsetX} min={-0.35} max={0.35} step={0.01} onChange={(next) => onChange(updateValue(value, "skeletonOffsetX", next))} />
            <Slider label="上下" value={value.skeletonOffsetY} min={-0.35} max={0.35} step={0.01} onChange={(next) => onChange(updateValue(value, "skeletonOffsetY", next))} />
            <Slider label="亮度" value={value.skeletonIntensity} min={0.55} max={1.65} step={0.01} onChange={(next) => onChange(updateValue(value, "skeletonIntensity", next))} />
          </>
        )}
      </div>
    </div>
  );
}
