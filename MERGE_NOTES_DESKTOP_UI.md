# DancePulse Desktop 本地改动合并对照

> 生成日期：2026-07-22  
> 目的：当前工作区**不是**从 GitHub 主项目拉分支做的改动，合并前用本文件做对照与回退清单。  
> 建议合并策略：先在主项目 `git pull` → 新建分支 `feature/desktop-arena-community` → 按下方文件清单逐文件合入 / cherry-pick 式复制 → 再测。  
> **持续更新**：每次本机 UI 改动追加到「1.x / 附录变更日志」，勿另起文档。

### 附录：变更日志（持续追加）

| 时间 | 摘要 |
|------|------|
| 2026-07-22 下午 | 社区四栏、首页文案、空心箭头光标、导航炫酷化 |
| 2026-07-22 14:17 | 光标延迟修复：去 React 跟手 setState + 去 transform transition |
| 2026-07-22 14:21 | 竞技场拆社团/个人对战；抖音风展示名；导航 LIVE 动态化 |
| 2026-07-22 14:30 | **回退**社团/个人对战拆分；中文字体改为站酷小薇 + Noto Serif/Sans（去掉雅黑优先） |
| 2026-07-22 14:37 | 非主页字体回退 Black Han Sans；主页斜向滚动横幅也回退；主页大标题仍可用站酷小薇 |
| 2026-07-22 14:43 | 顶栏「首页/课程/社区/我的」改为 Black Han Sans 斜切 + 激活态渐变字 |
| 2026-07-22 14:44 | 个人页：编辑背景/头像/昵称；Premium 交互页 `/premium`；勋章多图标 |
| 2026-07-22 14:49 | 顶栏导航改白色加粗；主页 DANCEPULSE 回退 Black Han Sans |
| 2026-07-22 14:50 | 跟练结束 → 猜你喜欢；社区封面轮换分段缩略图；媒体存储说明 |
| 2026-07-22 14:58 | 修复背景更换（去重封面+渐变+上传）；昵称变细；勋章仅图标可点开 |
| 2026-07-22 15:40 | Demo 媒体极简方案：gitignore + `GET /api/demo-media` 扫描目录；社区/猜你喜欢/个人封面自动轮换；无 manifest |
| 2026-07-22 15:51 | 去掉前端「算法说明 / 演示模式」类文案；猜你喜欢去掉推荐原因角标 |
| 2026-07-22 15:59 | 主页大标题 `DANCEPULSE` → `DANCE PULSE` |
| 2026-07-22 16:01 | Demo 封面全站混入：后端按视频自动抽多帧；社区/关注/竞技场/个人页/详情/猜你喜欢统一 `useDemoCoverPool` |
| 2026-07-22 16:06 | 导航左上角 logo 替换为 `logo.html` 的 DP SVG（`DancePulseLogo` + Orbitron） |
| 2026-07-22 16:20 | 课程页 SEGMENTS 改为「相似推荐 / 详细解析」双 Tab；相似推荐含动作相似度、好友在学、舞种等标签 |
| 2026-07-22 16:24 | 个人页：背景/头像增加多层纹理渐变预设；勋章去掉圆形外框并放大图标 |
| 2026-07-22 16:34 | 社区作品详情：「查看详情」+「跟跳这支」并排；详情跳转真实课程页，失败提示「页面不存在」 |
| 2026-07-22 16:38 | 课程页 Tab 顺序：详细解析在前，相似推荐在后 |
| 2026-07-22 16:48 | 配置千问 VLM key；真实解析 `harry`/`qlx` 为 `harry_dp`/`qlx_dp` 课程（切片+教学）；showcase 接入新 demo |
| 2026-07-22 16:53 | 相似推荐：分数改为 1–5 星（相似度越高星越多）；标签文案多样化 |

---

## 0. 合并前建议操作（强烈建议）

```bash
# 在 GitHub 主项目仓库里
git checkout main
git pull origin main
git checkout -b feature/desktop-arena-community

# 把本工作区对应文件拷入主项目后
git add -A
git status
# 确认无误再 commit
```

若合并炸了：`git checkout main` 并删掉功能分支即可整段回退。

本工作区路径（当前实现所在）：

