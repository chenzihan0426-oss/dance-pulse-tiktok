# 前端合并指南（M3 + M4 + M5 + M7）

这个目录是 4 个模块合并的地方。合并复杂度最高。

---

## 最终目录结构（合并后）

```
frontend/
├── app/
│   ├── layout.tsx                         ← M3
│   ├── page.tsx                           ← M3 (首页)
│   ├── globals.css                        ← M3
│   ├── import/page.tsx                    ← M3
│   ├── lesson/[id]/
│   │   ├── page.tsx                       ← M3 (详情页)
│   │   └── confirm/page.tsx               ← M7 (确认页) 【新增】
│   └── player/[segId]/page.tsx            ← M3 (播放器页)
├── components/
│   ├── LessonCard.tsx                     ← M3
│   ├── SegmentCard.tsx                    ← M3
│   ├── TeachingPanel.tsx                  ← M3
│   ├── FilterBar.tsx                      ← M3
│   ├── ProgressFooter.tsx                 ← M3
│   ├── Player.tsx                         ← M4 【覆盖 M3 占位】
│   ├── BeatCounter.tsx                    ← M4
│   ├── SpeedControl.tsx                   ← M4
│   ├── PlayerControls.tsx                 ← M4
│   ├── BadgeToast.tsx                     ← M5
│   ├── Timeline.tsx                       ← M7
│   ├── TimelineSegmentBlock.tsx           ← M7
│   ├── TimelineBeatRuler.tsx              ← M7
│   ├── SegmentList.tsx                    ← M7
│   ├── SegmentEditor.tsx                  ← M7
│   └── RegenerateDialog.tsx               ← M7
├── lib/
│   ├── types.ts                           ← M3 为底 + M5/M7 追加【手动合并】
│   ├── api.ts                             ← M3 【补充 M7 需要的端点】
│   ├── mock.ts                            ← M3
│   ├── storage.ts                         ← M5
│   ├── badges.ts                          ← M5
│   ├── snap.ts                            ← M7
│   └── ops.ts                             ← M7
├── hooks/
│   ├── useLearningProgress.ts             ← M5 【覆盖 M3 占位】
│   ├── useBadges.ts                       ← M5
│   ├── useLearningStreak.ts               ← M5
│   └── useSegmentEditor.ts                ← M7
├── public/
├── package.json                           ← M3 为底 + 追加
├── tsconfig.json                          ← M3
├── tailwind.config.ts                     ← M3
├── postcss.config.js                      ← M3
└── next.config.js                         ← M3
```

---

## 合并步骤（严格按顺序）

### Step 1 · 先把 M3 整个目录拷过来作为底

```bash
# 假设 M3 模块在本地 ~/modules/frontend-m3/
cp -r ~/modules/frontend-m3/. ./
```

此时：
- `components/Player.tsx` 是个占位（原生 `<video controls />`）
- `hooks/useLearningProgress.ts` 返回假数据

### Step 2 · M4 覆盖 Player

```bash
cp ~/modules/player-m4/components/Player.tsx         ./components/Player.tsx
cp ~/modules/player-m4/components/BeatCounter.tsx    ./components/BeatCounter.tsx
cp ~/modules/player-m4/components/SpeedControl.tsx   ./components/SpeedControl.tsx
cp ~/modules/player-m4/components/PlayerControls.tsx ./components/PlayerControls.tsx
```

**M4 的 `demo/player/page.tsx` 不要拷贝**（那是独立测试用的）。

### Step 3 · M5 覆盖 hooks

```bash
# 覆盖占位
cp ~/modules/gamification-m5/hooks/useLearningProgress.ts ./hooks/useLearningProgress.ts

# 追加新文件
cp ~/modules/gamification-m5/hooks/useBadges.ts           ./hooks/useBadges.ts
cp ~/modules/gamification-m5/hooks/useLearningStreak.ts   ./hooks/useLearningStreak.ts
cp ~/modules/gamification-m5/lib/storage.ts               ./lib/storage.ts
cp ~/modules/gamification-m5/lib/badges.ts                ./lib/badges.ts
cp ~/modules/gamification-m5/components/BadgeToast.tsx    ./components/BadgeToast.tsx
```

**M5 的 `lib/types.ts` 不要直接覆盖**（见 Step 5）。
**M5 的 `demo/gamification/page.tsx` 不要拷贝**。

### Step 4 · M7 追加确认页相关

