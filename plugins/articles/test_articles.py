import codecs
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PLUGIN_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("articles", PLUGIN_DIR / "articles.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class ArticleReaderTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.root = self.directory / "文章"
        self.root.mkdir()
        (self.root / "嵌套" / "第二层").mkdir(parents=True)
        self.text = "第一章 春天\n\n这是中文正文，标点与换行应当保留。\n"
        (self.root / "嵌套" / "第二层" / "测试.TXT").write_text(self.text, encoding="utf-8")

    def request(self, operation, **args):
        return reader.handle_request({"args": {"operation": operation, **args}}, self.root)

    def test_nested_list_only_includes_txt(self):
        (self.root / "忽略.mp4").write_bytes(b"video")
        (self.root / "忽略.txt.bak").write_bytes(b"backup")
        result = self.request("list")
        self.assertEqual(result["articles"], [{
            "path": "嵌套/第二层/测试.TXT", "size": len(self.text.encode("utf-8")),
        }])

    def test_read_utf8_nested_file(self):
        result = self.request("read", path="嵌套/第二层/测试.TXT")
        self.assertEqual(result["content"], self.text)

    def test_encoding_detection_and_manual_override(self):
        for encoding in ("utf-8-sig", "utf-16", "utf-32", "gb18030", "gbk", "gb2312"):
            with self.subTest(encoding=encoding):
                content, _ = reader.decode_text(self.text.encode(encoding), "auto")
                self.assertEqual(content, self.text)
        traditional = "繁體中文閱讀：這是測試。"
        content, encoding = reader.decode_text(traditional.encode("big5"), "big5")
        self.assertEqual(content, traditional)
        self.assertEqual(encoding, "big5")

    def test_endian_boms_and_empty_file(self):
        for bom, encoding in ((codecs.BOM_UTF16_BE, "utf-16-be"), (codecs.BOM_UTF32_BE, "utf-32-be")):
            self.assertEqual(reader.decode_text(bom + self.text.encode(encoding), "auto")[0], self.text)
        self.assertEqual(reader.decode_text(b"", "auto")[0], "")

    def test_invalid_encoding_and_binary_content_are_rejected(self):
        for data, encoding in ((b"\xff", "utf-8"), (b"abc\x00def", "auto"), (b"abc", "invalid")):
            with self.subTest(data=data, encoding=encoding):
                with self.assertRaises(reader.ReaderError):
                    reader.decode_text(data, encoding)

    def test_untrusted_paths_are_rejected(self):
        for path in ("../outside.txt", "/etc/passwd.txt", "嵌套/../../outside.txt", "./foo.txt", "a//b.txt", "", "x\0.txt", "file.pdf", None, 123):
            with self.subTest(path=path):
                with self.assertRaises(reader.ReaderError):
                    self.request("read", path=path)

    def test_symlink_files_and_directories_cannot_escape_root(self):
        outside = self.directory / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_text("secret", encoding="utf-8")
        (self.root / "linked.txt").symlink_to(outside / "secret.txt")
        (self.root / "linked-directory").symlink_to(outside, target_is_directory=True)
        (self.root / "cycle").symlink_to(self.root, target_is_directory=True)
        self.assertEqual(len(self.request("list")["articles"]), 1)
        for path in ("linked.txt", "linked-directory/secret.txt"):
            with self.subTest(path=path):
                with self.assertRaises(OSError):
                    self.request("read", path=path)

    def test_root_symlink_is_rejected(self):
        linked_root = self.directory / "linked-root"
        linked_root.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(OSError):
            reader.handle_request({"args": {"operation": "list"}}, linked_root)

    def test_special_file_cannot_block_reader(self):
        os.mkfifo(self.root / "pipe.txt")
        self.assertEqual(len(self.request("list")["articles"]), 1)
        with self.assertRaises(reader.ReaderError):
            self.request("read", path="pipe.txt")

    def test_large_file_and_list_limits_are_explicit(self):
        with patch.object(reader, "MAX_FILE_BYTES", 8):
            with self.assertRaises(reader.ReaderError):
                self.request("read", path="嵌套/第二层/测试.TXT")
        with patch.object(reader, "MAX_ARTICLES", 0):
            with self.assertRaises(reader.ReaderError):
                self.request("list")

    def test_unknown_operation_and_missing_files(self):
        for operation in ("write", "delete", "rename", None):
            with self.subTest(operation=operation):
                with self.assertRaises(reader.ReaderError):
                    self.request(operation)
        with self.assertRaises(FileNotFoundError):
            self.request("read", path="不存在.txt")

    def test_invalid_requests_and_relative_root(self):
        for request in (None, [], {}, {"args": []}):
            with self.assertRaises(reader.ReaderError):
                reader.handle_request(request, self.root)
        with self.assertRaises(reader.ReaderError):
            reader.handle_request({"args": {"operation": "list"}}, Path("relative"))

    def test_contents_and_modification_times_are_unchanged(self):
        def snapshot():
            return {str(path): (hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mtime_ns)
                    for path in self.root.rglob("*") if path.is_file()}
        before = snapshot()
        self.request("list")
        self.request("read", path="嵌套/第二层/测试.TXT")
        self.assertEqual(before, snapshot())

    def test_raw_protocol_error_is_json_without_article_content(self):
        result = subprocess.run(
            [sys.executable, str(PLUGIN_DIR / "articles.py")],
            input=json.dumps({"args": {"operation": "delete"}}),
            capture_output=True, text=True, check=True,
        )
        self.assertIn("error", json.loads(result.stdout))
        self.assertNotIn(self.text, result.stderr)


if __name__ == "__main__":
    unittest.main()
