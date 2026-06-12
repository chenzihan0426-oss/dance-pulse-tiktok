from __future__ import annotations

import base64
import html
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import requests


class FetchError(Exception):
    """抖音或其它链接下载失败，供上层返回友好错误与 fallback 提示。"""


_URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
_TRAILING_PUNCTUATION = "\"'“”‘’，。！？!?、,;；）)]}>"
_NOISE_MARKERS = (
    "NotOpenSSLWarning",
    "urllib3 v2 only supports OpenSSL 1.1.1+",
    "warnings.warn(",
    "Deprecated Feature: Support for Python version 3.9 has been deprecated",
)
_COOKIE_RETRY_MARKERS = (
    "fresh cookies",
    "failed to parse json",
    "login required",
    "status code 403",
    "unable to extract webpage video data",
    "unable to extract sigi state",
    "verification",
    "precondition failed",
    "http error 412",
)
_BROWSER_VERIFY_MARKERS = (
    "fresh cookies",
    "failed to parse json",
    "verification",
    "captcha",
    "验证码中间页",
)
_DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0"
)
_PROXY_ENV_KEYS = (
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "all_proxy",
    "ALL_PROXY",
)
_MEDIA_URL_MARKERS = (
    "douyinvod.com",
    ".mp4",
    ".m3u8",
    "/video/tos/",
    "mime_type=video_mp4",
    "/aweme/v1/play/",
    "video_id=",
    "playwm",
)
_NON_MEDIA_SUFFIXES = (
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
    ".gif",
    ".woff",
    ".woff2",
    ".ttf",
    ".ico",
)
_NON_MEDIA_MARKERS = (
    "douyin_pc_client.mp4",
    "lf-douyin-pc-web.douyinstatic.com/obj/douyin-pc-web/uuu_",
)


@dataclass(frozen=True)
class CookieStrategy:
    label: str
    args: tuple[str, ...]


@dataclass(frozen=True)
class WindowsBrowserDebugConfig:
    browser_name: str
    profile_name: str
    executable: Path
    user_data_root: Path


# 支持的视频平台域名：抖音 / B站 / 快手 / 小红书
_SUPPORTED_HOSTS = (
    "douyin.com",
    "iesdouyin.com",
    "bilibili.com",
    "b23.tv",
    "kuaishou.com",
    "v.kuaishou.com",
    "chenzhongtech.com",
    "xiaohongshu.com",
    "xhslink.com",
)

# 各平台下载时使用的 Referer（yt-dlp 内置 extractor 通常也会自理，这里显式兜底）
_PLATFORM_REFERERS = {
    "douyin": "https://www.douyin.com/",
    "bilibili": "https://www.bilibili.com/",
    "kuaishou": "https://www.kuaishou.com/",
    "xiaohongshu": "https://www.xiaohongshu.com/",
}


def _is_supported_host(url: str) -> bool:
    return any(host in url for host in _SUPPORTED_HOSTS)


def _detect_platform(url: str | None) -> str:
    lowered = (url or "").lower()
    if "douyin.com" in lowered or "iesdouyin.com" in lowered:
        return "douyin"
    if "bilibili.com" in lowered or "b23.tv" in lowered:
        return "bilibili"
    if "kuaishou.com" in lowered or "chenzhongtech.com" in lowered:
        return "kuaishou"
    if "xiaohongshu.com" in lowered or "xhslink.com" in lowered:
        return "xiaohongshu"
    return "douyin"


def extract_video_url(text: str) -> str:
    raw = text.strip()
    if not raw:
        raise FetchError("链接为空")

    matches = _URL_PATTERN.findall(raw)
    if matches:
        for candidate in matches:
            normalized = _normalize_candidate(candidate)
            if _is_supported_host(normalized):
                return normalized

    normalized = _normalize_candidate(raw)
    if _is_supported_host(normalized):
        return normalized

    raise FetchError("未识别到支持的视频链接，请粘贴抖音 / B站 / 快手 / 小红书的分享文案或完整链接")


def normalize_video_url(text: str) -> str:
    url = extract_video_url(text)
    if not url:
        raise FetchError("链接为空")
    if not _is_supported_host(url):
        raise FetchError("当前仅支持抖音 / B站 / 快手 / 小红书链接，或使用本地上传")
    return url


# 向后兼容旧函数名（其它模块仍以 douyin 命名引用）
extract_douyin_url = extract_video_url
normalize_douyin_url = normalize_video_url


def _normalize_candidate(candidate: str) -> str:
    candidate = candidate.strip()
    candidate = candidate.rstrip(_TRAILING_PUNCTUATION)
    return candidate


def _clean_process_output(*parts: str) -> str:
    lines: list[str] = []
    for part in parts:
        if not part:
            continue
        for line in part.splitlines():
            text = line.strip()
            if not text:
                continue
            if any(marker in text for marker in _NOISE_MARKERS):
                continue
            lines.append(text)
    return "\n".join(lines).strip()


def _friendly_yt_dlp_error(
    stderr: str,
    stdout: str,
    *,
    cookie_help: str | None = None,
) -> str:
    combined = _clean_process_output(stderr, stdout)
    excerpt = combined[:500] if combined else ""
    lowered = combined.lower()

    if "precondition failed" in lowered or "http error 412" in lowered:
        message = (
            "下载失败：该视频平台触发了反爬限制（HTTP 412），是按 IP 限流的临时封禁，"
            "常持续几分钟到几小时，即使登录也可能被挡。建议：① 隔几分钟或换个网络再试；"
            "② 最稳妥是把视频下载到本地后用「本地上传」；③ 抖音链接导入相对更稳定。"
        )
    elif "fresh cookies" in lowered:
        message = (
            "下载失败：抖音当前返回需要 fresh cookies。"
            "系统会优先尝试浏览器 cookies，但当前没有拿到可用授权。"
        )
    elif "failed to parse json" in lowered:
        message = "下载失败：抖音详情页解析失败，通常是 cookies 不足、链接受限，或链接已失效。"
    elif "unsupported url" in lowered:
        message = "下载失败：当前链接无法被 yt-dlp 识别，请确认粘贴的是抖音分享链接。"
    else:
        message = f"下载失败: {excerpt or '未知错误'}"

    if excerpt and excerpt not in message:
        message = f"{message}\n原始错误摘录：{excerpt}"
    if cookie_help:
        message = f"{message}\n{cookie_help}"
    return message


