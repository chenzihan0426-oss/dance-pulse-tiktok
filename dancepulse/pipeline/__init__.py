"""
舞拍 DancePulse · M1 算法 Pipeline。

对外只暴露两个函数:
    process_video(video_path, output_dir) -> dict
    re_export_clip(video_path, segment_id, start, end) -> (clip_url, thumb_url)
"""

from .run import process_video, re_export_clip

__all__ = ["process_video", "re_export_clip"]
