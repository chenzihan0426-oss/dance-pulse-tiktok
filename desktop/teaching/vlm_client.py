"""
千问视觉 API 客户端封装。

设计要点：
- 接口抽象：BaseVLMClient，两种实现（QwenVLMClient / MockVLMClient）
- 重试：429 / 5xx / 网络超时做指数退避，最多 3 次
- 切换策略：
    * 环境变量 DP_VLM_MODE = "mock" | "real"
    * 未设置时：有 DASHSCOPE_API_KEY / QWEN_API_KEY 则用 real，否则自动 mock
- API endpoint / model 走常量或环境变量，不写死
"""

from __future__ import annotations

import json
import logging
import os
import random
import time
from abc import ABC, abstractmethod
from typing import List, Optional

import requests

logger = logging.getLogger(__name__)

# ---- 配置常量（可被环境变量覆盖） ---------------------------------------- #

# 阿里云百炼 OpenAI 兼容模式，北京地域 chat/completions 入口。
# 参考官方文档：
# https://help.aliyun.com/zh/model-studio/developer-reference/qwen-vl-compatible-with-openai
DEFAULT_DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
# 这里默认用兼容性更稳的视觉模型；如果你后面要切更强的新模型，只改环境变量即可。
DEFAULT_QWEN_MODEL = "qwen-vl-plus"

# 单次请求超时（秒）
DEFAULT_REQUEST_TIMEOUT = 30.0
# 重试次数上限
DEFAULT_MAX_RETRIES = 3
# 退避基数（秒）；实际延迟 = base * 2^attempt + jitter
DEFAULT_BACKOFF_BASE = 1.0


class VLMError(Exception):
    """VLM 调用失败的统一异常类型。"""


# --------------------------------------------------------------------------- #
# 客户端接口
# --------------------------------------------------------------------------- #


class BaseVLMClient(ABC):
    """VLM 客户端抽象接口。"""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        images_b64: List[str],
    ) -> str:
        """
        发请求到 VLM，返回模型输出的文本（未清洗）。

        Raises:
            VLMError: 经过重试后仍然失败
        """


# --------------------------------------------------------------------------- #
# 千问真实实现
# --------------------------------------------------------------------------- #


