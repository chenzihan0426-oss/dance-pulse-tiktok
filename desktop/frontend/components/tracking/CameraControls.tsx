"use client";

// 摄像头调控面板
//   - Zoom 滑块 (若设备支持 track.capabilities.zoom)
//   - 镜像翻转 (纯 CSS, 不依赖设备)
//   - 前后摄像头切换 (若设备支持 facingMode: user/environment)
//   - 补光 Torch (若设备支持)
//
// 所有功能只有当底层设备支持时才显示按钮, 不支持的硬件自动隐藏。

import * as React from "react";
import { ZoomIn, ZoomOut, FlipHorizontal2, RefreshCw, Sun, SlidersHorizontal } from "lucide-react";

type ExtraCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  facingMode?: string[];
};
type ExtraConstraints = MediaTrackConstraintSet & {
  zoom?: number;
  torch?: boolean;
  facingMode?: string;
};

export default function CameraControls({
  stream,
  mirror,
  onMirrorChange,
  onReopenWithFacing,
}: {
  stream: MediaStream | null;
  mirror: boolean;
  onMirrorChange: (m: boolean) => void;
  onReopenWithFacing?: (facing: "user" | "environment") => Promise<void> | void;
}) {
  const [caps, setCaps] = React.useState<ExtraCapabilities | null>(null);
  const [zoom, setZoom] = React.useState<number>(1);
  const [torch, setTorch] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!stream) { setCaps(null); return; }
    const track = stream.getVideoTracks()[0];
    if (!track) { setCaps(null); return; }
    try {
      const c = (track.getCapabilities?.() ?? {}) as ExtraCapabilities;
      setCaps(c);
      const s = track.getSettings() as ExtraConstraints;
      if (typeof s.zoom === "number") setZoom(s.zoom);
      if (typeof s.torch === "boolean") setTorch(s.torch);
    } catch {
      setCaps(null);
    }
  }, [stream]);

  const applyZoom = React.useCallback(async (next: number) => {
    setZoom(next);
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: next } as ExtraConstraints] });
    } catch (err) {
      console.warn("[CameraControls] zoom failed:", err);
    }
  }, [stream]);

  const toggleTorch = React.useCallback(async () => {
    const next = !torch;
    setTorch(next);
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as ExtraConstraints] });
    } catch (err) {
      console.warn("[CameraControls] torch failed:", err);
    }
  }, [stream, torch]);

  const flipFacing = React.useCallback(async () => {
    const track = stream?.getVideoTracks()[0];
    const curr = (track?.getSettings() as ExtraConstraints | undefined)?.facingMode;
    const next = curr === "environment" ? "user" : "environment";
    try {
      // 先尝试 in-place 改约束 (手机通常支持)
      await track?.applyConstraints({ advanced: [{ facingMode: next } as ExtraConstraints] });
      // 如果 applyConstraints 不奏效, 回落到重开流 (让父组件处理)
      await onReopenWithFacing?.(next);
    } catch (err) {
      console.warn("[CameraControls] facingMode in-place failed, asking parent:", err);
      await onReopenWithFacing?.(next);
    }
  }, [stream, onReopenWithFacing]);

  const hasZoom = !!caps?.zoom && caps.zoom.max > (caps.zoom.min ?? 1);
  const hasTorch = !!caps?.torch;
  const hasFacing = !!caps?.facingMode && caps.facingMode.length > 1;

  // 点外部关闭
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[12px] text-white/85 backdrop-blur transition hover:bg-white/16"
        title="摄像头控制"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        控制
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 z-[60] mb-2 w-[280px] overflow-hidden rounded-xl border border-white/12 bg-[#14111c] px-4 py-3 shadow-[0_20px_48px_rgba(0,0,0,0.65)]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-white/45">摄像头控制</div>

          {/* Zoom */}
          {hasZoom && caps?.zoom ? (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-white/65">
                <span className="inline-flex items-center gap-1">
                  <ZoomIn className="h-3 w-3" />
                  Zoom
                </span>
                <span className="font-mono tabular-nums">{zoom.toFixed(1)}x</span>
              </div>
              <div className="flex items-center gap-2">
                <ZoomOut className="h-3 w-3 text-white/40" />
                <input
                  type="range"
                  min={caps.zoom.min}
                  max={caps.zoom.max}
                  step={caps.zoom.step ?? 0.1}
                  value={zoom}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-amber-400"
                />
                <ZoomIn className="h-3 w-3 text-white/40" />
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded bg-white/5 px-2 py-1.5 text-[10px] text-white/45">
              当前设备不支持 Zoom
            </div>
          )}

          {/* Mirror / Facing / Torch */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onMirrorChange(!mirror)}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                mirror ? "bg-fuchsia-500/25 text-fuchsia-100" : "bg-white/6 text-white/70 hover:bg-white/12"
              }`}
              title="画面左右翻转 (纯视觉)"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              {mirror ? "已镜像" : "镜像"}
            </button>

            {hasFacing || onReopenWithFacing ? (
              <button
                type="button"
                onClick={() => void flipFacing()}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/6 px-3 py-2 text-[12px] text-white/70 transition hover:bg-white/12"
                title="切换前后摄像头"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                前/后
              </button>
            ) : null}

            {hasTorch ? (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                  torch ? "bg-amber-400/25 text-amber-100" : "bg-white/6 text-white/70 hover:bg-white/12"
                }`}
                title="补光灯"
              >
                <Sun className="h-3.5 w-3.5" />
                补光
              </button>
            ) : null}
          </div>

          {!hasZoom && !hasFacing && !hasTorch ? (
            <div className="mt-2 text-[10px] leading-5 text-white/45">
              你的摄像头只支持镜像翻转。<br />
              想要 Zoom / 切换前后 / 补光? 试试 iPhone 连续互通相机 或 Insta 360 Link。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