`D:\DANCEPULSE\dance-pulse-tiktok-main\dance-pulse-tiktok-main\desktop\frontend\`

---

## 1. 本轮用户点名改动（2026-07-22 下午）

### 1.1 社区四栏：热门 / 推荐 / 关注 / 竞技场

| 文件 | 改动 |
|------|------|
| `lib/communityShowcase.ts` | `CommunityHubTab` → `hot \| recommend \| following \| arena`；`PlazaFilter` 增加 recommend/following；新增 `FOLLOWING_USERNAMES`；`getShowcaseFeedSorted` 支持推荐/关注排序 |
| `components/community/CommunityHubTabs.tsx` | 四 Tab UI |
| `components/community/FollowingFeed.tsx` | **新建** 关注页（好友动态 + 关注作品流） |
| `app/(tabs)/community/page.tsx` | 按四 Tab 渲染；旧 `plaza/board/pulse` URL 兼容映射 |

内容参考抖音/K歌：热门飙升条、推荐「为你推荐」、关注好友动态列表、竞技场 Hero+对决+榜单。

### 1.2 首页文案

| 文件 | 改动 |
|------|------|
| `app/(tabs)/page.tsx` | 大字 `不如跳舞` → `DANCEPULSE`；跑马灯 `不如跳舞 DP` → `跳舞吧！`；社区入口 `?tab=hot` |

### 1.3 非首页光标：空心箭头

| 文件 | 改动 |
|------|------|
| `components/effects/SceneCursor.tsx` | `simple` 变体改为空心箭头 SVG；描边青 `#00f3ff` / 悬停黄 `#ccff00` |

首页仍用 `hero` 双环光标（`(tabs)/layout.tsx`）。

### 1.3.1 光标延迟修复（2026-07-22 续）

问题：自定义光标拖尾严重。根因是 `mousemove` → React `setState` 每帧重渲染，外加 `transform` 的 CSS `transition`。

| 文件 | 改动 |
|------|------|
| `components/effects/SceneCursor.tsx` | 改为 ref + `requestAnimationFrame` 直写 `translate3d`；去掉位移 transition / drop-shadow；悬停只改 `currentColor` |
| `components/effects/AmbientScene.tsx` | 不再把 `mousePos` 放进 React state；粒子仍只读 `mouseRef` |

若仍感延迟：回退方案 = 关闭全站自定义光标（`AmbientScene` 不渲染 `SceneCursor`，或 `enabled=false`），恢复系统箭头。

### 1.4 导航品牌更炫

| 文件 | 改动 |
|------|------|
| `components/DesktopNavbar.tsx` | 斜切霓虹 `DP` icon；`DancePulse` 渐变描边字；导航「首页/课程/社区/我的」用 Black Han Sans 斜切字，激活态四色渐变；导入按钮黄底斜切 |
| `app/globals.css` | 补充 `@keyframes shine`（品牌字悬停扫光） |

### 1.5 竞技场双对战 + 抖音风昵称 + LIVE 动态（2026-07-22）

> **注意：社团/个人对战拆分已于同日回退。** 当前竞技场仍为：Hero → 本周对决 → 榜单。抖音风展示名与 LIVE 动态保留。

| 文件 | 改动 |
|------|------|
| `components/community/ScoreDuel.tsx` | 仍为「本周对决」（社团对战组件已删除） |
| `lib/communityShowcase.ts` | 展示名抖音化保留；`WEEKLY_CLUB_DUELS` / Club 类型已移除 |
| `components/DesktopNavbar.tsx` | LIVE 动态徽章保留 |
| `app/globals.css` | LIVE 动画保留 |

### 1.8 跟练后「猜你喜欢」+ 封面轮换（2026-07-22）

| 文件 | 改动 |
|------|------|
| `app/lesson/[id]/for-you/page.tsx` | **新建** 猜你喜欢推荐页 |
| `lib/communityShowcase.ts` | `getForYouRecommendations`（同曲→相似→热门→新人混排）；`previewThumbnail` 按分段缩略图轮换 |
| `app/lesson/[id]/tracking-desktop/page.tsx` | 跟练播完弹层，约 1.6s 后跳转 `/lesson/{id}/for-you` |

**Demo 媒体物理位置（勿放 frontend/public）：**
- 视频：`desktop/backend/data/videos/`
- 封面：`desktop/backend/data/thumbs/`
- 经 FastAPI 挂载为 `http://localhost:8000/videos|thumbs/...`，前端 `resolveMediaUrl` 拼接

### 1.9 Demo 媒体极简方案（2026-07-22 15:40）

目标：**丢文件即出现**，不维护 manifest JSON；大文件不进 git / 不进 frontend。

