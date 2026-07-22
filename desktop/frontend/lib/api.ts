import type {
  BadgesResponse,
  CommunityFeedItem,
  CommunityFeedResponse,
  CommunityTrackingDetailResponse,
  CommunityUserProfileResponse,
  ConfirmLessonResponse,
  LocalProgressSnapshot,
  MeResponse,
  MigrateLocalSnapshotResponse,
  ImportResponse,
  JobStatus,
  Lesson,
  LessonListItem,
  RegeneratePayload,
  Segment,
  SendSmsResponse,
  SegmentOp,
  TeachingRegenerateResponse,
  TrackingResult,
  TrackingResultsResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
  VerifySmsResponse,
} from "./types";
import { applyOps, ctxFromLesson } from "./ops";
import { MOCK_LESSON, MOCK_LESSONS } from "./mock";
import {
  applyLocalProgressSnapshot,
  buildLocalProgressSnapshot,
  clearAuthSession,
  getAuthSession,
  getAuthToken,
  isDemoAuthToken,
} from "./auth";
import { getActivity, getAllLearnedByLesson, getUnlockedBadges } from "./storage";

// Default to real backend mode once the app is integrated.
// Explicitly set NEXT_PUBLIC_USE_MOCK=true when you want local mock data.
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const API_OVERRIDE_KEY = "dp_api_override";

function normalizeApiBase(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const DEFAULT_API_BASE_NORMALIZED = normalizeApiBase(DEFAULT_API_BASE) ?? DEFAULT_API_BASE;
const CONFIGURED_API_ALLOWLIST = (process.env.NEXT_PUBLIC_ALLOWED_API_BASES || "")
  .split(",")
  .map(normalizeApiBase)
  .filter((item): item is string => Boolean(item));

function isLocalApiBase(value: string): boolean {
  const normalized = normalizeApiBase(value);
  if (!normalized) return false;
  const { hostname } = new URL(normalized);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getAllowedApiOverride(value: string): string | null {
  const normalized = normalizeApiBase(value);
  if (!normalized) return null;
  if (normalized === DEFAULT_API_BASE_NORMALIZED) return normalized;
  if (CONFIGURED_API_ALLOWLIST.includes(normalized)) return normalized;
  if (isLocalApiBase(normalized)) return normalized;

  if (typeof window !== "undefined") {
    const { hostname } = new URL(normalized);
    if (hostname === window.location.hostname) return normalized;
  }

  return null;
}

function setApiOverride(value: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(API_OVERRIDE_KEY, value);
}

function getStoredApiOverride(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(API_OVERRIDE_KEY);
}

function clearApiOverride(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(API_OVERRIDE_KEY);
}

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("api")?.trim();
    if (override) {
      const allowedOverride = getAllowedApiOverride(override);
      if (allowedOverride) {
        setApiOverride(allowedOverride);
        return allowedOverride;
      }
      clearApiOverride();
    }
    const cached = getStoredApiOverride();
    if (cached) {
      const allowedCached = getAllowedApiOverride(cached);
      if (allowedCached) return allowedCached;
      clearApiOverride();
    }
  }
  return DEFAULT_API_BASE_NORMALIZED;
}

type MockJobRecord = JobStatus;

let mockStore: Lesson = structuredClone(MOCK_LESSON);
const mockJobs = new Map<string, MockJobRecord>();
const mockTrackingResults = new Map<string, TrackingResult[]>();

function buildMockLesson(id: string): Lesson {
  const summary = MOCK_LESSONS.find((item) => item.id === id);
  const base = structuredClone(MOCK_LESSON);
  return {
    ...base,
    id,
    title: summary?.title ?? base.title,
    bpm: summary?.bpm ?? base.bpm,
    duration: summary?.duration ?? base.duration,
    thumbnail: summary?.thumbnail ?? base.thumbnail,
    confirmed: summary?.confirmed ?? base.confirmed,
    segments: base.segments.map((segment) => ({
      ...segment,
      lesson_id: id,
    })),
  };
}

function readMock(id: string): Lesson {
  if (mockStore.id !== id) {
    mockStore = buildMockLesson(id);
  }
  return structuredClone(mockStore);
}

function writeMock(next: Lesson): Lesson {
  mockStore = structuredClone(next);
  return structuredClone(mockStore);
}

