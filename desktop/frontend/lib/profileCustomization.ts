"use client";

import { getAuthSession, setAuthSession } from "@/lib/auth";
import { resolveMediaUrl } from "@/lib/api";

const PROFILE_CUSTOM_KEY = "dp_profile_custom_v1";
const PREMIUM_KEY = "dp_premium_v1";
export const PROFILE_CUSTOM_CHANGED_EVENT = "dp-profile-custom-changed";
export const PREMIUM_CHANGED_EVENT = "dp-premium-changed";

export type PremiumTierId = "free" | "premium" | "pro";

export interface ProfileCustomization {
  displayName?: string;
  avatar?: string | null;
  /** 图片路径 / dataURL / gradient:xxx */
  coverThumb?: string;
  updatedAt?: string;
}

export interface PremiumState {
  tier: PremiumTierId;
  active: boolean;
  expiresLabel: string;
  startedAt?: string;
}

export type CoverPreset = {
  id: string;
  label: string;
  /** 存进 localStorage 的值 */
  value: string;
  preview: string;
};

export type AvatarPreset = {
  id: string;
  label: string;
  /** SVG 渐变/纹理背景 */
  bg: string;
  fg: string;
  /** 可选纹理：dots | grid | diagonal | noise */
  texture?: "dots" | "grid" | "diagonal" | "noise" | "rings";
};

/** 封面：缩略图 + 多层纹理渐变 */
export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "cover_anti",
    label: "ANTIFRAGILE",
    value: "/thumbs/antifragile.jpg",
    preview: "/thumbs/antifragile.jpg",
  },
  {
    id: "cover_wil0",
    label: "What is Love",
    value: "/thumbs/les_1309562bc052_seg_000.jpg",
    preview: "/thumbs/les_1309562bc052_seg_000.jpg",
  },
  {
    id: "cover_harry",
    label: "HARRY",
    value: "/thumbs/harry.jpg",
    preview: "/thumbs/harry.jpg",
  },
  {
    id: "cover_qlx",
    label: "QLX",
    value: "/thumbs/qlx.jpg",
    preview: "/thumbs/qlx.jpg",
  },
  {
    id: "grad_rose",
    label: "热粉霓虹",
    value: "gradient:rose",
    preview:
      "radial-gradient(ellipse at 15% 20%,rgba(255,0,85,0.85),transparent 42%),radial-gradient(ellipse at 85% 70%,rgba(157,78,221,0.55),transparent 48%),linear-gradient(145deg,#2a0614 0%,#12040a 45%,#050505 100%)",
  },
  {
    id: "grad_cyan",
    label: "电青霓虹",
    value: "gradient:cyan",
    preview:
      "radial-gradient(ellipse at 80% 15%,rgba(0,243,255,0.75),transparent 40%),radial-gradient(ellipse at 20% 80%,rgba(0,120,180,0.45),transparent 50%),linear-gradient(160deg,#041820 0%,#020a0e 50%,#050505 100%)",
  },
  {
    id: "grad_lime",
    label: "柠檬霓虹",
    value: "gradient:lime",
    preview:
      "radial-gradient(ellipse at 30% 10%,rgba(204,255,0,0.7),transparent 38%),radial-gradient(ellipse at 70% 90%,rgba(255,170,0,0.35),transparent 45%),linear-gradient(135deg,#141805 0%,#0a0c04 50%,#050505 100%)",
  },
  {
    id: "grad_aurora",
    label: "极光织纹",
    value: "gradient:aurora",
    preview:
      "radial-gradient(ellipse at 10% 40%,rgba(0,243,255,0.55),transparent 45%),radial-gradient(ellipse at 55% 20%,rgba(255,0,85,0.5),transparent 40%),radial-gradient(ellipse at 90% 75%,rgba(204,255,0,0.35),transparent 42%),linear-gradient(120deg,#0a0618 0%,#12081f 40%,#050505 100%)",
  },
  {
    id: "grad_magma",
    label: "岩浆裂隙",
    value: "gradient:magma",
    preview:
      "radial-gradient(ellipse at 40% 60%,rgba(255,80,0,0.65),transparent 35%),radial-gradient(ellipse at 70% 25%,rgba(255,0,85,0.55),transparent 40%),conic-gradient(from 210deg at 50% 50%,#1a0505,#3a0a10,#120408,#050505)",
  },
  {
    id: "grad_violet_mesh",
    label: "紫电网格",
    value: "gradient:violet_mesh",
    preview:
      "repeating-linear-gradient(90deg,rgba(157,78,221,0.12) 0 1px,transparent 1px 18px),repeating-linear-gradient(0deg,rgba(0,243,255,0.08) 0 1px,transparent 1px 18px),radial-gradient(ellipse at 25% 30%,rgba(157,78,221,0.7),transparent 48%),linear-gradient(160deg,#140820,#050505)",
  },
  {
    id: "grad_sunset_strip",
    label: "落日条纹",
    value: "gradient:sunset_strip",
    preview:
      "repeating-linear-gradient(-18deg,transparent 0 14px,rgba(255,0,85,0.08) 14px 15px),linear-gradient(115deg,#ff0055 0%,#ffaa00 28%,#9d4edd 58%,#050505 100%)",
  },
  {
    id: "grad_ocean_noise",
    label: "深海噪点",
    value: "gradient:ocean_noise",
    preview:
      "radial-gradient(circle at 20% 80%,rgba(0,243,255,0.35),transparent 30%),radial-gradient(circle at 70% 30%,rgba(0,100,160,0.5),transparent 35%),radial-gradient(circle at 50% 50%,rgba(255,255,255,0.04) 0 1px,transparent 1px),linear-gradient(180deg,#021018,#050505)",
  },
];