| 文件 | 改动 |
|------|------|
| `desktop/.gitignore` | 明确忽略 `backend/data/videos|thumbs|...` 及常见媒体后缀；保留各目录 `.gitkeep` |
| `desktop/backend/routes/demo_media.py` | **新建** `GET /api/demo-media` → `{ videos, thumbs }` 扫描目录 |
| `desktop/backend/main.py` | 挂载 `demo_media_router` |
| `desktop/frontend/lib/api.ts` | `getDemoMedia()` |
| `desktop/frontend/lib/demoMedia.ts` | **新建** 缓存 + `rotateFeedThumbs` |
| `desktop/frontend/lib/useCommunityFeed.ts` | 社区流封面按磁盘 thumbs 轮换 |
| `desktop/frontend/app/lesson/[id]/for-you/page.tsx` | 猜你喜欢封面同步轮换 |
| `desktop/frontend/components/profile/ProfileEditPanel.tsx` | 编辑封面时追加磁盘新 thumbs 为可选预设 |

**用法：** 把 `.mp4` 丢进 `data/videos/` → 访问 `/api/demo-media`（或刷新社区）会自动抽 4 帧到 `data/thumbs/{name}_f00.jpg`…；也可手丢 `.jpg` 进 `thumbs/`。前端各封面展示页按作品 id 从封面池打散混入。

**合并注意：** 不要把真实 mp4/大图拷进主仓；只合代码 + `.gitkeep`。

---

## 2. 同会话更早已落地、合并时也要带上的改动

### 2.1 假登录

- `components/auth/PhoneAuthCard.tsx` — 任意非空手机号+密码本地登录
- `lib/auth.ts` — `isDemoAuthToken`
- `lib/api.ts` — demo token 不因 401 清会话；`getMe`/`getMyBadges`/`migrate` 走本地
- `app/(tabs)/me/page.tsx` — 演示会话可展示

### 2.2 全站粒子背景 + 光标体系

- `components/effects/ParticleFieldBackground.tsx` **新建**
- `components/effects/AmbientScene.tsx` **新建**
- `components/effects/AmbientPageShell.tsx` **新建**
- `components/effects/SceneCursor.tsx`
- `app/(tabs)/layout.tsx` — 挂 AmbientScene
- `app/auth/layout.tsx`、`app/import/layout.tsx`、`app/u/layout.tsx` — 同氛围壳
- 首页去掉内联粒子/光标重复实现（`app/(tabs)/page.tsx`）

### 2.3 社区竞技场 / 内容

- `components/community/ArenaHero.tsx` **新建**
- `components/community/ScoreDuel.tsx` **新建**
- `components/community/CommunityFeedGrid.tsx` — 英雄位+不等高竞技卡
- `components/community/LeaderboardPanel.tsx` / `ActivityPulseFeed.tsx` — 赛场视觉
- `lib/communityShowcase.ts` — 假数据、对决、评论分层（50% 无聊 / 10% 精选）等
- `app/(tabs)/community/result/[id]/page.tsx` — 详情赛场风 + 抖音味评论区
- `lib/types.ts` — `CommunityComment.isFeatured`

### 2.4 个人主页（抖音/K歌结构）

- `components/profile/ProfileArenaPage.tsx` **新建**
- `app/u/[username]/page.tsx` — 用 ProfileArenaPage
- `app/(tabs)/me/page.tsx` — 对齐同一套；演示账号兜底 `buildDemoProfilePageModel`
- `lib/communityShowcase.ts` — 扩展 `ShowcaseProfileMeta`、`getProfilePageModel`、`buildDemoProfilePageModel`
- `app/layout.tsx` — Google 字体 Black Han Sans / Michroma

### 2.5 社区封面

- 作品封面继续用课程 `previewThumbnail`（`/thumbs/...`），非渐变艺术封面

---

## 3. 新增文件清单（合并时必加）

```
desktop/frontend/components/effects/ParticleFieldBackground.tsx
desktop/frontend/components/effects/AmbientScene.tsx
desktop/frontend/components/effects/AmbientPageShell.tsx
desktop/frontend/components/effects/SceneCursor.tsx
desktop/frontend/components/community/ArenaHero.tsx
desktop/frontend/components/community/ScoreDuel.tsx
desktop/frontend/components/community/FollowingFeed.tsx
desktop/frontend/components/profile/ProfileArenaPage.tsx
desktop/frontend/components/profile/ProfileEditPanel.tsx
desktop/frontend/lib/profileCustomization.ts
desktop/frontend/app/(tabs)/premium/page.tsx
desktop/frontend/app/lesson/[id]/for-you/page.tsx
desktop/frontend/app/auth/layout.tsx
desktop/frontend/app/import/layout.tsx
desktop/frontend/app/u/layout.tsx
```

（若主项目已有同名文件，以本工作区为准做 diff。）

