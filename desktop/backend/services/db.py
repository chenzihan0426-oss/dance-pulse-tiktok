"""SQLite/SQLModel 数据库引擎层。

默认使用 SQLite 单文件（data/app.db），零运维、随仓库走。
将来上线只需把环境变量 DATABASE_URL 指向 PostgreSQL（如
postgresql+psycopg://user:pass@host/db），其余代码无需改动。
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DB_PATH}"
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

# FastAPI 在多线程下处理请求，SQLite 连接需要关闭线程归属检查。
_connect_args = {"check_same_thread": False} if _IS_SQLITE else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)


if _IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")     # 允许并发读写
        cursor.execute("PRAGMA synchronous=NORMAL")   # 性能/安全的折中
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")    # 写锁等待 5s，缓解并发 database is locked
        cursor.close()


def init_db() -> None:
    """创建数据目录并建表（幂等，可重复调用）。应用启动时执行一次。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # 导入一次以确保所有 table 模型注册到 SQLModel.metadata
    from services import db_models  # noqa: F401

    SQLModel.metadata.create_all(engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    """事务性 session：正常退出时提交，异常时回滚。"""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