const GRADIENT_CSS: Record<string, string> = {
  "gradient:rose":
    "radial-gradient(ellipse at 15% 20%,rgba(255,0,85,0.85),transparent 42%),radial-gradient(ellipse at 85% 70%,rgba(157,78,221,0.55),transparent 48%),linear-gradient(145deg,#2a0614 0%,#12040a 45%,#050505 100%)",
  "gradient:cyan":
    "radial-gradient(ellipse at 80% 15%,rgba(0,243,255,0.75),transparent 40%),radial-gradient(ellipse at 20% 80%,rgba(0,120,180,0.45),transparent 50%),linear-gradient(160deg,#041820 0%,#020a0e 50%,#050505 100%)",
  "gradient:lime":
    "radial-gradient(ellipse at 30% 10%,rgba(204,255,0,0.7),transparent 38%),radial-gradient(ellipse at 70% 90%,rgba(255,170,0,0.35),transparent 45%),linear-gradient(135deg,#141805 0%,#0a0c04 50%,#050505 100%)",
  "gradient:aurora":
    "radial-gradient(ellipse at 10% 40%,rgba(0,243,255,0.55),transparent 45%),radial-gradient(ellipse at 55% 20%,rgba(255,0,85,0.5),transparent 40%),radial-gradient(ellipse at 90% 75%,rgba(204,255,0,0.35),transparent 42%),linear-gradient(120deg,#0a0618 0%,#12081f 40%,#050505 100%)",
  "gradient:magma":
    "radial-gradient(ellipse at 40% 60%,rgba(255,80,0,0.65),transparent 35%),radial-gradient(ellipse at 70% 25%,rgba(255,0,85,0.55),transparent 40%),conic-gradient(from 210deg at 50% 50%,#1a0505,#3a0a10,#120408,#050505)",
  "gradient:violet_mesh":
    "repeating-linear-gradient(90deg,rgba(157,78,221,0.12) 0 1px,transparent 1px 18px),repeating-linear-gradient(0deg,rgba(0,243,255,0.08) 0 1px,transparent 1px 18px),radial-gradient(ellipse at 25% 30%,rgba(157,78,221,0.7),transparent 48%),linear-gradient(160deg,#140820,#050505)",
  "gradient:sunset_strip":
    "repeating-linear-gradient(-18deg,transparent 0 14px,rgba(255,0,85,0.08) 14px 15px),linear-gradient(115deg,#ff0055 0%,#ffaa00 28%,#9d4edd 58%,#050505 100%)",
  "gradient:ocean_noise":
    "radial-gradient(circle at 20% 80%,rgba(0,243,255,0.35),transparent 30%),radial-gradient(circle at 70% 30%,rgba(0,100,160,0.5),transparent 35%),radial-gradient(circle at 50% 50%,rgba(255,255,255,0.04) 0 1px,transparent 1px),linear-gradient(180deg,#021018,#050505)",
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "av_lime_dots",
    label: "柠檬点阵",
    bg: "linear-gradient(145deg,#ccff00,#6a8a00 55%,#1a2200)",
    fg: "#050505",
    texture: "dots",
  },
  {
    id: "av_cyan_grid",
    label: "电青网格",
    bg: "linear-gradient(160deg,#00f3ff,#007a8a 50%,#021018)",
    fg: "#050505",
    texture: "grid",
  },
  {
    id: "av_rose_diag",
    label: "热粉斜纹",
    bg: "linear-gradient(125deg,#ff0055,#9d0035 45%,#2a0510)",
    fg: "#ffffff",
    texture: "diagonal",
  },
  {
    id: "av_violet_rings",
    label: "紫电光环",
    bg: "radial-gradient(circle at 35% 30%,#d8b4fe,#9d4edd 45%,#2a0a40)",
    fg: "#ffffff",
    texture: "rings",
  },
  {
    id: "av_amber_noise",
    label: "琥珀噪点",
    bg: "linear-gradient(150deg,#ffcc00,#ff8800 50%,#3a1a00)",
    fg: "#050505",
    texture: "noise",
  },
  {
    id: "av_aurora",
    label: "极光叠色",
    bg: "linear-gradient(135deg,#00f3ff 0%,#9d4edd 40%,#ff0055 75%,#120818)",
    fg: "#ffffff",
    texture: "dots",
  },
  {
    id: "av_magma",
    label: "岩浆",
    bg: "radial-gradient(circle at 40% 35%,#ffaa00,#ff0055 45%,#1a0508)",
    fg: "#ffffff",
    texture: "diagonal",
  },
  {
    id: "av_silver_grid",
    label: "银灰网格",
    bg: "linear-gradient(160deg,#f5f5f5,#9aa0a6 55%,#2a2a2a)",
    fg: "#050505",
    texture: "grid",
  },
];