---

## 4. 重点修改文件清单（合并时必 diff）

```
desktop/frontend/app/(tabs)/layout.tsx
desktop/frontend/app/(tabs)/page.tsx
desktop/frontend/app/(tabs)/community/page.tsx
desktop/frontend/app/(tabs)/community/result/[id]/page.tsx
desktop/frontend/app/(tabs)/me/page.tsx
desktop/frontend/app/u/[username]/page.tsx
desktop/frontend/app/layout.tsx
desktop/frontend/app/globals.css
desktop/frontend/components/DesktopNavbar.tsx
desktop/frontend/components/auth/PhoneAuthCard.tsx
desktop/frontend/components/community/CommunityHubTabs.tsx
desktop/frontend/components/community/CommunityFeedGrid.tsx
desktop/frontend/components/community/LeaderboardPanel.tsx
desktop/frontend/components/community/ActivityPulseFeed.tsx
desktop/frontend/components/community/ChallengeBanner.tsx
desktop/frontend/lib/communityShowcase.ts
desktop/frontend/lib/auth.ts
desktop/frontend/lib/api.ts
desktop/frontend/lib/demoMedia.ts
desktop/frontend/lib/types.ts
desktop/frontend/lib/useCommunityFeed.ts
desktop/frontend/lib/profileCustomization.ts
desktop/frontend/components/profile/ProfileEditPanel.tsx
desktop/frontend/app/lesson/[id]/for-you/page.tsx
desktop/frontend/app/(tabs)/premium/page.tsx
desktop/backend/routes/demo_media.py
desktop/backend/main.py
desktop/.gitignore
MERGE_NOTES_DESKTOP_UI.md
```

---

## 5. 路由 / 行为变化（合并后回归清单）

- [ ] `/me` 可编辑昵称/头像/背景；刷新后仍保留
- [ ] `/premium` 可开通/取消套餐，个人页权益文案同步
- [ ] 勋章为图标+名称卡片，非纯文字条
- [ ] `/community?tab=arena` 为 Hero + 本周对决 + 榜单（无社团/个人拆分）
- [ ] 非主页标题为 Black Han Sans；主页横幅也为 Black Han Sans
- [ ] 导航「社区」旁 LIVE 红点闪烁 / 徽章脉冲
- [ ] 作品/榜单展示名为抖音风（如「阿杰不写作业」），非「米拉 · 舞室教练」式生硬名
- [ ] `/` 大字为 DANCEPULSE；跑马灯含「跳舞吧！」
- [ ] `/community?tab=hot|recommend|following|arena` 四栏可用
- [ ] 旧链 `?tab=plaza` → 热门；`board` → 竞技场；`pulse` → 关注
- [ ] 非首页光标为空心箭头、跟手无明显延迟；首页仍为双环
- [ ] 导航左上角 DP + 渐变 DancePulse
- [ ] `/u/mira_flow` 个人页上中下分区
- [ ] `/me` 假登录后个人页可用
- [ ] `/auth/login` 任意字符串可登录
- [ ] `GET /api/demo-media` 返回本机 `videos`/`thumbs` 列表
- [ ] 往 `backend/data/thumbs/` 丢新图后刷新社区，封面会轮换到新图
- [ ] 大媒体文件未出现在 git status（应被 gitignore）

---

## 6. 明确不要误合并的内容

- `node_modules/`、`.next*`、本地 env、密钥
- 仅本机路径/脚本若主项目结构不同需手工改端口（desktop `:3200`）

---

## 7. 回退策略

1. **功能分支合并前发现冲突**：在分支上解决；不行则 `git merge --abort`。
2. **已合并进 main**：`git revert <merge_commit>`（保留历史）或临时 `git reset --hard`（仅未 push 时）。
3. **本工作区备份**：合并前把整个 `desktop/frontend` 打 zip，文件名带日期。

---

*本文件仅作合并备忘，不参与运行时逻辑。*

---

## 8. community 分支全量同步（2026-07-22）

目标远程：`https://github.com/chenzihan0426-oss/dance-pulse-tiktok` 分支 `community`。

本轮策略变更（相对上文 §1.9 / §6）：

- 允许提交 `desktop/.env`（演示千问 key；仓库若为公开请知悉风险）
- 允许提交 `desktop/backend/data` 下演示媒体与 lesson JSON（harry_dp / qlx_dp 等）
- 根 `.gitignore` 与 `desktop/.gitignore` 已放宽对应规则

本地对照导出：`D:\DANCEPULSE\exports\dancepulse-full-sync-20260722\demo-media\`
