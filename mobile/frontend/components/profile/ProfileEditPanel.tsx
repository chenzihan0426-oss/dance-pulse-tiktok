"use client";

import * as React from "react";
import { Camera, Check, ImagePlus, Upload, X } from "lucide-react";
import { loadDemoMedia } from "@/lib/demoMedia";
import {
  AVATAR_PRESETS,
  COVER_PRESETS,
  getProfileCustomization,
  makeAvatarFromPreset,
  resolveCoverPreview,
  saveProfileCustomization,
  type CoverPreset,
  type ProfileCustomization,
} from "@/lib/profileCustomization";

function mergeCoverPresets(diskThumbs: string[]): CoverPreset[] {
  const known = new Set(COVER_PRESETS.map((p) => p.value));
  const fromDisk = diskThumbs
    .filter((path) => !known.has(path))
    .map((path, index) => {
      const name = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? `cover_${index}`;
      return {
        id: `disk_${name}`,
        label: name.slice(0, 14),
        value: path,
        preview: path,
      } satisfies CoverPreset;
    });
  return [...COVER_PRESETS, ...fromDisk];
}

export function ProfileEditPanel({
  open,
  onClose,
  displayName,
  currentCover,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string;
  currentCover?: string | null;
  onSaved?: (custom: ProfileCustomization) => void;
}) {
  const [name, setName] = React.useState(displayName);
  const [coverThumb, setCoverThumb] = React.useState(COVER_PRESETS[0].value);
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);
  const [coverPresets, setCoverPresets] = React.useState<CoverPreset[]>(COVER_PRESETS);
  const avatarFileRef = React.useRef<HTMLInputElement>(null);
  const coverFileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const custom = getProfileCustomization();
    setName(custom.displayName ?? displayName);
    setCoverThumb(custom.coverThumb ?? currentCover ?? COVER_PRESETS[0].value);
    setAvatar(custom.avatar ?? null);
    setHint(null);
    void loadDemoMedia().then((demo) => {
      setCoverPresets(mergeCoverPresets(demo.thumbs));
    });
  }, [open, displayName, currentCover]);

  if (!open) return null;

  function readImage(file: File | null, apply: (dataUrl: string) => void) {
    if (!file || !file.type.startsWith("image/")) {
      setHint("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        apply(reader.result);
        setHint(null);
      }
    };
    reader.readAsDataURL(file);
  }

  function save() {
    setBusy(true);
    try {
      const next = saveProfileCustomization({
        displayName: name.trim() || displayName,
        avatar,
        coverThumb,
      });
      onSaved?.(next);
      setHint("已保存");
      onClose();
    } catch {
      setHint("保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm md:items-center">
      <div className="absolute inset-0" onClick={onClose} role="presentation" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto border border-white/15 bg-[#0a0a0a] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ccff00]/80">
              Edit Profile
            </div>
            <h2 className="mt-1 text-[20px] font-bold text-white">编辑主页</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/45 transition hover:text-white"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-5 block text-[12px] text-white/45">昵称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          className="mt-1.5 w-full border border-white/15 bg-black/50 px-3 py-2.5 text-[15px] text-white outline-none focus:border-[#00f3ff]/50"
          placeholder="输入昵称"
        />

        <div className="mt-5 text-[12px] text-white/45">头像</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => avatarFileRef.current?.click()}
            className="inline-flex h-14 w-14 items-center justify-center border border-dashed border-white/25 text-white/55 transition hover:border-[#ccff00]/50 hover:text-[#ccff00]"
            title="上传头像"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => readImage(e.target.files?.[0] ?? null, setAvatar)}
          />
          {AVATAR_PRESETS.map((preset) => {
            const src = makeAvatarFromPreset(preset, name || displayName);
            const active = avatar === src;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAvatar(src)}
                className={`relative h-14 w-14 overflow-hidden border transition ${
                  active ? "border-[#ccff00]" : "border-white/15 hover:border-white/40"
                }`}
                title={preset.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={preset.label} className="h-full w-full object-cover" />
                {active ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Check className="h-4 w-4 text-[#ccff00]" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 text-[12px] text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <ImagePlus className="h-3.5 w-3.5" />
            背景封面
          </span>
          <button
            type="button"
            onClick={() => coverFileRef.current?.click()}
            className="inline-flex items-center gap-1 text-[#ccff00] hover:underline"
          >
            <Upload className="h-3.5 w-3.5" />
            上传图片
          </button>
          <input
            ref={coverFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) =>
              readImage(e.target.files?.[0] ?? null, (dataUrl) => {
                setCoverThumb(dataUrl);
              })
            }
          />
        </div>

        {coverThumb.startsWith("data:") ? (
          <div className="relative mt-2 h-24 overflow-hidden border border-[#ccff00]/50">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${coverThumb}")` }}
            />
            <span className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 text-[11px] text-white">
              已选上传封面
            </span>
          </div>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-2">
          {coverPresets.map((preset) => {
            const active = coverThumb === preset.value;
            const preview = resolveCoverPreview(preset);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setCoverThumb(preset.value)}
                className={`relative h-20 overflow-hidden border text-left transition ${
                  active ? "border-[#ccff00]" : "border-white/15 hover:border-white/35"
                }`}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={
                    preview.kind === "image"
                      ? { backgroundImage: `url("${preview.value}")` }
                      : { background: preview.value }
                  }
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <span className="absolute bottom-2 left-2 text-[11px] font-semibold text-white">
                  {preset.label}
                </span>
                {active ? (
                  <span className="absolute right-2 top-2 bg-[#ccff00] p-0.5 text-black">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {hint ? <p className="mt-3 text-[12px] text-[#ccff00]/90">{hint}</p> : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/15 py-2.5 text-[13px] text-white/70 transition hover:bg-white/5"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="flex-1 bg-[#ccff00] py-2.5 text-[13px] font-bold text-black transition hover:bg-white disabled:opacity-60"
            style={{ transform: "skewX(-6deg)" }}
          >
            <span style={{ transform: "skewX(6deg)", display: "inline-block" }}>
              {busy ? "保存中…" : "保存更改"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
