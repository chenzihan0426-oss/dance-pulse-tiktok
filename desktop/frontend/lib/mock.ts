import type { Lesson, LessonListItem, Segment } from "./types";

const BEATS = Array.from({ length: 420 }, (_, i) => +(i * 0.476).toFixed(2));

function buildSegments(): Segment[] {
  return Array.from({ length: 18 }, (_, i) => {
    const beatStart = i * 8;
    const beatEnd = beatStart + 8;
    const start = BEATS[Math.min(beatStart, BEATS.length - 1)] ?? 0;
    const end = BEATS[Math.min(beatEnd, BEATS.length - 1)] ?? start;

    const sectionId =
      i < 2 ? "intro" : i < 6 ? "verse_1" : i < 8 ? "prechorus_1" : i < 14 ? "chorus_1" : "outro";
    const sectionLabel =
      i < 2 ? "前奏" : i < 6 ? "Verse 1" : i < 8 ? "Pre" : i < 14 ? "副歌" : "尾声";
    const isStill = i === 0 || i === 17;

    return {
      id: `seg_${String(i).padStart(3, "0")}`,
      lesson_id: "antifragile_dp",
      index: i,
      section: sectionId,
      section_label: sectionLabel,
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      duration: +(end - start).toFixed(2),
      beat_count: 8,
      thumbnail: `https://picsum.photos/seed/seg${i}/320/180`,
      clip_url: `https://demo.dancepulse.app/clips/seg_${String(i).padStart(3, "0")}.mp4`,
      difficulty: ((i * 7 + 3) % 5) + 1,
      is_still: isStill,
      ai_description: isStill ? "静止片段" : `片段 ${i} 动作占位描述`,
      user_edited: false,
      teaching: isStill
        ? null
        : {
            status: "ready",
            summary: `第 ${i + 1} 段：${sectionLabel} 主打动作`,
            steps: [
              { beats: "1-2", content: "身体微下沉，重心转到左脚" },
              { beats: "3-4", content: "右手从腰部上举至头顶划圆" },
              { beats: "5-6", content: "左手下沉配合点胯" },
              { beats: "7-8", content: "回到起始位准备下一个 count" },
            ],
            tips: ["注意手臂弧度不要完全伸直", "重心下压配合音乐 drop"],
            beat_cues: ["起手", null, "推胯", null, "下沉", null, "定点", null],
            generated_at: "2026-04-17T03:12:00Z",
          },
    };
  });
}

const segments = buildSegments();

export const MOCK_LESSON: Lesson = {
  id: "antifragile_dp",
  title: "ANTIFRAGILE - LE SSERAFIM",
  source_url: "https://www.douyin.com/video/demo",
  duration: +segments[segments.length - 1].end.toFixed(2),
  bpm: 126,
  video_url:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  thumbnail: "https://picsum.photos/seed/lesson/640/360",
  confirmed: false,
  beats: BEATS,
  sections: [
    { id: "intro", label: "前奏", start: 0, end: BEATS[16] ?? 8 },
    { id: "verse_1", label: "Verse 1", start: BEATS[16] ?? 8, end: BEATS[48] ?? 24 },
    { id: "prechorus_1", label: "Pre", start: BEATS[48] ?? 24, end: BEATS[64] ?? 32 },
    { id: "chorus_1", label: "副歌 1", start: BEATS[64] ?? 32, end: BEATS[112] ?? 56 },
    { id: "outro", label: "尾声", start: BEATS[112] ?? 56, end: +segments[segments.length - 1].end.toFixed(2) },
  ],
  segments,
};

export const MOCK_LESSONS: LessonListItem[] = [
  {
    id: "antifragile_dp",
    title: "ANTIFRAGILE - LE SSERAFIM",
    thumbnail: "https://picsum.photos/seed/lesson-a/640/360",
    duration: 203.4,
    bpm: 126,
    confirmed: false,
  },
  {
    id: "hype_boy_dp",
    title: "Hype Boy - NewJeans",
    thumbnail: "https://picsum.photos/seed/lesson-b/640/360",
    duration: 198.2,
    bpm: 115,
    confirmed: true,
  },
  {
    id: "unforgiven_dp",
    title: "UNFORGIVEN - LE SSERAFIM",
    thumbnail: "https://picsum.photos/seed/lesson-c/640/360",
    duration: 214.6,
    bpm: 120,
    confirmed: true,
  },
  {
    id: "ditto_dp",
    title: "Ditto - NewJeans",
    thumbnail: "https://picsum.photos/seed/lesson-d/640/360",
    duration: 190.8,
    bpm: 104,
    confirmed: true,
  },
  {
    id: "love_dive_dp",
    title: "LOVE DIVE - IVE",
    thumbnail: "https://picsum.photos/seed/lesson-e/640/360",
    duration: 201.5,
    bpm: 105,
    confirmed: false,
  },
  {
    id: "talk_that_talk_dp",
    title: "Talk that Talk - TWICE",
    thumbnail: "https://picsum.photos/seed/lesson-f/640/360",
    duration: 196.9,
    bpm: 120,
    confirmed: true,
  },
];