function normalizeMediaUrl(value: string): string {
  if (!value) return value;
  if (/^https?:\/\//.test(value)) return value;
  return `${getApiBase()}${value}`;
}

function normalizeSegment(segment: Segment): Segment {
  return {
    ...segment,
    clip_url: normalizeMediaUrl(segment.clip_url),
    thumbnail: normalizeMediaUrl(segment.thumbnail),
    pose_url: segment.pose_url ? normalizeMediaUrl(segment.pose_url) : segment.pose_url,
    matte_rgb_url: segment.matte_rgb_url ? normalizeMediaUrl(segment.matte_rgb_url) : segment.matte_rgb_url,
    matte_mask_url: segment.matte_mask_url ? normalizeMediaUrl(segment.matte_mask_url) : segment.matte_mask_url,
    pose_full_url: segment.pose_full_url ? normalizeMediaUrl(segment.pose_full_url) : segment.pose_full_url,
    particle_url: segment.particle_url ? normalizeMediaUrl(segment.particle_url) : segment.particle_url,
  };
}

function normalizeLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    video_url: normalizeMediaUrl(lesson.video_url),
    thumbnail: normalizeMediaUrl(lesson.thumbnail),
    segments: lesson.segments.map(normalizeSegment),
  };
}

function normalizeLessonListItem(item: LessonListItem): LessonListItem {
  return {
    ...item,
    thumbnail: normalizeMediaUrl(item.thumbnail),
  };
}

function normalizeTrackingResult(result: TrackingResult): TrackingResult {
  return {
    ...result,
    videoUrl: normalizeMediaUrl(result.videoUrl),
  };
}

function normalizeCommunityFeedItem(item: CommunityFeedItem): CommunityFeedItem {
  return {
    ...item,
    result: normalizeTrackingResult(item.result),
    previewThumbnail: item.previewThumbnail ? normalizeMediaUrl(item.previewThumbnail) : null,
  };
}

async function http<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const authToken = getAuthToken();
  const apiBase = getApiBase();
  const requestInit: RequestInit = {
    ...rest,
    cache: "no-store",
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  };

  async function runRequest(base: string): Promise<T> {
    const res = await fetch(`${base}${path}`, requestInit);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 演示登录 token 非真实 JWT，401 时不要清掉本地会话
      if (res.status === 401 && authToken && !isDemoAuthToken(authToken)) {
        clearAuthSession();
      }
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  try {
    return await runRequest(apiBase);
  } catch (error) {
    const canRetryWithDefault =
      typeof window !== "undefined" &&
      apiBase !== DEFAULT_API_BASE_NORMALIZED &&
      !isLocalApiBase(DEFAULT_API_BASE_NORMALIZED);

    if (!canRetryWithDefault) {
      throw error;
    }

    clearApiOverride();
    return runRequest(DEFAULT_API_BASE_NORMALIZED);
  }
}

function buildDemoMeResponse(): MeResponse {
  const session = getAuthSession();
  const user = session?.user;
  if (!user) {
    throw new Error("未找到演示登录会话");
  }
  const learnedByLesson = getAllLearnedByLesson();
  const learnedSegments = Object.values(learnedByLesson).reduce(
    (sum, ids) => sum + ids.length,
    0
  );
  const badges = getUnlockedBadges();
  const activity = getActivity();
  const thisWeek = Array.from({ length: 7 }, (_, i) => i < (activity.currentStreak || 0));
  return {
    user,
    streak: {
      currentDays: activity.currentStreak || 0,
      thisWeek,
    },
    stats: {
      learnedSegments,
      totalStudyMinutes: Math.max(learnedSegments * 2, 0),
      badgesCount: badges.length,
      lessonsCount: Object.keys(learnedByLesson).length,
    },
    badges,
  };
}

function createMockJob(): ImportResponse {
  const jobId = `mock_job_${Date.now()}`;
  mockJobs.set(jobId, {
    job_id: jobId,
    status: "queued",
    lesson_id: null,
    error: null,
    progress: 8,
    phase: "download",
    fallback_hint: "mock 模式下会自动跳转到示例课程",
  });

  setTimeout(() => {
    mockJobs.set(jobId, {
      job_id: jobId,
      status: "ready",
      lesson_id: MOCK_LESSON.id,
      error: null,
      progress: 100,
      phase: "teaching",
      fallback_hint: "mock 模式下会自动跳转到示例课程",
    });
  }, 1400);

  return {
    job_id: jobId,
    status: "queued",
    message: "mock import started",
  };
}