class QwenVLMClient(BaseVLMClient):
    """
    千问视觉 API 客户端。

    采用 OpenAI 兼容的 chat/completions 协议（阿里云百炼 DashScope）。
    请求体：
        {
          "model": "...",
          "messages": [
            {"role": "user", "content": [
              {"type": "text", "text": "..."},
              {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}},
              ...
            ]}
          ]
        }
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = DEFAULT_REQUEST_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_base: float = DEFAULT_BACKOFF_BASE,
    ):
        self.api_key = (
            api_key
            or os.environ.get("DASHSCOPE_API_KEY", "").strip()
            or os.environ.get("QWEN_API_KEY", "").strip()
        )
        if not self.api_key:
            raise VLMError("DASHSCOPE_API_KEY / QWEN_API_KEY not set")

        self.endpoint = (
            endpoint
            or os.environ.get("DASHSCOPE_API_URL", "").strip()
            or os.environ.get("QWEN_API_URL", "").strip()
            or os.environ.get("DASHSCOPE_ENDPOINT", "").strip()
            or DEFAULT_DASHSCOPE_ENDPOINT
        )
        self.model = (
            model
            or os.environ.get("QWEN_MODEL", "").strip()
            or os.environ.get("DASHSCOPE_MODEL", "").strip()
            or DEFAULT_QWEN_MODEL
        )
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.session = requests.Session()
        self.session.trust_env = _env_truthy("DASHSCOPE_TRUST_ENV") or _env_truthy("QWEN_TRUST_ENV")

    def generate(self, prompt: str, images_b64: List[str]) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        content: list = [{"type": "text", "text": prompt}]
        for b64 in images_b64:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            })

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.3,
        }

        return self._post_with_retry(headers, payload)

    def _post_with_retry(self, headers: dict, payload: dict) -> str:
        last_exc: Optional[Exception] = None

        for attempt in range(self.max_retries):
            try:
                resp = self.session.post(
                    self.endpoint,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                last_exc = exc
                self._sleep_backoff(attempt, reason=f"network error: {exc}")
                continue

            # 成功
            if 200 <= resp.status_code < 300:
                return self._extract_text(resp.json())

            # 重试类错误：429 / 5xx
            if resp.status_code == 429 or resp.status_code >= 500:
                last_exc = VLMError(
                    f"HTTP {resp.status_code}: {resp.text[:200]}"
                )
                self._sleep_backoff(attempt, reason=f"HTTP {resp.status_code}")
                continue

            # 不可重试错误（400 / 401 / 403 等）：立刻失败
            raise VLMError(
                f"non-retryable HTTP {resp.status_code}: {resp.text[:500]}"
            )

        raise VLMError(f"VLM call failed after {self.max_retries} retries: {last_exc}")

    def _sleep_backoff(self, attempt: int, reason: str) -> None:
        """指数退避 + 抖动。attempt 从 0 开始。"""
        if attempt >= self.max_retries - 1:
            return
        delay = self.backoff_base * (2 ** attempt) + random.uniform(0, 0.3)
        logger.warning(
            "VLM call failed (%s), retrying in %.2fs (attempt %d/%d)",
            reason, delay, attempt + 1, self.max_retries,
        )
        time.sleep(delay)

    @staticmethod
    def _extract_text(body: dict) -> str:
        """
        从 OpenAI 兼容响应中提取 message.content。
        千问兼容接口的响应结构与 OpenAI chat completions 基本一致。
        """
        try:
            return body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise VLMError(f"unexpected VLM response shape: {body}") from exc


# --------------------------------------------------------------------------- #
# Mock 客户端（没有 API key 时自动启用，用于本地开发与 CI）
# --------------------------------------------------------------------------- #


_MOCK_TEMPLATE_POOL = [
    {
        "summary": "副歌主打动作，两拍一个 count",
        "steps": [
            {"beats": "1-2", "content": "身体微下沉，重心转到左脚"},
            {"beats": "3-4", "content": "右手从腰部上举至头顶划圆"},
            {"beats": "5-6", "content": "左手下沉配合点胯"},
            {"beats": "7-8", "content": "回到起始位准备下一 count"},
        ],
        "tips": ["注意手臂弧度不要完全伸直", "重心下压配合音乐 drop"],
    },
    {
        "summary": "过渡步伐，重心左右切换",
        "steps": [
            {"beats": "1-2", "content": "左脚向左侧迈步，双手自然垂放"},
            {"beats": "3-4", "content": "右脚并步，膝盖微弯"},
            {"beats": "5-6", "content": "右脚向右迈步同时抬右手"},
            {"beats": "7-8", "content": "左脚并步回正，手臂放下"},
        ],
        "tips": ["步伐踩在重拍上", "不要耸肩"],
    },
    {
        "summary": "Pre 段放电动作，注意手指延展",
        "steps": [
            {"beats": "1-2", "content": "双手抱胸蓄力，重心下沉"},
            {"beats": "3-4", "content": "双手外展，手指尽量打开"},
            {"beats": "5-6", "content": "向右侧滑步"},
            {"beats": "7-8", "content": "停顿定点，眼神锁前方"},
        ],
        "tips": ["定点要干脆", "手指保持张力"],
    },
]


class MockVLMClient(BaseVLMClient):
    """
    不发真实请求，返回一个合法的 teaching JSON 字符串。
    用于本地开发和集成期把流程先跑通。
    """

    def __init__(self, simulate_latency: float = 0.1):
        self.simulate_latency = simulate_latency
        self._counter = 0

    def generate(self, prompt: str, images_b64: List[str]) -> str:
        if self.simulate_latency > 0:
            time.sleep(self.simulate_latency)
        payload = _MOCK_TEMPLATE_POOL[self._counter % len(_MOCK_TEMPLATE_POOL)]
        self._counter += 1
        return json.dumps(payload, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #


def build_default_client() -> BaseVLMClient:
    """
    根据环境变量选择客户端实现。

    规则：
    - DP_VLM_MODE=mock -> Mock
    - DP_VLM_MODE=real -> Qwen（必须要有 DASHSCOPE_API_KEY / QWEN_API_KEY）
    - 未设置 -> 有 DASHSCOPE_API_KEY / QWEN_API_KEY 用 Qwen，否则 Mock
    """
    mode = os.environ.get("DP_VLM_MODE", "").strip().lower()
    has_key = bool(
        os.environ.get("DASHSCOPE_API_KEY", "").strip()
        or os.environ.get("QWEN_API_KEY", "").strip()
    )

    if mode == "mock":
        logger.info("VLM client: mock (forced by DP_VLM_MODE)")
        return MockVLMClient()
    if mode == "real":
        logger.info("VLM client: qwen (forced by DP_VLM_MODE)")
        return QwenVLMClient()

    if has_key:
        logger.info("VLM client: qwen (auto, DASHSCOPE_API_KEY / QWEN_API_KEY present)")
        return QwenVLMClient()

    logger.info("VLM client: mock (auto, no DASHSCOPE_API_KEY / QWEN_API_KEY)")
    return MockVLMClient()


# 向后兼容：如果外部还有旧导入，不至于直接炸掉。
DoubaoVLMClient = QwenVLMClient


def _env_truthy(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}
