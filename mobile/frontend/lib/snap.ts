import { t2 } from "./utils";

/**
 * Snap a time value to the nearest beat if within tolerance.
 *
 * Spec (per agent prompt):
 *   - find nearest beat
 *   - if |nearest - time| < tolerance, return that beat
 *   - otherwise return the original time
 *
 * We also round to 2 decimals to match the project-wide time precision
 * contract (PRD §8).
 */
export function snapToBeat(
  time: number,
  beats: number[],
  tolerance = 0.1
): number {
  if (!beats || beats.length === 0) return t2(time);
  const nearest = beats.reduce((a, b) =>
    Math.abs(b - time) < Math.abs(a - time) ? b : a
  );
  return t2(Math.abs(nearest - time) < tolerance ? nearest : time);
}

/** Binary search — index of the first beat >= time. */
export function lowerBeatIndex(beats: number[], time: number): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beats[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Count how many whole beats fit in [start, end]. Used to derive beat_count. */
export function beatsBetween(
  beats: number[],
  start: number,
  end: number
): number {
  if (!beats || beats.length === 0) return 0;
  const eps = 0.01;
  let count = 0;
  for (const b of beats) {
    if (b < start - eps) continue;
    if (b > end + eps) break;
    count++;
  }
  // count includes both endpoints; intervals between them is count-1
  return Math.max(0, count - 1);
}

/** Check time falls on a beat within 0.01s tolerance — matches backend validation. */
export function isOnBeat(time: number, beats: number[], eps = 0.01): boolean {
  if (!beats?.length) return false;
  // Binary search for nearest
  const idx = lowerBeatIndex(beats, time);
  const candidates: number[] = [];
  if (idx < beats.length) candidates.push(beats[idx]);
  if (idx > 0) candidates.push(beats[idx - 1]);
  return candidates.some((b) => Math.abs(b - time) <= eps);
}