export async function getLessons(): Promise<LessonListItem[]> {
  if (USE_MOCK) {
    await sleep(120);
    return structuredClone(MOCK_LESSONS);
  }
  const items = await http<LessonListItem[]>("/api/lessons");
  return items.map(normalizeLessonListItem);
}

// 删除课程及其全部本地文件(原视频/切片/缩略图/姿态等),释放磁盘空间。
export interface DeleteLessonResponse {
  deleted: boolean;
  freedBytes: number;
  removed: number;
}

export async function deleteLesson(lessonId: string): Promise<DeleteLessonResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return { deleted: true, freedBytes: 0, removed: 0 };
  }
  return http<DeleteLessonResponse>(`/api/lessons/${lessonId}`, { method: "DELETE" });
}

export async function sendSmsCode(phone: string): Promise<SendSmsResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return { ok: true, devCode: "123456", expiresIn: 300 };
  }
  return http<SendSmsResponse>("/api/auth/send-sms", {
    method: "POST",
    json: { phone },
  });
}

export async function verifySmsCode(
  phone: string,
  code: string
): Promise<VerifySmsResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return {
      ok: true,
      token: "mock_token",
      user: {
        id: "usr_mock",
        phone,
        username: "user_mock",
        displayName: `用户_${phone.slice(-4)}`,
        avatar: null,
        bio: null,
        isVerified: false,
        createdAt: new Date().toISOString(),
      },
    };
  }
  return http<VerifySmsResponse>("/api/auth/verify", {
    method: "POST",
    json: { phone, code },
  });
}

export async function getMe(): Promise<MeResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return {
      user: {
        id: "usr_mock",
        phone: "13800138000",
        username: "user_mock",
        displayName: "Nova",
        avatar: null,
        bio: null,
        isVerified: false,
        createdAt: new Date().toISOString(),
      },
      streak: {
        currentDays: 7,
        thisWeek: [true, true, true, true, true, true, true],
      },
      stats: {
        learnedSegments: 12,
        totalStudyMinutes: 24,
        badgesCount: 3,
        lessonsCount: 4,
      },
      badges: ["first_learned", "three_day_streak", "half_done"],
    };
  }
  if (isDemoAuthToken(getAuthToken())) {
    await sleep(80);
    return buildDemoMeResponse();
  }
  return http<MeResponse>("/api/me");
}

export async function getMyBadges(): Promise<BadgesResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return { badges: ["first_learned", "three_day_streak", "half_done"] };
  }
  if (isDemoAuthToken(getAuthToken())) {
    await sleep(80);
    return { badges: getUnlockedBadges() };
  }
  return http<BadgesResponse>("/api/me/badges");
}

export async function migrateLocalSnapshot(
  snapshot: LocalProgressSnapshot
): Promise<MigrateLocalSnapshotResponse> {
  if (USE_MOCK || isDemoAuthToken(getAuthToken())) {
    await sleep(120);
    return { ok: true, snapshot };
  }
  return http<MigrateLocalSnapshotResponse>("/api/me/migrate-local", {
    method: "POST",
    json: { snapshot },
  });
}

let syncTimer: number | null = null;

export function requestLocalSnapshotSync(): void {
  if (USE_MOCK) return;
  if (isDemoAuthToken(getAuthToken())) return;
  if (!getAuthToken() || typeof window === "undefined") return;

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
  }

  syncTimer = window.setTimeout(async () => {
    syncTimer = null;
    try {
      const response = await migrateLocalSnapshot(buildLocalProgressSnapshot());
      applyLocalProgressSnapshot(response.snapshot);
    } catch {
      // Ignore silent sync failures; the next successful write/login will retry.
    }
  }, 180);
}

export async function getLesson(id: string): Promise<Lesson> {
  if (USE_MOCK) {
    await sleep(120);
    return readMock(id);
  }
  return normalizeLesson(await http<Lesson>(`/api/lessons/${id}`));
}

export async function patchSegments(
  id: string,
  ops: SegmentOp[]
): Promise<Lesson> {
  if (USE_MOCK) {
    await sleep(180);
    const current = readMock(id);
    const nextSegments = applyOps(current.segments, ops, ctxFromLesson(current));
    return writeMock({ ...current, confirmed: false, segments: nextSegments });
  }
  return normalizeLesson(
    await http<Lesson>(`/api/lessons/${id}/segments`, {
      method: "PATCH",
      json: { ops },
    })
  );
}

