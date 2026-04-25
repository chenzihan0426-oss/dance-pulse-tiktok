# Frontend Team Alignment

最后更新：2026-04-18

## 1. 这份前端包适合做什么

这份前端包用于：

- 和队友对齐当前前端结构
- 单独继续做 M3 视觉升级
- 在 mock 或真实后端下继续联调

## 2. 前端技术栈

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Vitest

## 3. 当前页面结构

```text
app/
├── page.tsx                       首页
├── import/page.tsx                导入页
├── lesson/[id]/page.tsx           课程详情页
├── lesson/[id]/confirm/page.tsx   切片确认页
└── player/[segId]/page.tsx        播放器页
```

## 4. 关键组件

```text
components/
├── LessonCard.tsx
├── SegmentCard.tsx
├── SegmentList.tsx
├── SegmentEditor.tsx
├── Timeline.tsx
├── Player.tsx
├── PlayerControls.tsx
├── ProgressFooter.tsx
├── TeachingPanel.tsx
└── RegenerateDialog.tsx
```

## 5. 数据来源

### mock 模式

```bash
cd frontend
NEXT_PUBLIC_USE_MOCK=true npm run dev
```

### 真实后端模式

`.env.local` 或根 `.env` 至少要有：

```bash
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

## 6. 当前前端侧已做的关键修复

- `frontend/lib/api.ts` 已关闭 fetch cache，避免页面一直拿旧 lesson
- 导入成功后会跳到：
  `/lesson/{lesson_id}/confirm?job={job_id}`
- 切片确认页会跟 `lesson_id + job` 一起刷新，不再把上一支视频的状态残留到新视频

## 7. 现在最需要队友知道的事实

### 7.1 lesson 资源必须看 lesson 专属文件

前端应以 API 返回的这些路径为准：

- `/videos/{lesson_id}.mp4`
- `/clips/{lesson_id}_{segment_id}.mp4`
- `/thumbs/{lesson_id}_{segment_id}.jpg`

不要依赖 `seg_000.mp4`、`seg_000.jpg` 这类临时文件。

### 7.2 视觉上还没有完全贴齐 M3

功能已基本串起来，但视觉还可以继续升级，特别是：

- 首页
- 课程页
- 播放器页

如果队友要继续做 UI，这三页优先级最高。

## 8. 推荐对齐方式

### 如果是做视觉

优先看：

- `app/page.tsx`
- `app/lesson/[id]/page.tsx`
- `app/player/[segId]/page.tsx`
- `app/globals.css`

### 如果是做交互

优先看：

- `components/Timeline.tsx`
- `components/SegmentEditor.tsx`
- `components/Player.tsx`
- `components/TeachingPanel.tsx`

### 如果是做联调

优先看：

- `lib/api.ts`
- `app/import/page.tsx`
- `app/lesson/[id]/confirm/page.tsx`

## 9. 联调时要注意的点

- 导入抖音链接后，确认页应该显示新 lesson 的新切片
- 如果后端 job 还在 `processing`，前端不要误判成失败
- 如果后端重启，旧 job 现在会被明确标成 `failed`

## 10. 本地运行命令

```bash
cd frontend
npm install
npm run dev
```

测试：

```bash
npm run test
```