```bash
# 新路由
mkdir -p app/lesson/\[id\]/confirm
cp ~/modules/confirm-m7/app/lesson/\[id\]/confirm/page.tsx  ./app/lesson/\[id\]/confirm/page.tsx

# 组件
cp ~/modules/confirm-m7/components/Timeline.tsx              ./components/Timeline.tsx
cp ~/modules/confirm-m7/components/TimelineSegmentBlock.tsx  ./components/TimelineSegmentBlock.tsx
cp ~/modules/confirm-m7/components/TimelineBeatRuler.tsx     ./components/TimelineBeatRuler.tsx
cp ~/modules/confirm-m7/components/SegmentList.tsx           ./components/SegmentList.tsx
cp ~/modules/confirm-m7/components/SegmentEditor.tsx         ./components/SegmentEditor.tsx
cp ~/modules/confirm-m7/components/RegenerateDialog.tsx      ./components/RegenerateDialog.tsx

# hook
cp ~/modules/confirm-m7/hooks/useSegmentEditor.ts            ./hooks/useSegmentEditor.ts

# lib
cp ~/modules/confirm-m7/lib/snap.ts                          ./lib/snap.ts
cp ~/modules/confirm-m7/lib/ops.ts                           ./lib/ops.ts
```

**M7 的 `demo/confirm/page.tsx` 不要拷贝**。

### Step 5 · 手动合并 `lib/types.ts`

以 M3 的为底。打开 M5 和 M7 各自的 `lib/types.ts`，把它们独有的类型追加到 M3 文件末尾。

**一般规则**：
- Lesson / Segment / Section / Teaching → M3（也是契约源头）
- Badge / LearningProgress / StreakState → M5 追加
- Op / PendingOp / OpKind → M7 追加

最终这个文件应该和 `docs/CONTRACTS.md` 的 TypeScript 类型段落完全一致。直接拿那个文件的代码覆盖最省事。

### Step 6 · 合并 `lib/api.ts`

M3 的 `api.ts` 只涵盖 GET lessons / GET lesson / POST import 3 个端点。

需要追加：
- `patchSegments(lessonId, ops)` — M7 需要
- `confirmLesson(lessonId)` — M7 需要
- `regenerateLesson(lessonId, config)` — M7 需要
- `regenerateTeaching(segmentId)` — 播放器页需要

追加模板见本文档末尾附录 A。

### Step 7 · 合并 `package.json`

M3 `package.json` 为底，追加：

```json
{
  "dependencies": {
    "@use-gesture/react": "^10.3.1"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@vitest/ui": "^1.6.0"
  }
}
```

然后：

```bash
npm install
```

### Step 8 · 详情页接线 M5 的进度 hook

编辑 `app/lesson/[id]/page.tsx`，把原来占位的 `useLearningProgress` 调用换成 M5 的真实 hook：

```tsx
// 原先（M3 占位）：
// import { useLearningProgress } from "@/hooks/useLearningProgress";
// const { learned, total, progress, markLearned } = useLearningProgress(lessonId);

// 保持不变！M5 的 hook 签名就是这样
// 只需要检查实际返回字段名对齐（参考 CONTRACTS.md 的 LearningProgress 类型）
```

**关键**：M3 写 hook 占位时的字段名要和 M5 的真实实现一致。如不一致，以 M5 为准，改 M3 的调用。

### Step 9 · 详情页接线 M5 的徽章 toast

在 `app/layout.tsx` 或详情页加上：

```tsx
import { BadgeToast } from "@/components/BadgeToast";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <BadgeToast />    {/* 全局挂一个 */}
      </body>
    </html>
  );
}
```

### Step 10 · 播放器页接线 M4 Player + 教学面板

`app/player/[segId]/page.tsx` 应该长这样：

```tsx
import { Player } from "@/components/Player";
import { TeachingPanel } from "@/components/TeachingPanel";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { getLesson } from "@/lib/api";

export default async function PlayerPage({ params }) {
  const { segId } = params;
  // segId 形如 seg_003，先找到 lesson
  // 这里根据实际路由设计调整

  return (
    <div className="flex flex-col md:flex-row">
      <Player
        segment={seg}
        lesson={lesson}
        allSegments={lesson.segments}
        onNavigate={(id) => router.push(`/player/${id}`)}
        onMarkLearned={markLearned}
      />
      <TeachingPanel
        segment={seg}
        onRegenerate={() => regenerateTeaching(seg.id)}
      />
    </div>
  );
}
```

### Step 11 · 详情页添加 Confirm 入口

