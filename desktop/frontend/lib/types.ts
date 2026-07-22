export interface Section {
  id: string;
  label: string;
  start: number;
  end: number;
}

export interface TeachingStep {
  beats: string;
  content: string;
}

export interface Teaching {
  status: "ready" | "pending" | "failed";
  summary: string;
  steps: TeachingStep[];
  tips: string[];
  beat_cues: (string | null)[];
  generated_at: string;
}

export interface Segment {
  id: string;
  lesson_id: string;
  index: number;
  section: string;
  section_label: string;
  start: number;
  end: number;
  duration: number;
  beat_count: number;
  thumbnail: string;
  clip_url: string;
  pose_url?: string;
  matte_rgb_url?: string;
  matte_mask_url?: string;
  pose_full_url?: string;
  particle_url?: string;
  difficulty: number;
  is_still: boolean;
  ai_description: string;
  user_edited: boolean;
  teaching: Teaching | null;
  deleted?: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  source_url: string;
  duration: number;
  bpm: number;
  video_url: string;
  thumbnail: string;
  confirmed: boolean;
  beats: number[];
  sections: Section[];
  segments: Segment[];
}

export interface LessonListItem {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  bpm: number;
  confirmed: boolean;
  demo_ready?: boolean;
  has_video?: boolean;
}

export interface User {
  id: string;
  phone: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface UserStats {
  userId: string;
  followerCount: number;
  followingCount: number;
  publishedTrackingCount: number;
  totalLikesReceived: number;
}

export interface UserLessonState {
  lessonId: string;
  enrolled: boolean;
  favorited: boolean;
  lastStudiedAt: string | null;
}

export interface TrackingResult {
  id: string;
  lessonId: string;
  userId: string;
  createdAt: string;
  score: number;
  segmentScores: TrackingSegmentScore[];
  videoUrl: string;
  isPublic: boolean;
  publishedAt: string | null;
  likeCount: number;
  commentCount: number;
  moderationStatus: "none" | "pending" | "approved" | "rejected";
  moderationReason: string | null;
}

export interface TrackingSegmentScore {
  segmentId: string;
  score: number;
  timingMs: number;
}

export interface TrackingResultsResponse {
  results: TrackingResult[];
}

export interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  isVerified: boolean;
  createdAt: string;
  stats: UserStats;
  isFollowing: boolean;
}

export interface CommunityComment {
  id: string;
  trackingResultId: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  content: string;
  createdAt: string;
  /** 精选评论（约 10%） */
  isFeatured?: boolean;
}

export interface CommunityFeedItem {
  result: TrackingResult;
  user: PublicUserProfile;
  lessonTitle: string;
  previewThumbnail: string | null;
  likedByMe: boolean;
}

export interface CommunityFeedResponse {
  items: CommunityFeedItem[];
}

export interface CommunityTrackingDetailResponse {
  item: CommunityFeedItem;
  comments: CommunityComment[];
}

export interface CommunityUserProfileResponse {
  user: PublicUserProfile;
  results: CommunityFeedItem[];
}

export interface ToggleLikeResponse {
  liked: boolean;
  likeCount: number;
}

export interface ToggleFollowResponse {
  following: boolean;
  followerCount: number;
}

export interface MeStreak {
  currentDays: number;
  thisWeek: boolean[];
}

export interface MeStats {
  learnedSegments: number;
  totalStudyMinutes: number;
  badgesCount: number;
  lessonsCount: number;
}

export interface MeResponse {
  user: User;
  streak: MeStreak;
  stats: MeStats;
  badges: string[];
}

export interface BadgesResponse {
  badges: string[];
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface SendSmsResponse {
  ok: boolean;
  devCode: string | null;
  expiresIn: number;
}

export interface VerifySmsResponse {
  ok: boolean;
  token: string;
  user: User;
}

export interface ActivityStateSnapshot {
  lastActiveDate: string | null;
  currentStreak: number;
}

export interface LocalProgressSnapshot {
  learnedByLesson: Record<string, string[]>;
  badges: string[];
  activity: ActivityStateSnapshot;
  userLessonStates: Record<string, UserLessonState>;
  lastViewedSegmentIds: Record<string, string | null>;
}

export interface MigrateLocalSnapshotResponse {
  ok: boolean;
  snapshot: LocalProgressSnapshot;
}

export type SegmentOp =
  | { op: "update"; id: string; start: number; end: number }
  | { op: "merge"; ids: string[] }
  | { op: "split"; id: string; at: number }
  | { op: "delete"; id: string }
  | { op: "create"; start: number; end: number; section: string };

export interface RegeneratePayload {
  granularity: 4 | 8 | 16;
  still_handling: "mark" | "merge" | "delete";
  section_detection: boolean;
}

export interface ConfirmLessonResponse {
  ok: boolean;
  lesson: Lesson;
}

export interface TeachingRegenerateResponse {
  ok: boolean;
  status: string;
}

export interface ImportResponse {
  job_id: string;
  status: string;
  message?: string | null;
}

export interface JobStatus {
  job_id: string;
  status: string;
  lesson_id: string | null;
  error: string | null;
  fallback_hint: string;
  progress: number;
  phase: "download" | "beat" | "segment" | "teaching" | string;
}
