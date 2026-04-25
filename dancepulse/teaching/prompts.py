from __future__ import annotations

from typing import Any


TEACHING_PROMPT_TEMPLATE = """你是舞蹈教学助手。请根据这段舞蹈切片的关键帧，输出严格 JSON，不要输出任何解释、前后缀或 Markdown。

课程信息：
- 课程名：{title}
- 所属段落：{section_label}
- BPM：{bpm}
- 时长：{duration} 秒
- 难度：{difficulty}/5
- 本段总拍数：{beat_count} 拍

图片顺序已经按动作时间先后排列，覆盖这一段动作的关键变化。

请同时生成以下 4 个字段：
1. summary：一句话概括这段动作，不超过 20 字
2. steps：分拍讲解，beats 要覆盖完整的 {beat_count} 拍
3. tips：1-3 条练习提示，每条不超过 30 字
4. beat_cues：为这 {beat_count} 拍生成逐拍口令数组

beat_cues 要求：
- 长度必须严格等于 {beat_count}
- 每个元素只能是：
  - 2-6 个汉字的极短动作口令
  - 或 null
- 只在关键动作点输出口令
- 过渡拍、保持拍、静止拍必须输出 null，不要勉强凑词
- 允许纯动作词：推胯、下沉、转身、定点
- 允许带部位：右肩上、左脚点、腰发力
- 不要完整句子
- 不要标点符号
- 不要英文
- 不要“保持”“继续”“稳住”这类凑字词，遇到这种拍请直接输出 null

示例（8 拍）：
["起手", null, "推胯", null, "下沉", "抬头", null, "定点"]

请输出这个 JSON 结构：
{{
  "summary": "一句话概括",
  "steps": [
    {{"beats": "1-2", "content": "这两拍的动作描述"}},
    {{"beats": "3-4", "content": "这两拍的动作描述"}}
  ],
  "tips": ["提示 1", "提示 2"],
  "beat_cues": ["起手", null, "推胯", null, "下沉", "抬头", null, "定点"]
}}
"""


def build_teaching_prompt(segment: dict[str, Any], lesson_context: dict[str, Any]) -> str:
    return TEACHING_PROMPT_TEMPLATE.format(
        title=lesson_context.get("title", "未知课程"),
        beat_count=segment.get("beat_count", 8),
        section_label=segment.get("section_label", "未知段落"),
        bpm=lesson_context.get("bpm", "未知"),
        duration=segment.get("duration", 0),
        difficulty=segment.get("difficulty", 3),
    )