export async function confirmLesson(id: string): Promise<Lesson> {
  if (USE_MOCK) {
    await sleep(120);
    const current = readMock(id);
    return writeMock({ ...current, confirmed: true });
  }
  const response = await http<ConfirmLessonResponse>(`/api/lessons/${id}/confirm`, {
    method: "POST",
  });
  return normalizeLesson(response.lesson);
}

export async function regenerateLesson(
  id: string,
  payload: RegeneratePayload
): Promise<Lesson> {
  if (USE_MOCK) {
    await sleep(500);
    const base = buildMockLesson(id);
    if (payload.granularity === 16) {
      base.segments = base.segments
        .filter((_, index) => index % 2 === 0)
        .map((segment, index) => ({
          ...segment,
          index,
          beat_count: 16,
          end: base.segments[Math.min(segment.index + 1, base.segments.length - 1)].end,
          duration: +(
            base.segments[Math.min(segment.index + 1, base.segments.length - 1)].end -
            segment.start
          ).toFixed(2),
        }));
    }
    return writeMock({ ...base, confirmed: false });
  }
  return normalizeLesson(
    await http<Lesson>(`/api/lessons/${id}/regenerate`, {
      method: "POST",
      json: payload,
    })
  );
}

export async function regenerateTeaching(
  lessonId: string,
  segmentId: string
): Promise<TeachingRegenerateResponse> {
  if (USE_MOCK) {
    await sleep(200);
    return { ok: true, status: "pending" };
  }
  return http<TeachingRegenerateResponse>(
    `/api/lessons/${lessonId}/segments/${segmentId}/teaching/regenerate`,
    {
      method: "POST",
    }
  );
}

export async function importFromUrl(url: string): Promise<ImportResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return createMockJob();
  }
  return http<ImportResponse>("/api/import", {
    method: "POST",
    json: { url },
  });
}

export async function importFromUrlWithCookies(
  url: string,
  cookiesFile: File
): Promise<ImportResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return createMockJob();
  }
  const formData = new FormData();
  formData.append("url", url);
  formData.append("cookies_file", cookiesFile);
  return http<ImportResponse>("/api/import/with-cookies", {
    method: "POST",
    body: formData,
  });
}

export async function uploadVideo(file: File): Promise<ImportResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return createMockJob();
  }
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${getApiBase()}/api/import/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<ImportResponse>;
}

export async function getImportJob(jobId: string): Promise<JobStatus> {
  if (USE_MOCK) {
    await sleep(120);
    return (
      structuredClone(mockJobs.get(jobId)) ?? {
        job_id: jobId,
        status: "failed",
        lesson_id: null,
        error: "mock job not found",
        progress: 0,
        phase: "download",
        fallback_hint: "请重新发起导入",
      }
    );
  }
  return http<JobStatus>(`/api/jobs/${jobId}`);
}

export async function getSegmentContext(
  segmentId: string,
  lessonHint?: string | null
): Promise<{ lesson: Lesson; segment: Segment }> {
  if (lessonHint) {
    const lesson = await getLesson(lessonHint);
    const segment = lesson.segments.find((item) => item.id === segmentId);
    if (segment) return { lesson, segment };
  }

  const lessons = await getLessons();
  for (const lessonItem of lessons) {
    const lesson = await getLesson(lessonItem.id);
    const segment = lesson.segments.find((item) => item.id === segmentId);
    if (segment) return { lesson, segment };
  }

  throw new Error(`找不到切片 ${segmentId}`);
}