function canStore() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emit(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name));
}

export function getProfileCustomization(): ProfileCustomization {
  if (!canStore()) return {};
  try {
    const raw = window.localStorage.getItem(PROFILE_CUSTOM_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProfileCustomization;
  } catch {
    return {};
  }
}

export function saveProfileCustomization(patch: ProfileCustomization): ProfileCustomization {
  if (!canStore()) return patch;
  const next = {
    ...getProfileCustomization(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(PROFILE_CUSTOM_KEY, JSON.stringify(next));

  const session = getAuthSession();
  if (session?.user && (patch.displayName != null || patch.avatar !== undefined)) {
    setAuthSession({
      ...session,
      user: {
        ...session.user,
        displayName: patch.displayName ?? session.user.displayName,
        avatar: patch.avatar !== undefined ? patch.avatar : session.user.avatar,
      },
    });
  }
  emit(PROFILE_CUSTOM_CHANGED_EVENT);
  return next;
}

/** 背景预览/渲染：兼容相对路径、绝对 URL、dataURL、gradient */
export function resolveCoverBackground(cover: string | null | undefined): {
  kind: "image" | "gradient";
  value: string;
} {
  if (!cover) return { kind: "gradient", value: GRADIENT_CSS["gradient:rose"] };
  if (cover.startsWith("gradient:")) {
    return { kind: "gradient", value: GRADIENT_CSS[cover] ?? GRADIENT_CSS["gradient:rose"] };
  }
  if (cover.startsWith("data:") || cover.startsWith("blob:") || /^https?:\/\//.test(cover)) {
    return { kind: "image", value: cover };
  }
  return { kind: "image", value: resolveMediaUrl(cover) };
}

export function resolveCoverPreview(preset: CoverPreset): { kind: "image" | "gradient"; value: string } {
  if (preset.value.startsWith("gradient:")) {
    return { kind: "gradient", value: preset.preview };
  }
  return { kind: "image", value: resolveMediaUrl(preset.preview) };
}

export function getPremiumState(): PremiumState {
  if (!canStore()) {
    return { tier: "free", active: false, expiresLabel: "未开通" };
  }
  try {
    const raw = window.localStorage.getItem(PREMIUM_KEY);
    if (!raw) return { tier: "free", active: false, expiresLabel: "未开通" };
    return JSON.parse(raw) as PremiumState;
  } catch {
    return { tier: "free", active: false, expiresLabel: "未开通" };
  }
}

export function setPremiumState(next: PremiumState): PremiumState {
  if (!canStore()) return next;
  window.localStorage.setItem(PREMIUM_KEY, JSON.stringify(next));
  emit(PREMIUM_CHANGED_EVENT);
  return next;
}

export function activatePremium(tier: Exclude<PremiumTierId, "free">): PremiumState {
  const label = tier === "pro" ? "Premium Pro" : "Premium";
  return setPremiumState({
    tier,
    active: true,
    expiresLabel: `有效期至 2027.07.22 · ${label}`,
    startedAt: new Date().toISOString(),
  });
}

export function cancelPremium(): PremiumState {
  return setPremiumState({
    tier: "free",
    active: false,
    expiresLabel: "未开通",
  });
}

export function premiumTierLabel(tier: PremiumTierId): string {
  if (tier === "pro") return "Premium Pro";
  if (tier === "premium") return "Premium";
  return "免费版";
}

function textureOverlay(kind: AvatarPreset["texture"]): string {
  if (kind === "dots") {
    return `<circle cx="40" cy="48" r="3" fill="rgba(255,255,255,0.22)"/><circle cx="210" cy="70" r="4" fill="rgba(0,0,0,0.18)"/><circle cx="180" cy="200" r="3.5" fill="rgba(255,255,255,0.16)"/><circle cx="60" cy="190" r="2.5" fill="rgba(0,0,0,0.2)"/><circle cx="128" cy="40" r="2" fill="rgba(255,255,255,0.2)"/>`;
  }
  if (kind === "grid") {
    return `<g stroke="rgba(255,255,255,0.14)" stroke-width="1.2" fill="none"><path d="M0 64 H256 M0 128 H256 M0 192 H256 M64 0 V256 M128 0 V256 M192 0 V256"/></g>`;
  }
  if (kind === "diagonal") {
    return `<g stroke="rgba(255,255,255,0.16)" stroke-width="6" fill="none"><path d="M-40 80 L80 -40 M-40 160 L160 -40 M-40 240 L240 -40 M40 296 L296 40 M120 296 L296 120"/></g>`;
  }
  if (kind === "rings") {
    return `<g fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"><circle cx="128" cy="128" r="54"/><circle cx="128" cy="128" r="78"/><circle cx="128" cy="128" r="102"/></g>`;
  }
  if (kind === "noise") {
    return Array.from({ length: 28 }, (_, i) => {
      const x = (i * 47) % 240 + 8;
      const y = (i * 89) % 240 + 8;
      const o = 0.08 + (i % 5) * 0.03;
      return `<circle cx="${x}" cy="${y}" r="${1.5 + (i % 3)}" fill="rgba(255,255,255,${o})"/>`;
    }).join("");
  }
  return "";
}

/** 渐变 + 纹理头像 */
export function makeAvatarDataUrl(
  bgOrColor: string,
  fg: string,
  letter: string,
  texture?: AvatarPreset["texture"]
): string {
  const initial = (letter || "?").slice(0, 1).toUpperCase();
  const isCssGradient = bgOrColor.includes("gradient");
  const fillRef = isCssGradient ? "url(#avBg)" : bgOrColor;

  let gradientDef = "";
  if (isCssGradient) {
    // 简化：用双色近似常见 linear/radial（预览足够）
    const stops = extractStops(bgOrColor);
    gradientDef = `<linearGradient id="avBg" x1="0%" y1="0%" x2="100%" y2="100%">${stops
      .map((s, i) => `<stop offset="${Math.round((i / Math.max(1, stops.length - 1)) * 100)}%" stop-color="${s}"/>`)
      .join("")}</linearGradient>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs>${gradientDef}</defs><rect width="256" height="256" fill="${fillRef}"/>${textureOverlay(texture)}<text x="128" y="152" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="112" font-weight="900" fill="${fg}">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function extractStops(css: string): string[] {
  const colors = css.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
  if (colors && colors.length >= 2) return colors.slice(0, 4);
  return ["#ccff00", "#050505"];
}

export function makeAvatarFromPreset(preset: AvatarPreset, letter: string): string {
  return makeAvatarDataUrl(preset.bg, preset.fg, letter, preset.texture);
}