`app/lesson/[id]/page.tsx` 顶部加一个按钮：

```tsx
<Link
  href={`/lesson/${lesson.id}/confirm`}
  className={lesson.confirmed ? "btn-secondary" : "btn-primary animate-pulse"}
>
  {lesson.confirmed ? "重新调整切片" : "确认切片 · 待处理"}
</Link>
```

---

## 合并后快速验证

```bash
npm install
npm run dev
```

然后手动走：

- [ ] `/` 首页加载正常，显示 MOCK_LESSONS 列表
- [ ] `/lesson/antifragile_dp` 详情页，18 个切片卡片渲染
- [ ] 点任一卡片 → `/player/seg_003` 播放器功能齐全（变速/镜像/节拍计数/上下切片）
- [ ] 回详情页点「调整切片」→ `/lesson/antifragile_dp/confirm`
- [ ] 确认页时间轴显示，可拖拽边界
- [ ] 控制台无红色报错（TS 类型错误除外，类型错误要修掉）

---

## 附录 A · `lib/api.ts` 完整模板

```typescript
import type { Lesson, Op, RegenerateRequest } from "./types";
import { MOCK_LESSONS, MOCK_LESSON } from "./mock";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function getLessons(): Promise<Lesson[]> {
  if (USE_MOCK) return MOCK_LESSONS;
  return fetchJson("/api/lessons");
}

export async function getLesson(id: string): Promise<Lesson> {
  if (USE_MOCK) return MOCK_LESSON;
  return fetchJson(`/api/lessons/${id}`);
}

export async function patchSegments(lessonId: string, ops: Op[]): Promise<Lesson> {
  if (USE_MOCK) {
    console.log("[mock] patchSegments", lessonId, ops);
    return MOCK_LESSON;
  }
  return fetchJson(`/api/lessons/${lessonId}/segments`, {
    method: "PATCH",
    body: JSON.stringify({ ops }),
  });
}

export async function confirmLesson(lessonId: string): Promise<{ id: string; confirmed: boolean }> {
  if (USE_MOCK) return { id: lessonId, confirmed: true };
  return fetchJson(`/api/lessons/${lessonId}/confirm`, { method: "POST" });
}

export async function regenerateLesson(lessonId: string, config: RegenerateRequest): Promise<Lesson> {
  if (USE_MOCK) return MOCK_LESSON;
  return fetchJson(`/api/lessons/${lessonId}/regenerate`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function regenerateTeaching(segmentId: string): Promise<{ segment_id: string; status: string }> {
  if (USE_MOCK) return { segment_id: segmentId, status: "pending" };
  return fetchJson(`/api/segments/${segmentId}/teaching/regenerate`, { method: "POST" });
}

export async function importVideo(file: File): Promise<{ job_id: string; lesson_id: string }> {
  if (USE_MOCK) return { job_id: "mock", lesson_id: "mock" };
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/import`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
```

---

## 附录 B · 如果 M3 模块没包含某些文件

你的 M3 实现可能没完全按提示词生成。检查一下这些文件是否存在：

- `tsconfig.json` · `next.config.js` · `tailwind.config.ts` · `postcss.config.js`
- `app/layout.tsx` · `app/globals.css`

如果缺，从最新 Next.js 14 脚手架补：

```bash
npx create-next-app@14 _temp --typescript --tailwind --app --no-src-dir
cp _temp/tsconfig.json .
cp _temp/next.config.js .
cp _temp/tailwind.config.ts .
cp _temp/postcss.config.js .
cp _temp/app/globals.css app/globals.css
rm -rf _temp
```

---

## 附录 C · 冲突清单（最常见踩坑）

| 问题 | 处理 |
|---|---|
| M3 和 M5 的 `hooks/useLearningProgress.ts` 字段名不对 | 以 M5 为准，改 M3 调用点 |
| M3 和 M7 都有 `lib/api.ts` | 以附录 A 为准 |
| `lib/types.ts` 三份都有，互相冲突 | 直接用 CONTRACTS.md 里的代码覆盖 |
| M4 Player 想用自己的 BeatCounter，但 M3 TeachingPanel 也显示节拍 | 节拍计数只在 Player 内部做 |
| Tailwind class 不生效 | 检查 `tailwind.config.ts` 的 `content` 路径包含所有 `./components/**/*.tsx` 等 |
| `@/...` 路径 alias 找不到模块 | 检查 `tsconfig.json` 的 `paths` 配置有 `"@/*": ["./*"]` |