def _yt_dlp_base_cmd() -> list[str]:
    exe = shutil.which("yt-dlp")
    if exe:
        return [exe]

    try:
        __import__("yt_dlp")
    except ImportError as exc:
        raise FetchError(
            "未安装 yt-dlp，无法下载抖音视频。请安装: pip install yt-dlp，或改用本地上传"
        ) from exc
    return [sys.executable, "-m", "yt_dlp"]


def _run_process(
    cmd: list[str],
    *,
    timeout: int,
) -> tuple[bool, str, str, str | None]:
    try:
        completed = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_subprocess_env(),
        )
        return True, completed.stdout or "", completed.stderr or "", None
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
        return False, stdout, stderr, f"超时（>{timeout}s）"
    except subprocess.CalledProcessError as exc:
        return False, exc.stdout or "", exc.stderr or "", None


def _should_retry_with_cookies(stderr: str, stdout: str) -> bool:
    combined = _clean_process_output(stderr, stdout).lower()
    return any(marker in combined for marker in _COOKIE_RETRY_MARKERS)


def _needs_browser_verification(stderr: str, stdout: str) -> bool:
    combined = _clean_process_output(stderr, stdout).lower()
    return any(marker in combined for marker in _BROWSER_VERIFY_MARKERS)


def _truthy_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    if _truthy_env("DOUYIN_DISABLE_PROXY", True):
        for key in _PROXY_ENV_KEYS:
            env.pop(key, None)
        env["NO_PROXY"] = "*"
    return env


def _yt_dlp_common_args(url: str | None = None) -> tuple[str, ...]:
    args: list[str] = []
    if _truthy_env("DOUYIN_DISABLE_PROXY", True):
        args.extend(["--proxy", ""])

    user_agent = os.environ.get("DOUYIN_USER_AGENT", "").strip() or _DEFAULT_USER_AGENT
    args.extend(["--add-header", f"User-Agent:{user_agent}"])

    # 按平台设置 Referer；url 为空时默认抖音（兼容旧调用）
    referer = _PLATFORM_REFERERS.get(_detect_platform(url))
    if referer:
        args.extend(["--add-header", f"Referer:{referer}"])
    return tuple(args)


def _autodetect_browser_specs() -> list[str]:
    home = Path.home()

    if sys.platform == "darwin":
        candidates = [
            ("edge:Default", home / "Library/Application Support/Microsoft Edge/Default/Cookies"),
            ("chrome:Default", home / "Library/Application Support/Google/Chrome/Default/Cookies"),
            ("firefox", home / "Library/Application Support/Firefox/Profiles"),
            ("safari", home / "Library/Cookies/Cookies.binarycookies"),
        ]
    elif sys.platform.startswith("linux"):
        candidates = [
            ("edge:Default", home / ".config/microsoft-edge/Default/Cookies"),
            ("chrome:Default", home / ".config/google-chrome/Default/Cookies"),
            ("firefox", home / ".mozilla/firefox"),
        ]
    else:
        candidates = []

    specs: list[str] = []
    for spec, path in candidates:
        if path.exists():
            specs.append(spec)
    return specs


def _cookie_strategies(
    explicit_cookies_file: Path | None = None,
) -> tuple[list[CookieStrategy], list[str]]:
    strategies: list[CookieStrategy] = []
    notes: list[str] = []
    seen: set[str] = set()

    def add_strategy(label: str, args: tuple[str, ...], dedupe_key: str) -> None:
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        strategies.append(CookieStrategy(label=label, args=args))

    if explicit_cookies_file is not None:
        if explicit_cookies_file.exists():
            add_strategy(
                label=f"上传的 cookies 文件 {explicit_cookies_file.name}",
                args=("--cookies", str(explicit_cookies_file)),
                dedupe_key=f"file:{explicit_cookies_file}",
            )
        else:
            notes.append(f"上传的 cookies 文件不存在：{explicit_cookies_file}")
    else:
        cookies_file_raw = os.environ.get("DOUYIN_COOKIES_FILE", "").strip()
        if cookies_file_raw:
            cookies_file = Path(cookies_file_raw).expanduser()
            if cookies_file.exists():
                add_strategy(
                    label=f"cookies 文件 {cookies_file.name}",
                    args=("--cookies", str(cookies_file)),
                    dedupe_key=f"file:{cookies_file}",
                )
            else:
                notes.append(f"已配置 DOUYIN_COOKIES_FILE，但文件不存在：{cookies_file}")

    browsers_raw = os.environ.get("DOUYIN_COOKIES_FROM_BROWSER", "").strip()
    if browsers_raw:
        browser_specs = [item.strip() for item in browsers_raw.split(",") if item.strip()]
    else:
        browser_specs = _autodetect_browser_specs()

    for spec in browser_specs:
        add_strategy(
            label=f"浏览器 cookies {spec}",
            args=("--cookies-from-browser", spec),
            dedupe_key=f"browser:{spec}",
        )

    return strategies, notes


def _patch_uploaded_cookies_file(cookies_file: Path | None) -> None:
    if cookies_file is None or not cookies_file.exists():
        return

    try:
        lines = cookies_file.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return

    has_www = False
    live_entry: list[str] | None = None

    for raw in lines:
        if not raw or raw.startswith("#"):
            continue
        parts = raw.split("\t")
        if len(parts) < 7:
            continue
        domain = parts[0].strip().lstrip(".")
        name = parts[5].strip()
        if name != "s_v_web_id":
            continue
        if domain == "www.douyin.com":
            has_www = True
            break
        if domain == "live.douyin.com":
            live_entry = parts

    if has_www or live_entry is None:
        return

    patched = lines[:]
    patched.append(
        "\t".join(
            [
                "www.douyin.com",
                "FALSE",
                live_entry[2],
                live_entry[3],
                live_entry[4],
                live_entry[5],
                live_entry[6],
            ]
        )
    )
    cookies_file.write_text("\n".join(patched) + "\n", encoding="utf-8")


