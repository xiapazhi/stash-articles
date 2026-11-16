"""Read-only TXT operations for Stash's raw plugin interface (standard library only)."""

import codecs
import json
import logging
import os
import stat
import sys
from contextlib import contextmanager
from pathlib import Path


# shortcut: whole-file reading is capped at 20 MiB; use chunked reading for larger books.
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_ARTICLES = 10000
ENCODINGS = {"auto", "utf-8", "utf-16", "gb18030", "big5"}
LOGGER = logging.getLogger("stash-articles")


class ReaderError(ValueError):
    """An error that can be displayed directly in the reading page."""


def validate_path(value):
    if not isinstance(value, str) or not value or "\0" in value:
        raise ReaderError("请选择有效的 TXT 文件。")
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ReaderError("只能读取文章目录内的相对路径。")
    if not value.lower().endswith(".txt"):
        raise ReaderError("只支持 TXT 文件。")
    return parts


@contextmanager
def open_directory(root_fd, parts):
    directory_fd = os.dup(root_fd)
    try:
        # Resolve each component through directory descriptors: a symlink swap
        # must not turn a validated relative path into access outside the root.
        for part in parts:
            next_fd = os.open(
                part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=directory_fd,
            )
            os.close(directory_fd)
            directory_fd = next_fd
        yield directory_fd
    finally:
        os.close(directory_fd)


def list_articles(root_fd):
    articles = []
    pending = [()]
    while pending:
        parts = pending.pop()
        with open_directory(root_fd, parts) as directory_fd:
            with os.scandir(directory_fd) as entries:
                for entry in entries:
                    if entry.is_symlink():
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        pending.append((*parts, entry.name))
                    elif entry.name.lower().endswith(".txt"):
                        info = entry.stat(follow_symlinks=False)
                        if stat.S_ISREG(info.st_mode):
                            articles.append({
                                "path": "/".join((*parts, entry.name)),
                                "size": info.st_size,
                            })
                            if len(articles) > MAX_ARTICLES:
                                raise ReaderError("TXT 文件超过 10000 个，请缩小文章根目录。")
    articles.sort(key=lambda article: article["path"].casefold())
    LOGGER.info("list complete: articles=%d", len(articles))
    return {"articles": articles}


def decode_text(data, requested):
    if requested not in ENCODINGS:
        raise ReaderError("不支持此编码，请从编码列表中选择。")
    if requested != "auto":
        candidates = [requested]
    elif data.startswith((codecs.BOM_UTF32_LE, codecs.BOM_UTF32_BE)):
        candidates = ["utf-32"]
    elif data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        candidates = ["utf-16"]
    else:
        # GBK/GB2312 are covered by GB18030. Big5 can be ambiguous, so the UI
        # also exposes a manual encoding selector instead of silently replacing text.
        candidates = ["utf-8-sig", "gb18030", "big5"]
    for encoding in candidates:
        try:
            text = data.decode(encoding)
        except UnicodeError:
            continue
        if "\0" in text:
            raise ReaderError("文件包含二进制数据，无法作为 TXT 阅读。")
        return text.lstrip("\ufeff"), encoding
    raise ReaderError("无法解码此文件，请手动选择正确的中文编码。")


def read_article(root_fd, relative_path, encoding):
    parts = validate_path(relative_path)
    with open_directory(root_fd, parts[:-1]) as directory_fd:
        file_fd = os.open(
            parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=directory_fd,
        )
        with os.fdopen(file_fd, "rb") as article:
            info = os.fstat(article.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise ReaderError("只能读取普通 TXT 文件。")
            if info.st_size > MAX_FILE_BYTES:
                raise ReaderError("文件超过 20 MiB，当前版本暂不支持。")
            data = article.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise ReaderError("文件超过 20 MiB，当前版本暂不支持。")
    content, detected = decode_text(data, encoding)
    LOGGER.info("read complete: bytes=%d encoding=%s", len(data), detected)
    return {"path": relative_path, "content": content, "encoding": detected}


def handle_request(request, root):
    if not isinstance(request, dict) or not isinstance(request.get("args"), dict):
        raise ReaderError("插件请求格式不正确。")
    args = request["args"]
    operation = args.get("operation")
    if operation not in ("list", "read"):
        raise ReaderError("只允许列出文章和读取文章。")
    if not root.is_absolute():
        raise ReaderError("reader.json 的 root 必须是容器内绝对路径。")
    LOGGER.info("%s start", operation)
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        if operation == "list":
            result = list_articles(root_fd)
        else:
            result = read_article(root_fd, args.get("path"), args.get("encoding", "auto"))
        return {"root": str(root), **result}
    finally:
        os.close(root_fd)
        LOGGER.info("%s end", operation)


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    LOGGER.info("request start")
    try:
        settings = json.loads(Path(__file__).with_name("reader.json").read_text(encoding="utf-8"))
        if not isinstance(settings, dict):
            raise ReaderError("reader.json 必须是包含 root 的 JSON 对象。")
        root_value = settings.get("root")
        if not isinstance(root_value, str) or not root_value:
            raise ReaderError("请在 reader.json 中设置文章根目录 root。")
        result = handle_request(json.load(sys.stdin), Path(root_value))
        output = {"output": result}
    except (ReaderError, OSError, ValueError, TypeError) as error:
        LOGGER.error("request failed: %s: %s", type(error).__name__, error)
        if isinstance(error, ReaderError):
            message = str(error)
        elif isinstance(error, FileNotFoundError):
            message = "目录或文件不存在，请确认 reader.json 的 root 和容器挂载。"
        elif isinstance(error, PermissionError):
            message = "没有读取权限，请检查目录和文件权限。"
        elif isinstance(error, OSError):
            message = "读取失败：目录不可访问、文件已变更，或路径包含符号链接。"
        else:
            message = "插件请求或 reader.json 格式不正确。"
        output = {"error": message}
    except Exception:
        LOGGER.exception("unexpected reader failure")
        output = {"error": "文章读取发生异常，请查看 Stash 插件日志。"}
    LOGGER.info("request end")
    json.dump(output, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
