from __future__ import annotations

import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

VERSION = "1.0.0"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def digest(value):
    if not isinstance(value, bytes):
        value = str(value).encode()
    return hashlib.sha256(value).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = value if isinstance(value, bytes) else value.encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_json(path, value):
    atomic_write(path, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def canonical_url(url):
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
        raise ValueError("Expected an HTTP(S) URL without credentials")
    host = parts.hostname.lower().encode("idna").decode()
    if host in {"twitter.com", "www.twitter.com", "www.x.com"}:
        host = "x.com"
    if ":" in host:
        host = f"[{host}]"
    if parts.port and not (parts.scheme.lower() == "https" and parts.port == 443 or parts.scheme.lower() == "http" and parts.port == 80):
        host += f":{parts.port}"
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((parts.scheme.lower(), host, parts.path or "/", urlencode(query), ""))


class Library:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def init(self):
        for directory in ["inbox/events", "inbox/imports", "records/items", "records/entities", "records/relationships", "vault/Raw", "vault/Sources", "vault/Topics", "vault/Briefs", "vault/Personal", "vault/.obsidian", "derived", "state", "runs", "staging"]:
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS jobs (item_id TEXT PRIMARY KEY, stage TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL)")
        config = self.root / "vault/.obsidian/app.json"
        if not config.exists():
            write_json(config, {"alwaysUpdateLinks": True, "attachmentFolderPath": "Raw"})

    @contextlib.contextmanager
    def db(self):
        db = sqlite3.connect(self.root / "state/queue.sqlite")
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @contextlib.contextmanager
    def lock(self):
        self.init()
        with (self.root / "state/writer.lock").open("a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError("Another library writer is active; retry after it finishes")
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def path(self, relative):
        path = (self.root / relative).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Path escapes library")
        return path

    def item_path(self, item_id):
        if not item_id.startswith("item_") or not item_id[5:].isalnum():
            raise ValueError("Invalid item ID")
        return self.root / "records/items" / f"{item_id}.json"

    def items(self):
        return [read_json(p) for p in sorted((self.root / "records/items").glob("*.json"))]

    def item(self, item_id):
        return read_json(self.item_path(item_id))

    def save(self, item):
        from .validation import validate_item
        validate_item(self, item)
        write_json(self.item_path(item["id"]), item)

    def job(self, item_id, stage, error=None, attempted=False):
        with self.db() as db:
            db.execute("INSERT INTO jobs VALUES (?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET stage=excluded.stage, error=excluded.error, attempts=jobs.attempts+?, updated_at=excluded.updated_at", (item_id, stage, int(attempted), error, now(), int(attempted)))

    def config(self):
        path = self.root / "config.local.json"
        return read_json(path) if path.exists() else {}


def new_item(item_id, kind, url, event_id, saved_at):
    return {"schema_version": VERSION, "id": item_id, "kind": kind, "title": None,
            "original_url": url, "canonical_url": canonical_url(url) if url else None,
            "identifiers": {"doi": None, "arxiv": None, "x_post_id": None},
            "authors": [], "publisher": None, "published_at": None,
            "first_saved_at": saved_at, "capture_events": [event_id], "user_comment_refs": [event_id],
            "retrieval": {"status": "pending", "coverage": "none", "retrieved_at": None, "method": None, "http_status": None, "error": None},
            "content_versions": [],
            "analysis": {"status": "pending", "summary": None, "highlights": [], "claims": [], "limitations": [], "topic_ids": [], "entity_ids": [], "relationship_ids": [], "provenance": None},
            "reading": {"status": "unread", "priority": None}}