def _probe_cookie_strategy(
    base_cmd: list[str],
    url: str,
    strategy: CookieStrategy,
) -> tuple[bool, str | None]:
    probe_cmd = [
        *base_cmd,
        *_yt_dlp_common_args(url),
        *strategy.args,
        "--skip-download",
        "--print",
        "id",
        "--no-playlist",
        url,
    ]
    ok, stdout, stderr, timeout_hint = _run_process(probe_cmd, timeout=25)
    if ok:
        return True, None

    excerpt = _clean_process_output(stderr, stdout)[:220]
    if not excerpt:
        excerpt = timeout_hint or "未知错误"
    return False, f"{strategy.label} 失败：{excerpt}"


def _cookie_help_text_legacy_unused(strategies: list[CookieStrategy], failures: list[str], notes: list[str]) -> str:
    lines: list[str] = []

    if strategies:
        labels = "、".join(strategy.label for strategy in strategies)
        lines.append(f"已自动尝试这些 cookies 来源：{labels}")
    else:
        lines.append("当前没有找到可自动尝试的 cookies 来源。")

    if notes:
        lines.extend(notes[:2])

    if failures:
        lines.append("自动尝试结果：")
        for item in failures[:3]:
            lines.append(f"- {item}")

    lines.append("建议先在本机 Edge 或 Chrome 登录抖音后再试一次。")
    lines.append(
        "如仍失败，可在根目录 .env 配置 "
        "DOUYIN_COOKIES_FROM_BROWSER=edge:Default 或 "
        "DOUYIN_COOKIES_FILE=/path/to/cookies.txt。"
    )
    lines.append(
        "如果浏览器里已经能正常打开视频，但依然导入失败，"
        "请在 Edge 菜单栏打开“视图 > 开发人员 > 允许 Apple 活动中的 JavaScript”，"
        "以便系统直接从当前浏览器页面提取视频地址。"
    )
    lines.append("如正在使用代理或 VPN，请先关闭后再试，避免抖音把浏览器 cookies 判定为异常。")
    lines.append("macOS 首次读取浏览器 cookies 时，系统可能会弹出权限或钥匙串授权提示；如果看到弹窗，请点“允许”或“始终允许”。")
    return "\n".join(lines)


def _cookie_help_text(strategies: list[CookieStrategy], failures: list[str], notes: list[str]) -> str:
    lines: list[str] = []

    if strategies:
        labels = "、".join(strategy.label for strategy in strategies)
        lines.append(f"已自动尝试这些 cookies 来源：{labels}")
    else:
        lines.append("当前没有找到可自动尝试的 cookies 来源。")

    if notes:
        lines.extend(notes[:2])

    if failures:
        lines.append("自动尝试结果：")
        for item in failures[:3]:
            lines.append(f"- {item}")

    lines.append("建议先在本机 Edge 或 Chrome 登录抖音后再试一次。")
    lines.append(
        "如仍失败，可在根目录 .env 配置 "
        "DOUYIN_COOKIES_FROM_BROWSER=edge:Default 或 "
        "DOUYIN_COOKIES_FILE=/path/to/cookies.txt。"
    )
    if sys.platform.startswith("win"):
        lines.append(
            "Windows 下如果浏览器 cookies 因 DPAPI 无法直接解密，系统会尝试启动可调试的 Edge/Chrome "
            "会话并直接从页面抓取视频地址；请保持浏览器窗口可见，并在弹出页面里完成验证。"
        )
    elif sys.platform == "darwin":
        lines.append(
            "如果浏览器里已经能正常打开视频，但依然导入失败，请在 Edge 菜单栏打开“视图 > 开发人员 > "
            "允许 Apple 活动中的 JavaScript”，以便系统直接从当前浏览器页面提取视频地址。"
        )
        lines.append(
            "macOS 首次读取浏览器 cookies 时，系统可能会弹出权限或钥匙串授权提示；"
            "如果看到弹窗，请点“允许”或“始终允许”。"
        )
    lines.append("如正在使用代理或 VPN，请先关闭后再试，避免抖音把浏览器 cookies 判定为异常。")
    return "\n".join(lines)


def _download_cmd(
    base_cmd: list[str],
    out_path: Path,
    url: str,
    extra_args: tuple[str, ...] = (),
) -> list[str]:
    template = str(out_path.with_suffix("").absolute()) + ".%(ext)s"
    return [
        *base_cmd,
        *_yt_dlp_common_args(url),
        *extra_args,
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        template,
        "--write-info-json",
        "--no-playlist",
        url,
    ]


def _download_with_strategy(
    base_cmd: list[str],
    out_path: Path,
    url: str,
    strategy: CookieStrategy,
) -> tuple[bool, str]:
    retry_ok, retry_stdout, retry_stderr, retry_timeout = _run_process(
        _download_cmd(base_cmd, out_path, url, strategy.args),
        timeout=300,
    )
    if retry_ok:
        _finalize_download(out_path)
        return True, ""

    excerpt = _clean_process_output(retry_stderr, retry_stdout)[:220]
    if not excerpt:
        excerpt = retry_timeout or "未知错误"
    return False, f"{strategy.label} 下载失败：{excerpt}"


def _browser_verify_timeout() -> int:
    raw = os.environ.get("DOUYIN_BROWSER_VERIFY_TIMEOUT", "").strip()
    try:
        value = int(raw) if raw else 90
    except ValueError:
        value = 90
    return max(10, min(300, value))


def _browser_verify_interval() -> int:
    raw = os.environ.get("DOUYIN_BROWSER_VERIFY_INTERVAL", "").strip()
    try:
        value = int(raw) if raw else 5
    except ValueError:
        value = 5
    return max(3, min(15, value))


