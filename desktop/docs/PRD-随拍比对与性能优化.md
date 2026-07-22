# PRD:随拍挑战 —— 性能优化 + 用户vs老师比对 + 难点回写迭代

> 状态:草稿 v1,待评审
> 范围:DancePulse desktop(`frontend` Next.js/TS + `backend` FastAPI/SQLite + `pipeline` Python)
> 作者:基于一次全代码库审计(5 子系统)整理

> **实现进度(2026-07-22)**:阶段 0-4 已全部落地,类型检查 + 单测(7/7)通过。
> 实机首测发现并修复一个**镜像 bug**:自拍摄像头是镜像画面,评分前未把用户姿态翻转回老师手性,导致角度比对系统性偏低(首测 4 次均 31-47 分、全判难度 5)。
> 修复:`hooks/useSessionScoring.ts` 加 `mirrorKpts`(x 翻转 + 交换 BlazePose 左右关节索引),受 `userMirror` 控制。污染的旧数据已清除。

---

## 0. 一句话概述

在随拍挑战中,先解决主线程渲染导致的卡顿;再把**已经写好但从未接上**的姿态比对引擎接通,让挑战结束时能算出"用户 vs 老师"的逐动作/逐关节差距;把这些结果按可查询的粒度存进 SQLite,聚合成"难点",回写到舞蹈卡片,形成越练越懂用户的迭代闭环。

---

## 1. 背景与现状(评审前必读)

审计确认了三个与直觉不同的事实,PRD 的方案基于这些事实,不是基于"换语言/换框架":

1. **不是纯 JS 项目**:前端 JS/TS,后端 Python(FastAPI+SQLite),流水线 Python。卡顿与语言无关。
2. **随拍页面目前不跑任何姿态识别、不跑任何评分**。用户摄像头从未送进 MediaPipe;`scoring.ts` 里完整的比对引擎(角度+余弦+DTW+分级+逐关节权重)是**零调用的死代码**。
3. **比对功能事实上不存在**:唯一会持久化的"分数"是后端一个整帧像素灰度差(motion energy),说不出哪个动作/哪个关节错;每次练习只存"一段一个总分+一个 timingMs"塞进 JSON blob。

结论:**不做架构大改**。SQLite(WAL)体量够用;痛点是"缺表 + JSON blob 粒度太粗 + 参考姿态未归一化",全部可增量补齐。

---

## 2. 目标 / 非目标

### 目标
- G1:随拍挑战无明显卡顿(主观流畅,帧时间可测量改善)。
- G2:挑战结束能产出"用户 vs 老师"的**逐动作 + 逐关节 + 逐拍**差距。
- G3:差距按可查询粒度入库,聚合成"难点"(逐动作难度、最常出错关节)。
- G4:难点回写到卡片并在 UI 呈现(如"重点:右肘 第3-4拍"),复习优先推难点。
- G5:每练一次聚合就更新,卡片"越来越懂这个用户"。

### 非目标(本轮明确不做)
- 不重写后端语言、不换 Postgres、不换前端框架。
- 不为卡顿去做 SPA/框架迁移(病因不在语言)。
- 不保留像素能量评分当主力(改用姿态比对)。
- 不重写 `scoring.ts`(接线,不是重写)。
- 不默认存原始视频或满帧姿态(存降采样轨迹+聚合)。
- 不用 `measured_difficulty` 覆盖作者手填的 `difficulty`。

---

## 3. 阶段总览

| 阶段 | 主题 | 预估 | 依赖 | 可独立上线 |
|---|---|---|---|---|
| 0 | 正确性/修 bug | 几小时 | 无 | 是 |
| 1 | 性能优化 | 1-3 天 | 无(不碰数据) | 是 |
| 2 | 打开真实比对 | — | 阶段1(Worker) | 是 |
| 3 | 存储(新增表) | — | 阶段2产出数据 | 是 |
| 4 | 回写卡片+迭代 | — | 阶段3 | 是 |

每阶段独立可回退。像素能量评分(System A)在阶段2验证通过后再退役。

---

## 阶段 0 · 正确性 / 修 bug(几小时)

**问题**:`backend/services/tracking_scoring.py:83` 硬编码了 `clip_url.replace("/", "\\")`(Windows 风格路径分隔符),在 macOS/Linux 上会导致找不到老师视频片段。

**要做**:
- 用 `pathlib` / `os.sep` 替换硬编码的 `"\\"`,跨平台正确解析 clip 路径。
- 即使后续要退役像素能量评分(System A),也先修好当前路径,保证现有流程不崩。

**验收**:在 macOS 上跑一次挑战,后端能正确读到对应片段文件,不再报找不到文件。

---

## 阶段 1 · 性能优化(1-3 天,不碰数据结构)

**根因(按可避免的主线程开销排序,均已定位到代码)**:

1. **背景圆点动画未限帧**(`app/lesson/[id]/tracking-desktop/page.tsx:214-261`):每帧对整屏 28px 网格每个点算 `hypot/atan2/sin/cos` + 字符串 `fillStyle` + `arc/fill`,跳舞时仍在空转。**最大浪费。**
2. **mousemove → setState 重渲染整页**(`page.tsx:349-352`):其实只为两个自定义光标 div,且已有 `mouseRef`。
3. **骨架 overlay 热循环**(`AdaptiveSkeletonOverlay.tsx:314-378`):每帧 `getBoundingClientRect()`(强制 layout)、每帧新建两个数组(GC 压力)、`lighter` 合成 + `shadowBlur`。
4. **多个不协调的 RAF 循环 + 多个 video 解码器**共享单一主线程,无统一帧预算、无 Worker/OffscreenCanvas。
5. **MatteOverlay**(仅选 silhouette 时):Three.js 24fps 重像素着色器,且在 RAF 内写 `video.currentTime` 可能触发解码重定位。
6. **MediaPipe WASM+模型从 CDN 加载**(`mediapipeClient.ts:12-18`):首屏延迟 + 离线脆弱 —— 这正是你感觉"加载慢"的地方(一次性成本,非跳舞中卡顿)。

**要做(按性价比)**:

| 改动 | 为什么 | 工作量 | 影响 |
|---|---|---|---|
| 背景圆点:限帧~30fps + 预算网格 + 查表代替 trig + 批量绘制;更佳:跳舞时直接关闭 | 最大可避免主线程开销 | S | 高 |
| 去掉 mousemove 的 setState,改用 mouseRef + 单次 rAF 批量写 transform | 每次指针移动都重渲染整页 | S | 高 |
| `getBoundingClientRect` 移出 RAF(用 ResizeObserver 缓存)、复用预分配数组、去掉 shadowBlur/lighter | 消除每帧 layout thrash 与 GC | S | 中 |
| 统一所有每帧工作到单一 rAF 调度器 + 帧预算,仅激活的 overlay 运行 | 消除 5 个 RAF 循环互相抢占 | M | 中 |
| 把 MediaPipe 推理(阶段2启用后)与重 canvas 工作移入 Web Worker + OffscreenCanvas | 让比对功能不再引入卡顿 | M | 高 |
| MediaPipe WASM+lite 模型自托管,仅在 tracking 路由懒加载 | 降首屏延迟、去离线脆弱 | S | 中 |
| 不要重新启用 SilhouetteOverlay 的主线程 JS Sobel(`videoEdges.ts` ~13万次迭代/帧);如需 silhouette 只走 WebGL 着色器 | 避免埋雷 | S | 中 |

**验收**:随拍页面帧时间在优化前后对比明显下降;跳舞过程主观无卡顿。用浏览器预览 + 帧时间 trace 验证。

---

## 阶段 2 · 打开真实比对(你要的核心功能)

**关键认知**:比对引擎已存在(`scoring.ts`:`scoreFrameFused` = 0.65·角度 + 0.35·余弦、`scoreWithDTW` ±6帧≈200ms 对齐、`toGrade`、逐关节权重表)。**这一步主要是"接线",不是"从零写算法"。**

**浏览器侧(实时,放进 Web Worker)**:
1. 挑战中用 MediaPipe PoseLandmarker(VIDEO 模式、lite、自托管)对用户摄像头以 15-20fps 识别。放进 Worker + OffscreenCanvas,不碰易卡的 UI 线程。
2. 每帧归一化成统一 `NormalizedPose`(见 §可比对格式契约):髋中点为原点、除以躯干/肩宽、镜像校正(自拍摄像头交换左右关节)。老师姿态过**同一个**归一化器。
3. 用现有 DTW 窗口对齐(允许用户早/晚),替代当前"线性时长比例切片"的错误做法(`tracking_scoring.py:46-51`)。
4. 用现成 `scoreFrameFused` 逐帧打分,保留逐关节残差;按拍、按段聚合;`toGrade + SmoothedScore` 显示实时评级。

**挑战结束(浏览器 → 后端)**:
5. 构建紧凑 `SessionResult`:总分 + 每段 `{score, 逐关节平均误差, 逐拍分数组, 最差关节, 最差拍}`。可选保留降采样(10fps、量化)用户姿态轨迹供后续再分析 —— **默认不存原始视频**(隐私+体积)。POST 到新端点。

**验收**:跳完一段,能看到实时评级,并在后端收到含逐关节/逐拍粒度的 `SessionResult`;像素能量评分(System A)在此验证通过后退役。

---

## 阶段 3 · 存储(纯新增,无破坏性迁移)

**现状诊断**:① 没有存用户姿态的表/格式;② 逐动作数据是 JSON blob 不可 SQL 查询;③ 作者难度无机器测量对应字段;④ 老师参考有两套不兼容格式(`pose/` 紧凑无z vs `pose_full/` 带z)且未做身体中心归一化。

**新增表(用 SQLModel `create_all` 建,live schema 为准)**:

```
tracking_sessions(id, user_id, lesson_id, created_at, overall_score,
                  pose_source, frame_count, video_url NULL)
  -- 一次完整挑战一行

segment_attempts(id, session_id, user_id, lesson_id, segment_id,
                 score, timing_offset_ms,           -- DTW 真实偏移,非全局比例
                 joint_errors JSON,                 -- {"left_elbow":0.42,...}
                 beat_scores JSON,                  -- [88,91,55,...] 长度==beat_count
                 worst_joint, worst_beat, created_at)
  -- 一个(session×动作)一行 —— 现在缺的可查询粒度
  -- 复合索引 (lesson_id, segment_id)

segment_difficulty_agg(lesson_id, segment_id, scope,  -- scope: 'global' | 'user:<id>'
                       attempts, avg_score, score_variance,
                       measured_difficulty,           -- 1-5,由 avg/variance 推导
                       top_worst_joint, updated_at,
                       PRIMARY KEY(lesson_id, segment_id, scope))
  -- 滚动聚合 = "难点检测" + 卡片回写目标
```

**Segment 模型新增字段(与作者难度分开)**:
- `measured_difficulty: int|null` —— 来自 agg(scope='global'),**永不被 regenerate 平均覆盖**。
- `common_mistakes: [{joint|beat_range, label, frequency}]` —— 结构化易错点,替代把易错点塞进自由文本 `Teaching.tips` 的做法;若按拍索引,需在 `_sync_teaching_beat_cues` 加对应长度同步。

**写入时**:更新 `(lesson_id, segment_id)` 聚合(滚动平均分、次数、最常见最差关节)。**难点检测**在有索引的行上用 SQL/Python 完成,便宜且可查询。

**housekeeping(建议)**:时间戳改 `INTEGER epoch_ms` 支持范围查询;`lesson_id` 暂作软引用(lessons 仍在文件系统);过期的 `.sql` migration 与 `create_all` 二选一为准,别维护两套真相。

**验收**:能用一条 SQL 查出"某动作跨多次练习的平均分/measured_difficulty";旧 `tracking_results` 保留,新写入走新表。

---

## 阶段 4 · 回写卡片 + 迭代

**要做**:
- 卡片 UI 呈现 `measured_difficulty` 与 `common_mistakes`(如"重点:右肘 beat 3-4")。
- 复习流程优先推送难点动作(个人 scope,和/或跨用户 global scope)。
- 每次新练习更新聚合,卡片的测量难度与高亮易错点随之变化 —— 即"越练越懂用户"的迭代闭环。
- 作者难度保持不可变,`regenerate_lesson.py` 不能覆盖学习到的信号。

**前端契约注意**:`api.ts` 的 `normalizeSegment` 只处理已知 URL 字段,新增带媒体字段需显式处理;`MOCK_LESSON` 与类型定义要同步更新以保持类型有效。

**验收**:同一动作多次练习后,卡片显示的难度/易错点会随表现变化;难点动作在复习中被优先推。

---

## §可比对格式契约:`NormalizedPose`(阶段2/3 共用)

老师(pipeline)与用户(浏览器 Worker)必须输出**同一格式**才能直接比。共享一个归一化器(TS 一份、Python 一份,保持同步)。

**每帧**:
```json
{ "t": 0.30, "detected": true, "kp": [[x, y, vis], ...33] }
```

**坐标空间(今天数据失败的关键点)**:
- **原点**:平移使髋中点(landmark 23,24)= (0,0),去掉位置。
- **缩放**:除以躯干/肩宽单位,去掉远近/体型 —— 即 `scoring.ts:34` 的 `normalize()`,**老师侧当前没做,要补上**。
- **镜像**:自拍/前置摄像头,比较前交换左右关节对;两边统一到一种手性。
- **z**:丢弃。`pose_full` 有 z,`pose/` 没有,浏览器 lite 模型的图像深度不可靠 → 统一用 2D+可见度。(若将来要 3D,两侧同时切 worldLandmarks,不要混用。)
- **可见度**:保留 [0,1];`MIN_VIS=0.5` 以下不参与打分。
- **fps**:重采样到统一网格(老师 10fps 量化到 0.1s;用户 15-20fps)→ 比较器把用户重采样到老师网格再 DTW;未检测帧跳过/插值。
- **溯源**:每条轨迹打 `pose_source` + 模型版本,防止模型升级悄悄污染聚合。

**两套遗留老师格式迁移**:写一个 loader 读 `pose/`(紧凑)与 `pose_full/`(详细),丢 z,输出 `NormalizedPose`;回填或读时归一化,不要让前端分支处理格式。

---

## 4. 风险与开放问题

- **摄像头姿态识别的准确度**:lite 模型在快速 K-pop 动作/遮挡下可能丢关节;`MIN_VIS` 门控 + DTW 容错缓解,但需实测。
- **隐私**:是否存降采样用户姿态轨迹要产品确认;默认不存原始视频。
- **镜像与朝向**:用户背对/侧身跳时归一化是否仍稳健,需实测。
- **聚合冷启动**:单用户练习次数少时 `measured_difficulty` 噪声大,需最小样本阈值。
- **global vs 个人 scope** 如何在卡片上取舍展示,待产品定义。

## 5. 建议起步

阶段 0 + 1 风险最低、见效最快且不碰数据结构,建议先做;跑通后再进入阶段 2 的比对接线。

