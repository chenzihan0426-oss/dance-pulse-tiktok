export function getSectionTone(input: string) {
  const key = input.toLowerCase();

  if (key.includes("intro")) {
    return {
      pill: "border-indigo-400/25 bg-indigo-500/15 text-indigo-200",
      chip: "border-indigo-400/20 bg-indigo-500/10 text-indigo-200",
    };
  }

  if (key.includes("verse")) {
    return {
      pill: "border-emerald-400/25 bg-emerald-500/15 text-emerald-200",
      chip: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (key.includes("pre")) {
    return {
      pill: "border-rose-400/25 bg-rose-500/15 text-rose-200",
      chip: "border-rose-400/20 bg-rose-500/10 text-rose-200",
    };
  }

  if (key.includes("chorus")) {
    return {
      pill: "border-brand/30 bg-brand/15 text-brand-light",
      chip: "border-brand/25 bg-brand/10 text-brand-light",
    };
  }

  if (key.includes("outro")) {
    return {
      pill: "border-pink-400/25 bg-pink-500/15 text-pink-200",
      chip: "border-pink-400/20 bg-pink-500/10 text-pink-200",
    };
  }

  return {
    pill: "border-white/10 bg-white/5 text-neutral-200",
    chip: "border-white/10 bg-white/5 text-neutral-200",
  };
}