def _guess_verify_app(strategies: list[CookieStrategy]) -> str | None:
    explicit = os.environ.get("DOUYIN_VERIFY_APP", "").strip()
    if explicit:
        return explicit

    labels = " ".join(strategy.label.lower() for strategy in strategies)
    if "edge" in labels:
        return "Microsoft Edge"
    if "chrome" in labels:
        return "Google Chrome"
    if sys.platform == "darwin":
        return "Microsoft Edge"
    return None


def _open_url_in_browser(url: str, app_name: str | None) -> None:
    try:
        if sys.platform == "darwin":
            if app_name:
                subprocess.run(["open", "-a", app_name, url], check=False)
            else:
                subprocess.run(["open", url], check=False)
        elif sys.platform.startswith("linux"):
            subprocess.run(["xdg-open", url], check=False)
        elif sys.platform.startswith("win"):
            subprocess.run(["cmd", "/c", "start", "", url], check=False)
    except Exception:
        return


def _cookie_browser_spec(strategy: CookieStrategy) -> str | None:
    try:
        index = strategy.args.index("--cookies-from-browser")
    except ValueError:
        return None

    if index + 1 >= len(strategy.args):
        return None
    return strategy.args[index + 1].strip() or None


def _split_browser_spec(spec: str) -> tuple[str, str]:
    main = spec.split("::", 1)[0]
    browser_name, _, profile_name = main.partition(":")
    return browser_name.strip().lower(), profile_name.strip() or "Default"


def _windows_browser_user_data_root(browser_name: str) -> Path | None:
    local_appdata = Path(os.environ.get("LOCALAPPDATA", ""))
    if not local_appdata:
        return None
    if browser_name == "edge":
        return local_appdata / "Microsoft" / "Edge" / "User Data"
    if browser_name == "chrome":
        return local_appdata / "Google" / "Chrome" / "User Data"
    return None


def _windows_browser_executable(browser_name: str) -> Path | None:
    candidates: tuple[str, ...]
    if browser_name == "edge":
        candidates = (
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        )
    elif browser_name == "chrome":
        candidates = (
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        )
    else:
        return None

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return path
    return None


def _resolve_windows_browser_debug_config(
    strategies: list[CookieStrategy],
) -> WindowsBrowserDebugConfig | None:
    if not sys.platform.startswith("win"):
        return None

    for strategy in strategies:
        spec = _cookie_browser_spec(strategy)
        if not spec:
            continue

        browser_name, profile_name = _split_browser_spec(spec)
        executable = _windows_browser_executable(browser_name)
        user_data_root = _windows_browser_user_data_root(browser_name)
        if executable is None or user_data_root is None:
            continue
        if not user_data_root.exists():
            continue
        if not (user_data_root / profile_name).exists():
            continue

        return WindowsBrowserDebugConfig(
            browser_name=browser_name,
            profile_name=profile_name,
            executable=executable,
            user_data_root=user_data_root,
        )

    return None


def _copy_windows_browser_state(
    user_data_root: Path,
    profile_name: str,
    temp_root: Path,
) -> bool:
    copied_any = False
    rel_paths = (
        "Local State",
        f"{profile_name}/Preferences",
        f"{profile_name}/Secure Preferences",
        f"{profile_name}/Network/Cookies",
        f"{profile_name}/Network/Cookies-journal",
        f"{profile_name}/Local Storage",
        f"{profile_name}/Session Storage",
        f"{profile_name}/Shared Dictionary",
        f"{profile_name}/WebStorage",
    )

    for rel_path in rel_paths:
        src = user_data_root / rel_path
        dst = temp_root / rel_path
        if not src.exists():
            continue
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
            copied_any = True
        except OSError:
            continue

    return copied_any


def _allocate_local_debug_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_cdp_endpoint(port: int, timeout: int = 20) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(f"http://127.0.0.1:{port}/json/version", timeout=2)
            if response.ok:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


class _CdpSession:
    def __init__(self, websocket) -> None:
        self._websocket = websocket
        self._next_id = 1
        self._buffer: list[dict] = []

    def _recv_from_socket(self, timeout: float = 1.0) -> dict | None:
        try:
            raw = self._websocket.recv(timeout=timeout)
        except TimeoutError:
            return None
        if not raw:
            return None
        return json.loads(raw)

    def command(
        self,
        method: str,
        params: dict | None = None,
        *,
        timeout: float = 10,
    ) -> dict:
        command_id = self._next_id
        self._next_id += 1
        payload = {"id": command_id, "method": method}
        if params:
            payload["params"] = params
        self._websocket.send(json.dumps(payload))

        deadline = time.time() + timeout
        preserved: list[dict] = []

        while self._buffer:
            message = self._buffer.pop(0)
            if message.get("id") == command_id:
                self._buffer = preserved + self._buffer
                return message
            preserved.append(message)

        while time.time() < deadline:
            message = self._recv_from_socket(timeout=min(1.0, max(0.1, deadline - time.time())))
            if message is None:
                continue
            if message.get("id") == command_id:
                self._buffer = preserved + self._buffer
                return message
            preserved.append(message)

        self._buffer = preserved + self._buffer
        raise FetchError(f"浏览器调试命令超时：{method}")

    def recv_message(self, timeout: float = 1.0) -> dict | None:
        if self._buffer:
            return self._buffer.pop(0)
        return self._recv_from_socket(timeout=timeout)

    def evaluate(self, expression: str, *, timeout: float = 6.0) -> str:
        response = self.command(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": False,
            },
            timeout=timeout,
        )
        result = response.get("result", {})
        value = result.get("result", {}).get("value", "")
        return value if isinstance(value, str) else str(value or "")


def _wait_for_windows_page_target(port: int, timeout: int = 20) -> dict | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(f"http://127.0.0.1:{port}/json/list", timeout=3)
            targets = response.json()
        except Exception:
            time.sleep(0.5)
            continue

        for target in reversed(targets):
            if target.get("type") == "page" and target.get("webSocketDebuggerUrl"):
                return target
        time.sleep(0.5)

    return None