export async function submitTrackingVideo(
  lessonId: string,
  file: File
): Promise<TrackingResult> {
  if (USE_MOCK) {
    await sleep(180);
    const lesson = await getLesson(lessonId);
    const practiceSegments = lesson.segments.filter((item) => !item.deleted && !item.is_still);
    const segmentScores = practiceSegments.map((segment, index) => ({
      segmentId: segment.id,
      score: Math.max(62, 92 - index * 2),
      timingMs: 120 + index * 18,
    }));
    const result: TrackingResult = {
      id: `trk_mock_${Date.now()}`,
      lessonId,
      userId: "guest_local",
      createdAt: new Date().toISOString(),
      score: Math.round(segmentScores.reduce((sum, item) => sum + item.score, 0) / segmentScores.length),
      segmentScores,
      videoUrl: URL.createObjectURL(file),
      isPublic: false,
      publishedAt: null,
      likeCount: 0,
      commentCount: 0,
      moderationStatus: "none",
      moderationReason: null,
    };
    const existing = mockTrackingResults.get(lessonId) ?? [];
    mockTrackingResults.set(lessonId, [result, ...existing]);
    return result;
  }

  const authToken = getAuthToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${getApiBase()}/api/lessons/${lessonId}/tracking`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 && authToken && !isDemoAuthToken(authToken)) {
      clearAuthSession();
    }
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return normalizeTrackingResult((await res.json()) as TrackingResult);
}

export async function getTrackingResults(lessonId: string): Promise<TrackingResult[]> {
  if (USE_MOCK) {
    await sleep(120);
    return structuredClone(mockTrackingResults.get(lessonId) ?? []);
  }
  const response = await http<TrackingResultsResponse>(`/api/lessons/${lessonId}/tracking/results`);
  return response.results.map(normalizeTrackingResult);
}

// 姿态比对会话（Phase 2）：挑战结束把 SessionResult POST 给后端。
export interface SubmitSessionResponse {
  sessionId: string;
  overallScore: number;
  segments: number;
}

export async function submitTrackingSession(
  lessonId: string,
  payload: unknown
): Promise<SubmitSessionResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return { sessionId: `sess_mock_${Date.now()}`, overallScore: 0, segments: 0 };
  }
  return http<SubmitSessionResponse>(`/api/lessons/${lessonId}/tracking/sessions`, {
    method: "POST",
    json: payload,
  });
}

export type TrackingSessionSummary = {
  sessionId: string;
  overallScore: number;
  frameCount: number;
  poseSource: string;
  createdAt: string;
};

export async function listTrackingSessions(lessonId: string): Promise<TrackingSessionSummary[]> {
  if (USE_MOCK) {
    await sleep(80);
    return [];
  }
  const res = await http<{ sessions: TrackingSessionSummary[] }>(
    `/api/lessons/${lessonId}/tracking/sessions`
  );
  return res.sessions ?? [];
}

// 逐动作难度聚合（Phase 3/4）。scope: 'global' | 'me'
export interface DifficultyAggregate {
  segmentId: string;
  attempts: number;
  avgScore: number;
  scoreVariance: number;
  measuredDifficulty: number;
  topWorstJoint: string | null;
  updatedAt: string;
}

export async function getTrackingDifficulty(
  lessonId: string,
  scope: "global" | "me" = "global"
): Promise<DifficultyAggregate[]> {
  if (USE_MOCK) {
    await sleep(80);
    return [];
  }
  const res = await http<{ aggregates: DifficultyAggregate[] }>(
    `/api/lessons/${lessonId}/tracking/difficulty?scope=${scope}`
  );
  return res.aggregates;
}

export async function publishTrackingResult(resultId: string): Promise<TrackingResult> {
  if (USE_MOCK) {
    await sleep(120);
    for (const [lessonId, items] of mockTrackingResults.entries()) {
      const index = items.findIndex((item) => item.id === resultId);
      if (index >= 0) {
        const next = {
          ...items[index],
          isPublic: true,
          publishedAt: new Date().toISOString(),
        };
        items[index] = next;
        mockTrackingResults.set(lessonId, items);
        return next;
      }
    }
    throw new Error("404 Not Found: mock tracking result not found");
  }
  return normalizeTrackingResult(
    await http<TrackingResult>(`/api/community/tracking-results/${resultId}/publish`, {
      method: "POST",
    })
  );
}

export async function unpublishTrackingResult(resultId: string): Promise<TrackingResult> {
  if (USE_MOCK) {
    await sleep(120);
    for (const [lessonId, items] of mockTrackingResults.entries()) {
      const index = items.findIndex((item) => item.id === resultId);
      if (index >= 0) {
        const next = {
          ...items[index],
          isPublic: false,
          publishedAt: null,
        };
        items[index] = next;
        mockTrackingResults.set(lessonId, items);
        return next;
      }
    }
    throw new Error("404 Not Found: mock tracking result not found");
  }
  return normalizeTrackingResult(
    await http<TrackingResult>(`/api/community/tracking-results/${resultId}/unpublish`, {
      method: "POST",
    })
  );
}

export async function deleteCommunityTrackingResult(resultId: string): Promise<void> {
  if (USE_MOCK) {
    await sleep(120);
    for (const [lessonId, items] of mockTrackingResults.entries()) {
      mockTrackingResults.set(
        lessonId,
        items.filter((item) => item.id !== resultId)
      );
    }
    return;
  }
  await http<{ ok: boolean }>(`/api/community/tracking-results/${resultId}`, {
    method: "DELETE",
  });
}

export async function getCommunityFeed(): Promise<CommunityFeedItem[]> {
  if (USE_MOCK) {
    await sleep(120);
    const flat = Array.from(mockTrackingResults.values()).flat();
    return flat
      .filter((item) => item.isPublic)
      .map((item) => ({
        result: item,
        user: {
          id: "guest_local",
          username: "local_guest",
          displayName: "本机访客",
          avatar: null,
          bio: "跳舞的人",
          isVerified: false,
          createdAt: item.createdAt,
          isFollowing: false,
          stats: {
            userId: "guest_local",
            followerCount: 0,
            followingCount: 0,
            publishedTrackingCount: flat.filter((entry) => entry.isPublic).length,
            totalLikesReceived: 0,
          },
        },
        lessonTitle: MOCK_LESSON.title,
        previewThumbnail: MOCK_LESSON.thumbnail,
        likedByMe: false,
      }))
      .sort((a, b) => (a.result.createdAt < b.result.createdAt ? 1 : -1));
  }
  const response = await http<CommunityFeedResponse>("/api/community/feed");
  return response.items.map(normalizeCommunityFeedItem);
}

/** 扫描本机 backend/data 下的 demo 视频与封面（不入库，丢文件即出现） */
export async function getDemoMedia(): Promise<{ videos: string[]; thumbs: string[] }> {
  if (USE_MOCK) {
    return { videos: [], thumbs: [] };
  }
  try {
    return await http<{ videos: string[]; thumbs: string[] }>("/api/demo-media");
  } catch {
    return { videos: [], thumbs: [] };
  }
}

export async function getCommunityTrackingDetail(
  resultId: string
): Promise<CommunityTrackingDetailResponse> {
  if (USE_MOCK) {
    await sleep(120);
    const item = (await getCommunityFeed()).find((entry) => entry.result.id === resultId);
    if (!item) throw new Error("404 Not Found: mock community item not found");
    return { item, comments: [] };
  }
  const response = await http<CommunityTrackingDetailResponse>(`/api/community/tracking-results/${resultId}`);
  return {
    ...response,
    item: normalizeCommunityFeedItem(response.item),
    comments: response.comments,
  };
}

export async function toggleCommunityLike(resultId: string): Promise<ToggleLikeResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return { liked: true, likeCount: 1 };
  }
  return http<ToggleLikeResponse>(`/api/community/tracking-results/${resultId}/like`, {
    method: "POST",
  });
}

export async function addCommunityComment(
  resultId: string,
  content: string
): Promise<CommunityTrackingDetailResponse["comments"]> {
  if (USE_MOCK) {
    await sleep(120);
    return [
      {
        id: `cmt_mock_${Date.now()}`,
        trackingResultId: resultId,
        userId: "guest_local",
        username: "local_guest",
        displayName: "本机访客",
        avatar: null,
        content,
        createdAt: new Date().toISOString(),
      },
    ];
  }
  const response = await http<{ comment: unknown; comments: CommunityTrackingDetailResponse["comments"] }>(
    `/api/community/tracking-results/${resultId}/comments`,
    {
      method: "POST",
      json: { content },
    }
  );
  return response.comments;
}

export async function getCommunityUserProfile(
  username: string
): Promise<CommunityUserProfileResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return {
      user: {
        id: "guest_local",
        username,
        displayName: "本机访客",
        avatar: null,
        bio: "跳舞的人",
        isVerified: false,
        createdAt: new Date().toISOString(),
        isFollowing: false,
        stats: {
          userId: "guest_local",
          followerCount: 0,
          followingCount: 0,
          publishedTrackingCount: 0,
          totalLikesReceived: 0,
        },
      },
      results: await getCommunityFeed(),
    };
  }
  const response = await http<CommunityUserProfileResponse>(`/api/community/users/${username}`);
  return {
    ...response,
    results: response.results.map(normalizeCommunityFeedItem),
  };
}

export async function toggleCommunityFollow(username: string): Promise<ToggleFollowResponse> {
  if (USE_MOCK) {
    await sleep(120);
    return { following: true, followerCount: 1 };
  }
  return http<ToggleFollowResponse>(`/api/community/users/${username}/follow`, {
    method: "POST",
  });
}

export function resolveMediaUrl(path: string): string {
  return normalizeMediaUrl(path);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
