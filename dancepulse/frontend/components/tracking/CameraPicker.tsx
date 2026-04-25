"use client";

// 摄像头选择器: 枚举所有 videoinput 设备让用户挑
//
// 常见坑:
//   - Chromium 在未授权前 enumerateDevices 返回的 label 是空串 -> 显示"摄像头 1/2..."
//   - 下拉原本向下展开, 但本组件挂在 footer 里, 下拉会被视口切掉 -> 改向上展开
//   - footer 的 backdrop-blur 会形成新 stacking context, 下拉要高 z-index 才不被盖

import * as React from "react";
import { Camera, Check, ChevronDown, RefreshCw } from "lucide-react";

export default function CameraPicker({
  currentDeviceId,
  onChange,
  className,
}: {
  currentDeviceId: string | null;
  onChange: (deviceId: string) => void;
  className?: string;
}) {
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [open, setOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const refreshDevices = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    setRefreshing(true);
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "videoinput"));
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 首次 + 插拔设备时自动刷新
  React.useEffect(() => {
    void refreshDevices();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return;
    const onDev = () => { void refreshDevices(); };
    navigator.mediaDevices.addEventListener("devicechange", onDev);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onDev);
  }, [refreshDevices]);

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

  // 打开下拉时主动请求摄像头权限, 拿到真实 label (首次 Chrome 会返回空 label)
  const handleOpen = React.useCallback(async () => {
    setOpen(true);
    // 如果第一次 label 全为空, 尝试 getUserMedia 取权限后再 enumerate
    const noLabels = devices.every((d) => !d.label);
    if (noLabels && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());
        await refreshDevices();
      } catch {
        /* 用户拒绝也无所谓,至少按钮能点了 */
      }
    }
  }, [devices, refreshDevices]);

  const current = devices.find((d) => d.deviceId === currentDeviceId) ?? devices[0];
  const label = (d?: MediaDeviceInfo, idx = 0) =>
    d?.label?.trim() ? d.label : `摄像头 ${idx + 1}`;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[12px] text-white/85 backdrop-blur transition hover:bg-white/16"
        title="切换摄像头"
      >
        <Camera className="h-3.5 w-3.5" />
        <span className="max-w-[200px] truncate">
          {devices.length === 0 ? "未检测到摄像头" : label(current, 0)}
        </span>
        <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 z-[60] mb-2 min-w-[280px] max-w-[380px] overflow-hidden rounded-xl border border-white/12 bg-[#14111c] shadow-[0_20px_48px_rgba(0,0,0,0.65)]">
          <div className="flex items-center justify-between border-b border-white/6 px-3 py-2 text-[10px] uppercase tracking-wider text-white/45">
            <span>可用摄像头 · {devices.length}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void refreshDevices(); }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-white/55 hover:bg-white/8 hover:text-white"
              title="刷新列表"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-white/50">
              没检测到摄像头。确认设备已连接,或浏览器有摄像头权限。
            </div>
          ) : (
            <ul className="max-h-[300px] overflow-y-auto py-1">
              {devices.map((d, i) => {
                const active = d.deviceId === (currentDeviceId ?? current?.deviceId);
                return (
                  <li key={d.deviceId || i}>
                    <button
                      type="button"
                      onClick={() => { onChange(d.deviceId); setOpen(false); }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition ${
                        active ? "bg-white/10 text-white" : "text-white/78 hover:bg-white/6"
                      }`}
                    >
                      <span className="flex-1 truncate">{label(d, i)}</span>
                      {active ? <Check className="h-3.5 w-3.5 text-amber-300" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
