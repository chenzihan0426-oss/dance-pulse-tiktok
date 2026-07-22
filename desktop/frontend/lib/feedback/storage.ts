import { buildInsights } from "./insights";
import type { FeedbackReport } from "./types";

const SESSION_KEY = "dp_feedback_report_v1";
const HISTORY_KEY = "dp_feedback_history_v1";
const HISTORY_LIMIT = 20;

export type FeedbackHistoryItem = {
  id: string;
  lessonId: string;
  lessonTitle?: string;
  createdAt: string;
  overallBoneScore: number;
  overallFusedScore: number;
  frameCount: number;
  headline: string;
  worstBoneLabel?: string;
  worstJointLabel?: string;
};

type HistoryStore = Record<string, FeedbackHistoryItem[]>;

/** 挑战结束后暂存报告，供 /feedback 页读取（同课覆盖最新一次）。 */
export function saveFeedbackReport(report: FeedbackReport): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(report));
  } catch {
    // quota / private mode — ignore
  }
  appendFeedbackHistory(report);
}

/** 兼容阶段 1 旧缓存：缺文案时现场补生成。 */
export function hydrateFeedbackReport(parsed: FeedbackReport): FeedbackReport {
  if (parsed.headline && Array.isArray(parsed.insights) && Array.isArray(parsed.segmentComments)) {
    return parsed;
  }
  const narrative = buildInsights(parsed);
  return { ...parsed, ...narrative };
}

export function loadFeedbackReport(lessonId?: string): FeedbackReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedbackReport;
    if (parsed?.version !== 1) return null;
    if (lessonId && parsed.lessonId !== lessonId) return null;
    return hydrateFeedbackReport(parsed);
  } catch {
    return null;
  }
}

export function clearFeedbackReport(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function readHistoryStore(): HistoryStore {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HistoryStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeHistoryStore(store: HistoryStore): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function toHistoryItem(report: FeedbackReport): FeedbackHistoryItem {
  return {
    id: `fb_${report.createdAt}_${report.overallBoneScore}`,
    lessonId: report.lessonId,
    lessonTitle: report.lessonTitle,
    createdAt: report.createdAt,
    overallBoneScore: report.overallBoneScore,
    overallFusedScore: report.overallFusedScore,
    frameCount: report.frameCount,
    headline: report.headline,
    worstBoneLabel: report.worstBone?.label,
    worstJointLabel: report.worstJoint?.label,
  };
}

/** 阶段 4：写入本课历史（localStorage，按时间倒序，上限 HISTORY_LIMIT）。 */
export function appendFeedbackHistory(report: FeedbackReport): void {
  if (typeof window === "undefined") return;
  const store = readHistoryStore();
  const list = store[report.lessonId] ?? [];
  const item = toHistoryItem(report);
  const next = [item, ...list.filter((x) => x.id !== item.id)].slice(0, HISTORY_LIMIT);
  store[report.lessonId] = next;
  writeHistoryStore(store);
}

export function listFeedbackHistory(lessonId: string): FeedbackHistoryItem[] {
  if (typeof window === "undefined") return [];
  return readHistoryStore()[lessonId] ?? [];
}

/** 同课上一份报告（不含当前刚写入的那条时，取 history[1]）。 */
export function getPreviousFeedbackSummary(
  lessonId: string,
  currentCreatedAt?: string,
): FeedbackHistoryItem | null {
  const list = listFeedbackHistory(lessonId);
  if (!list.length) return null;
  if (!currentCreatedAt) return list[1] ?? null;
  const idx = list.findIndex((x) => x.createdAt === currentCreatedAt);
  if (idx >= 0) return list[idx + 1] ?? null;
  return list[0] ?? null;
}