def _try_download_from_windows_browser_page(
    url: str,
    out_path: Path,
    strategies: list[CookieStrategy],
    *,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> tuple[bool, str | None]:
    config = _resolve_windows_browser_debug_config(strategies)
    if config is None:
        return False, None

    try:
        from websockets.sync.client import connect
    except ImportError:
        return False, "Windows 浏览器调试回退不可用：缺少 websockets 依赖。"

    timeout_seconds = _browser_verify_timeout()
    temp_root = Path(tempfile.mkdtemp(prefix=f"dp_{config.browser_name}_"))
    copied_state = _copy_windows_browser_state(
        config.user_data_root,
        config.profile_name,
        temp_root,
    )
    port = _allocate_local_debug_port()
    browser_process: subprocess.Popen | None = None
    last_error: str | None = None
    last_title = ""
    last_notice_bucket: int | None = None
    queued_candidates: list[str] = []
    seen_candidates: set[str] = set()

    try:
        browser_process = subprocess.Popen(
            [
                str(config.executable),
                f"--remote-debugging-port={port}",
                f"--user-data-dir={temp_root}",
                f"--profile-directory={config.profile_name}",
                "--new-window",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=_subprocess_env(),
        )

        if not _wait_for_cdp_endpoint(port):
            return False, "浏览器已打开，但调试连接未能建立。"

        target = _wait_for_windows_page_target(port)
        if target is None:
            return False, "浏览器已打开，但没有找到可调试的页面标签。"

        with connect(target["webSocketDebuggerUrl"], open_timeout=10, max_size=None) as websocket:
            session = _CdpSession(websocket)
            session.command("Page.enable")
            session.command("Network.enable")
            session.command("Runtime.enable")
            session.command("Page.bringToFront")
            session.command("Page.navigate", {"url": url})

            if progress_callback:
                state_hint = "并复制了当前浏览器登录态" if copied_state else "并进入了独立调试会话"
                progress_callback(
                    f"抖音触发浏览器验证，已启动可调试的 {config.executable.stem} 窗口，{state_hint}。"
                    "请在弹出的页面里完成验证，系统会直接从页面抓取真实视频地址。"
                )

            deadline = time.time() + timeout_seconds
            last_eval_at = 0.0
            while time.time() < deadline:
                remaining = max(0, int(deadline - time.time()))
                bucket = remaining // 15
                if progress_callback and bucket != last_notice_bucket:
                    last_notice_bucket = bucket
                    progress_callback(
                        f"正在等待浏览器验证通过。请在 {config.executable.stem} 中完成操作，"
                        f"系统还会继续自动抓取视频地址约 {remaining} 秒。"
                    )

                event = session.recv_message(timeout=1.0)
                if event and event.get("method") == "Network.requestWillBeSent":
                    candidate = _normalize_browser_candidate(
                        event.get("params", {}).get("request", {}).get("url", "")
                    )
                    if candidate and _is_media_url(candidate) and candidate not in seen_candidates:
                        seen_candidates.add(candidate)
                        queued_candidates.append(candidate)

                now = time.time()
                if now - last_eval_at >= 2.0:
                    try:
                        payload = session.evaluate(_browser_media_probe_script(), timeout=6.0)
                        for candidate in _browser_payload_lines(payload):
                            if candidate and _is_media_url(candidate) and candidate not in seen_candidates:
                                seen_candidates.add(candidate)
                                queued_candidates.append(candidate)
                        last_title = session.evaluate("document.title || ''", timeout=4.0).strip() or last_title
                        session.evaluate(
                            "Array.from(document.querySelectorAll('video')).forEach((video) => {"
                            "try { video.muted = true; const played = video.play();"
                            "if (played && typeof played.catch === 'function') { played.catch(() => {}); }"
                            "} catch (error) {}"
                            "}); ''",
                            timeout=4.0,
                        )
                    except Exception as exc:
                        last_error = str(exc)
                    last_eval_at = now

                while queued_candidates:
                    candidate = queued_candidates.pop(0)
                    try:
                        _download_direct_media_url(candidate, out_path)
                        return True, None
                    except Exception as exc:
                        last_error = str(exc)

        if not last_error:
            if last_title:
                last_error = f"浏览器页面已打开，但暂未抓到可下载的视频地址（页面标题：{last_title}）。"
            else:
                last_error = "浏览器页面已打开，但暂未抓到可下载的视频地址。"
        return False, last_error
    finally:
        if browser_process is not None:
            browser_process.terminate()
            try:
                browser_process.wait(timeout=5)
            except Exception:
                browser_process.kill()
        shutil.rmtree(temp_root, ignore_errors=True)


def _run_osascript(lines: list[str], timeout: int = 15) -> tuple[bool, str, str]:
    cmd = ["osascript"]
    for line in lines:
        cmd.extend(["-e", line])
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_subprocess_env(),
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
        message = stderr or stdout or f"osascript timed out after {timeout} seconds"
        return False, stdout, message
    return (
        completed.returncode == 0,
        (completed.stdout or "").strip(),
        (completed.stderr or "").strip(),
    )


def _video_match_token(url: str) -> str:
    matched = re.search(r"/video/(\d+)", url)
    if matched:
        return matched.group(1)
    session = requests.Session()
    session.trust_env = False
    try:
        response = session.get(
            url,
            allow_redirects=True,
            timeout=15,
            headers={
                "User-Agent": os.environ.get("DOUYIN_USER_AGENT", "").strip() or _DEFAULT_USER_AGENT,
                "Referer": "https://www.douyin.com/",
            },
        )
        redirected = re.search(r"/video/(\d+)", response.url)
        if redirected:
            return redirected.group(1)
    except Exception:
        pass
    return ""


def _apple_script_js_payload(js: str) -> str:
    encoded = base64.b64encode(js.encode("utf-8")).decode("ascii")
    return f"eval(atob('{encoded}'))"


def _browser_can_execute_javascript(app_name: str | None) -> bool:
    if sys.platform != "darwin" or not app_name:
        return False

    lines = [
        f'tell application "{app_name}"',
        "if (count of windows) = 0 then make new window",
        'tell active tab of front window to execute javascript "document.title"',
        "end tell",
    ]
    ok, _, _ = _run_osascript(lines, timeout=8)
    return ok


def _execute_browser_javascript(
    app_name: str | None,
    url: str,
    javascript: str,
) -> tuple[bool, str]:
    if sys.platform != "darwin" or not app_name:
        return False, "当前系统不支持浏览器脚本提取"

    match_token = _video_match_token(url)
    js_payload = _apple_script_js_payload(javascript)
    lines = [
        f'set targetUrl to "{url}"',
        f'set targetToken to "{match_token}"',
        f'set jsCode to "{js_payload}"',
        f'tell application "{app_name}"',
        "activate",
        "if (count of windows) = 0 then make new window",
        "set matchedTab to active tab of front window",
        "set shouldReuse to false",
        "try",
        'set currentUrl to URL of matchedTab',
        'if currentUrl does not contain "view-source:" then',
        'if targetToken is not "" then',
        'if currentUrl contains targetToken then',
        'set shouldReuse to true',
        'end if',
        'else',
        'if currentUrl is equal to targetUrl then',
        'set shouldReuse to true',
        'end if',
        'end if',
        "end if",
        "end try",
        "if shouldReuse is false then",
        "tell front window to set matchedTab to (make new tab at end of tabs with properties {URL:targetUrl})",
        "end if",
        "delay 1.2",
        "tell matchedTab to execute javascript jsCode",
        "end tell",
    ]
    ok, stdout, stderr = _run_osascript(lines, timeout=_browser_js_timeout())
    if ok:
        return True, stdout
    return False, stderr or "浏览器脚本执行失败"


def _browser_js_timeout() -> int:
    raw = os.environ.get("DOUYIN_BROWSER_JS_TIMEOUT", "").strip()
    if raw.isdigit():
        return max(20, int(raw))
    return 45


def _is_media_url(url: str) -> bool:
    lowered = url.lower()
    if not lowered.startswith("http"):
        return False
    if lowered.startswith("blob:"):
        return False
    if any(marker in lowered for marker in _NON_MEDIA_MARKERS):
        return False
    if any(lowered.endswith(suffix) for suffix in _NON_MEDIA_SUFFIXES):
        return False
    return any(marker in lowered for marker in _MEDIA_URL_MARKERS)


def _normalize_browser_candidate(candidate: str) -> str:
    normalized = candidate.strip()
    if not normalized:
        return ""

    normalized = html.unescape(normalized)
    normalized = normalized.replace("\\u002F", "/")
    normalized = normalized.replace("\\u0026", "&")
    normalized = normalized.replace("\\/", "/")
    normalized = normalized.rstrip(_TRAILING_PUNCTUATION)
    return normalized


def _browser_payload_lines(payload: str) -> list[str]:
    if not payload or payload == "missing value":
        return []

    results: list[str] = []
    seen: set[str] = set()
    for raw in payload.splitlines():
        normalized = _normalize_browser_candidate(raw)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        results.append(normalized)
    return results


def _browser_media_probe_script() -> str:
    return r"""
(() => {
  const patterns = [
    /douyinvod\.com/i,
    /\.mp4(?:\?|$)/i,
    /\.m3u8(?:\?|$)/i,
    /\/video\/tos\//i,
    /mime_type=video_mp4/i,
    /\/aweme\/v1\/play\//i,
    /video_id=/i,
    /playwm/i,
  ];
  const blocked = /\.(?:js|css|png|jpg|jpeg|webp|svg|gif|woff2?|ttf|ico)(?:[?#]|$)/i;
  const store = Array.isArray(window.__DP_MEDIA_URLS) ? window.__DP_MEDIA_URLS : [];
  const seenMap = window.__DP_MEDIA_SEEN || (window.__DP_MEDIA_SEEN = {});
  window.__DP_MEDIA_URLS = store;

  const remember = (value) => {
    if (!value || typeof value !== "string") {
      return;
    }
    const cleaned = value.trim().replace(/["'”’）)\]>.,;!?]+$/g, "");
    if (!cleaned || blocked.test(cleaned) || !patterns.some((pattern) => pattern.test(cleaned))) {
      return;
    }
    if (seenMap[cleaned]) {
      return;
    }
    seenMap[cleaned] = 1;
    store.push(cleaned);
    if (store.length > 80) {
      store.splice(0, store.length - 80);
    }
  };

  const maybePush = (value) => {
    if (value == null) {
      return;
    }
    const raw = String(value);
    const variants = [
      raw,
      raw
        .replace(/\\u002F/gi, "/")
        .replace(/\\u0026/gi, "&")
        .replace(/\\\//g, "/")
        .replace(/&amp;/gi, "&"),
    ];
    for (const variant of variants) {
      const matches = variant.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
      for (const match of matches) {
        remember(match);
      }
    }
  };

  if (!window.__DP_MEDIA_HOOKED) {
    window.__DP_MEDIA_HOOKED = true;

    if (typeof window.fetch === "function") {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        try {
          const input = args[0];
          const target = typeof input === "string" ? input : (input && input.url) || "";
          maybePush(target);
        } catch (error) {}
        return originalFetch(...args);
      };
    }

    if (typeof XMLHttpRequest !== "undefined") {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, target, ...rest) {
        try {
          maybePush(target);
        } catch (error) {}
        return originalOpen.call(this, method, target, ...rest);
      };
    }

    if (typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((list) => {
          try {
            for (const entry of list.getEntries()) {
              maybePush(entry && entry.name ? entry.name : "");
            }
          } catch (error) {}
        });
        observer.observe({ type: "resource", buffered: true });
      } catch (error) {}
    }
  }

  try {
    performance.getEntriesByType("resource").forEach((entry) => {
      maybePush(entry && entry.name ? entry.name : "");
    });
  } catch (error) {}

  const walkSeen = new WeakSet();
  const walk = (value, depth) => {
    if (!value || depth > 4) {
      return;
    }
    const valueType = typeof value;
    if (valueType === "string") {
      maybePush(value);
      return;
    }
    if (valueType !== "object" && valueType !== "function") {
      return;
    }
    if (walkSeen.has(value)) {
      return;
    }
    walkSeen.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach((item) => walk(item, depth + 1));
      return;
    }
    Object.keys(value).slice(0, 80).forEach((key) => {
      if (/cookie|token|password|secret/i.test(key)) {
        return;
      }
      try {
        maybePush(key);
        walk(value[key], depth + 1);
      } catch (error) {}
    });
  };

  [
    window.__NEXT_DATA__,
    window.__INITIAL_STATE__,
    window.__pace_f,
    window.SIGI_STATE,
    window.REHYDRATION_STATE,
    window.__APOLLO_STATE__,
    window.__STORE__,
    window.__NUXT__,
  ].forEach((root) => walk(root, 0));

  try {
    Object.keys(window)
      .filter((key) => /(state|data|detail|video|cache|feed|router|store|hydr|render|aweme|sigi|pace)/i.test(key))
      .slice(0, 60)
      .forEach((key) => {
        try {
          walk(window[key], 0);
        } catch (error) {}
      });
  } catch (error) {}

  try {
    maybePush(document.documentElement ? document.documentElement.outerHTML : "");
  } catch (error) {}

  try {
    Array.from(document.querySelectorAll("script"))
      .slice(-120)
      .forEach((node) => {
        maybePush(node.textContent || "");
      });
  } catch (error) {}

  try {
    Array.from(document.querySelectorAll("video, video source")).forEach((node) => {
      maybePush(node.currentSrc || "");
      maybePush(node.src || "");
      maybePush(node.getAttribute ? node.getAttribute("src") || "" : "");
    });
  } catch (error) {}

  try {
    const video = document.querySelector("video");
    if (video) {
      video.muted = true;
      const played = video.play();
      if (played && typeof played.catch === "function") {
        played.catch(() => {});
      }
      if (video.paused && typeof video.click === "function") {
        video.click();
      }
    }
  } catch (error) {}

  return store.slice(-60).join("\n");
})()
"""


def _browser_page_title(url: str, app_name: str | None) -> str:
    ok, payload = _execute_browser_javascript(app_name, url, 'document.title || ""')
    if not ok:
        return ""
    return payload.strip() if payload != "missing value" else ""


def _collect_browser_media_urls(
    url: str,
    app_name: str | None,
) -> tuple[list[str], str | None]:
    scripts = (
        _browser_media_probe_script(),
        (
            "Array.from(document.querySelectorAll('video')).forEach((video) => {"
            "try { video.muted = true; const played = video.play();"
            "if (played && typeof played.catch === 'function') { played.catch(() => {}); }"
            "} catch (error) {}"
            "}); document.title || ''"
        ),
        (
            "Array.from(document.querySelectorAll('video'))"
            ".map((video) => video.currentSrc || video.src || '')"
            ".filter(Boolean)"
            ".join('\\n')"
        ),
        (
            "Array.from(document.querySelectorAll('video source'))"
            ".map((source) => source.src || '')"
            ".filter(Boolean)"
            ".join('\\n')"
        ),
        (
            "performance.getEntriesByType('resource')"
            ".map((entry) => entry && entry.name ? entry.name : '')"
            ".filter(Boolean)"
            ".filter((name) => /douyinvod|mp4|m3u8|video\\\\/tos|aweme\\\\/v1\\\\/play|video_id=|playwm/i.test(name))"
            ".slice(-40)"
            ".join('\\n')"
        ),
        "Array.isArray(window.__DP_MEDIA_URLS) ? window.__DP_MEDIA_URLS.slice(-60).join('\\n') : ''",
    )

    urls: list[str] = []
    seen: set[str] = set()
    last_error: str | None = None

    for script in scripts:
        ok, payload = _execute_browser_javascript(app_name, url, script)
        if not ok:
            last_error = payload
            continue

        for candidate in _browser_payload_lines(payload):
            if not _is_media_url(candidate) or candidate in seen:
                continue
            seen.add(candidate)
            urls.append(candidate)

    return urls, last_error


def _download_direct_media_url(media_url: str, out_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        cmd = [
            ffmpeg,
            "-y",
            "-loglevel",
            "error",
            "-user_agent",
            os.environ.get("DOUYIN_USER_AGENT", "").strip() or _DEFAULT_USER_AGENT,
            "-headers",
            "Referer: https://www.douyin.com/\r\n",
            "-i",
            media_url,
            "-c",
            "copy",
            str(out_path),
        ]
        ok, stdout, stderr, timeout_hint = _run_process(cmd, timeout=300)
        if ok and out_path.exists() and out_path.stat().st_size > 1024:
            return
        excerpt = _clean_process_output(stderr, stdout)[:240]
        if timeout_hint:
            excerpt = timeout_hint
        if excerpt:
            raise FetchError(f"浏览器页面直链下载失败：{excerpt}")

    session = requests.Session()
    session.trust_env = False
    response = session.get(
        media_url,
        headers={
            "User-Agent": os.environ.get("DOUYIN_USER_AGENT", "").strip() or _DEFAULT_USER_AGENT,
            "Referer": "https://www.douyin.com/",
        },
        stream=True,
        timeout=60,
    )
    response.raise_for_status()
    with out_path.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1024 * 256):
            if chunk:
                handle.write(chunk)
    if not out_path.exists() or out_path.stat().st_size < 1024:
        raise FetchError("浏览器页面已提取到视频地址，但下载结果无效")


def _try_download_from_browser_page(
    url: str,
    out_path: Path,
    app_name: str | None,
) -> tuple[bool, str | None]:
    last_error = "浏览器页面视频地址下载失败"
    last_title = "未知"

    for _ in range(8):
        title = _browser_page_title(url, app_name)
        if title:
            last_title = title

        candidates, browser_error = _collect_browser_media_urls(url, app_name)
        if not candidates:
            if browser_error:
                last_error = browser_error
            else:
                last_error = (
                    f"浏览器页面已打开，但暂未发现可下载视频地址（标题：{last_title or '未知'}）"
                )
            time.sleep(2.0)
            continue

        for candidate in candidates:
            try:
                _download_direct_media_url(candidate, out_path)
                return True, None
            except Exception as exc:
                last_error = str(exc)

        if "直链下载失败" not in last_error:
            last_error = f"浏览器页面已打开，但暂未发现可下载视频地址（标题：{last_title or '未知'}）"
        time.sleep(2.0)

    return False, last_error


def _wait_for_browser_verification(
    base_cmd: list[str],
    out_path: Path,
    url: str,
    strategies: list[CookieStrategy],
    *,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> tuple[bool, list[str]]:
    browser_strategies = [
        strategy
        for strategy in strategies
        if "--cookies-from-browser" in strategy.args
    ]
    if not browser_strategies:
        return False, []

    app_name = _guess_verify_app(strategies)
    timeout_seconds = _browser_verify_timeout()
    interval_seconds = _browser_verify_interval()
    remaining_failures: list[str] = []
    last_notice_bucket: int | None = None
    js_available = _browser_can_execute_javascript(app_name)

    windows_browser_ok, windows_browser_message = _try_download_from_windows_browser_page(
        url,
        out_path,
        browser_strategies,
        progress_callback=progress_callback,
    )
    if windows_browser_ok:
        if progress_callback:
            progress_callback("已从可调试浏览器页面抓取到视频地址，正在继续导入流程。")
        return True, []
    if windows_browser_message:
        return False, [windows_browser_message]

    _open_url_in_browser(url, app_name)
    if progress_callback:
        if js_available:
            progress_callback(
                f"抖音触发浏览器验证，已在{app_name or '浏览器'}打开该链接。"
                f"完成验证后，系统会直接从当前浏览器页面提取视频地址并自动重试。"
            )
        else:
            progress_callback(
                f"抖音触发浏览器验证，已在{app_name or '浏览器'}打开该链接。"
                f"请完成验证，系统会在接下来的 {timeout_seconds} 秒内自动重试。"
            )

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        remaining = max(0, int(deadline - time.time()))
        bucket = remaining // 15
        if progress_callback and bucket != last_notice_bucket:
            last_notice_bucket = bucket
            progress_callback(
                f"正在等待浏览器验证通过。请在{app_name or '浏览器'}中完成验证码，"
                f"系统还会自动重试约 {remaining} 秒。"
            )

        remaining_failures = []
        if js_available:
            browser_ok, browser_message = _try_download_from_browser_page(
                url,
                out_path,
                app_name,
            )
            if browser_ok:
                if progress_callback:
                    progress_callback("已从当前浏览器页面提取到视频地址，正在继续导入流程。")
                return True, []
            if browser_message:
                remaining_failures.append(browser_message)
                time.sleep(interval_seconds)
                continue

        for strategy in browser_strategies:
            probe_ok, probe_message = _probe_cookie_strategy(base_cmd, url, strategy)
            if not probe_ok:
                if probe_message:
                    remaining_failures.append(probe_message)
                continue

            if progress_callback:
                progress_callback("检测到浏览器验证已完成，正在重新拉取抖音视频。")
            download_ok, failure_message = _download_with_strategy(
                base_cmd,
                out_path,
                url,
                strategy,
            )
            if download_ok:
                return True, []
            if failure_message:
                remaining_failures.append(failure_message)

        time.sleep(interval_seconds)

    return False, remaining_failures


def _finalize_download(out_path: Path) -> None:
    parent = out_path.parent
    base = out_path.stem
    candidates = sorted(
        parent.glob(f"{base}*.mp4"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise FetchError("下载完成但未找到 mp4 文件，请使用本地上传")

    final = candidates[0]
    if final != out_path:
        if out_path.exists():
            out_path.unlink()
        final.rename(out_path)


def _run_yt_dlp(
    url: str,
    out_path: Path,
    *,
    cookies_file: Path | None = None,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> None:
    base_cmd = _yt_dlp_base_cmd()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    ok, stdout, stderr, timeout_hint = _run_process(
        _download_cmd(base_cmd, out_path, url),
        timeout=300,
    )
    if ok:
        _finalize_download(out_path)
        return

    if timeout_hint:
        raise FetchError("下载超时，请重试或使用本地上传")

    if not _should_retry_with_cookies(stderr, stdout):
        raise FetchError(_friendly_yt_dlp_error(stderr, stdout))

    strategies, notes = _cookie_strategies(cookies_file)
    failures: list[str] = []

    for strategy in strategies:
        probe_ok, probe_message = _probe_cookie_strategy(base_cmd, url, strategy)
        if not probe_ok:
            if probe_message:
                failures.append(probe_message)
            continue

        retry_ok, failure_message = _download_with_strategy(base_cmd, out_path, url, strategy)
        if retry_ok:
            return

        failures.append(failure_message)

    if _needs_browser_verification(stderr, stdout) and _truthy_env(
        "DOUYIN_AUTO_BROWSER_VERIFY",
        True,
    ):
        verified, browser_failures = _wait_for_browser_verification(
            base_cmd,
            out_path,
            url,
            strategies,
            progress_callback=progress_callback,
        )
        if verified:
            return
        failures.extend(browser_failures)

    raise FetchError(
        _friendly_yt_dlp_error(
            stderr,
            stdout,
            cookie_help=_cookie_help_text(strategies, failures, notes),
        )
    )


def download_video_to_path(
    url: str,
    dest_mp4: Path,
    cookies_file: Path | None = None,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Path:
    """使用 yt-dlp 下载抖音视频到 dest_mp4（完整路径含 .mp4）。"""

    url = normalize_douyin_url(url)
    _patch_uploaded_cookies_file(cookies_file)
    _run_yt_dlp(
        url,
        dest_mp4,
        cookies_file=cookies_file,
        progress_callback=progress_callback,
    )
    if not dest_mp4.exists() or dest_mp4.stat().st_size < 1024:
        raise FetchError("视频文件无效，请使用本地上传")
    return dest_mp4


def read_download_metadata(dest_mp4: Path) -> dict[str, object]:
    info_path = dest_mp4.with_suffix(".info.json")
    if not info_path.exists():
        return {}
    try:
        return json.loads(info_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def slug_from_url(url: str) -> str:
    h = str(abs(hash(url)))
    return re.sub(r"[^a-zA-Z0-9_]", "", f"import_{h[:16]}")
