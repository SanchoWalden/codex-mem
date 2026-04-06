#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "schema.sql"
TRIVIAL_MESSAGES = {"ok", "yes", "y", "sure", "\u53ef\u4ee5", "\u597d", "\u597d\u7684"}


def codex_home() -> Path:
    code_home = os.environ.get("CODEX_HOME")
    if code_home:
        return Path(code_home).expanduser()
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        return Path(user_profile) / ".codex"
    return Path.home() / ".codex"


def memory_dir() -> Path:
    return codex_home() / "memories"


def db_path() -> Path:
    return memory_dir() / "memory.db"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def ensure_db() -> sqlite3.Connection:
    mem_dir = memory_dir()
    mem_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def stable_json(values: list[str]) -> str:
    return json.dumps(values, ensure_ascii=False, separators=(",", ":"))


def make_memory_id(scope: str, title: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in title).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    slug = slug[:48] or "memory"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{scope}-{stamp}-{slug}"


def tokenize_query(query: str) -> list[str]:
    return [token for token in re.findall(r"[\w]+", query.lower()) if token]


def build_match_query(query: str) -> str:
    tokens = tokenize_query(query)
    if not tokens:
        return ""
    return " OR ".join(f'"{token}"' for token in tokens)


def compact_whitespace(text: str) -> str:
    return " ".join(text.split())


def short_text(text: str, limit: int = 240) -> str:
    text = compact_whitespace(text)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def strip_angle_blocks(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def clean_message(text: str) -> str:
    text = strip_angle_blocks(text)
    text = re.sub(r"`{1,3}.*?`{1,3}", " ", text)
    text = re.sub(r"\b(call_id|turn_id|jsonrpc|Content-Length)\b[:=]?\S*", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_noise_text(text: str) -> bool:
    if not text:
        return True
    lower = text.lower()
    noise_markers = [
        "filesystem sandboxing defines",
        "approval policy is currently",
        "## skills",
        "### available skills",
        "<permissions instructions>",
        "<skills_instructions>",
        "<environment_context>",
        "content-length:",
        "jsonrpc",
    ]
    if any(marker in lower for marker in noise_markers):
        return True
    if re.search(r"(?:[a-z]:[\\/]|[\\/][^ ]+[\\/])", text, flags=re.I) and re.search(r"\b\d{4}-\d{2}-\d{2}\b", text):
        return True
    if "powershell" in lower and ("asia/shanghai" in lower or "timezone" in lower or re.search(r"\b\d{4}-\d{2}-\d{2}\b", lower)):
        return True
    if len(lower) > 400 and ("available skills" in lower or "approved command prefixes" in lower):
        return True
    return False


def normalize_messages(messages: list[str]) -> list[str]:
    out: list[str] = []
    for text in messages:
        cleaned = clean_message(text)
        if is_noise_text(cleaned):
            continue
        if cleaned:
            out.append(cleaned)
    return out


def extract_message_text(content: Any) -> list[str]:
    out: list[str] = []
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                out.append(text.strip())
    return out


def extract_bullets(text: str, limit: int = 5) -> list[str]:
    text = clean_message(text)
    bullets: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(("-", "*")):
            candidate = line[1:].strip()
        else:
            match = re.match(r"^\d+\.\s+(.*)$", line)
            candidate = match.group(1).strip() if match else ""
        if candidate:
            bullets.append(short_text(candidate, 220))
        if len(bullets) >= limit:
            break
    return bullets


def infer_tags(cwd: str | None, texts: list[str]) -> list[str]:
    tags: set[str] = set()
    if cwd:
        for part in Path(cwd).parts[-3:]:
            norm = part.strip().lower()
            if norm and norm not in {":", "\\", "/"}:
                tags.add(norm)
    for text in texts:
        for token in tokenize_query(text):
            if len(token) >= 4 and token not in {"current_date", "timezone", "shell", "environment_context", "powershell"}:
                tags.add(token)
            if len(tags) >= 8:
                return sorted(tags)
    return sorted(tags)


def choose_primary_user_message(messages: list[str], session_id: str) -> str:
    for message in messages:
        lower = message.lower()
        if len(message) < 2:
            continue
        if lower in TRIVIAL_MESSAGES or len(message) <= 4:
            continue
        if is_noise_text(message):
            continue
        return message
    return f"Session {session_id}"


def extract_decisions(messages: list[str]) -> list[str]:
    candidates: list[str] = []
    for text in reversed(messages):
        cleaned = clean_message(text)
        if not cleaned or is_noise_text(cleaned) or len(cleaned) > 600:
            continue
        bullets = extract_bullets(cleaned, limit=4)
        for bullet in bullets:
            if bullet not in candidates:
                candidates.append(bullet)
        if candidates:
            break
    if candidates:
        return candidates[:4]
    for text in reversed(messages):
        cleaned = clean_message(text)
        if cleaned and not is_noise_text(cleaned) and len(cleaned) <= 280:
            return [short_text(cleaned, 220)]
    return []


def extract_task_state(user_messages: list[str]) -> list[str]:
    meaningful = [
        msg for msg in user_messages
        if not is_noise_text(msg) and msg.lower() not in TRIVIAL_MESSAGES and len(msg) > 4
    ]
    state: list[str] = []
    if meaningful:
        state.append(f"Primary user goal: {short_text(meaningful[0], 220)}")
    if len(meaningful) > 1:
        state.append(f"Latest user goal: {short_text(meaningful[-1], 220)}")
    return state[:3]


def find_session_file(session_id: str) -> Path | None:
    base = codex_home() / "sessions"
    if not base.exists():
        return None
    matches = sorted(base.rglob(f"*{session_id}*.jsonl"))
    return matches[-1] if matches else None


def insert_memory(args: argparse.Namespace) -> dict[str, Any]:
    conn = ensure_db()
    now = utc_now()
    existing = conn.execute(
        """
        SELECT id
        FROM memory_cards
        WHERE scope = ?
          AND title = ?
          AND COALESCE(cwd, '') = COALESCE(?, '')
        LIMIT 1
        """,
        (args.scope, args.title, args.cwd),
    ).fetchone()
    merged = existing is not None
    memory_id = existing["id"] if existing else make_memory_id(args.scope, args.title)
    payload = {
        "id": memory_id,
        "scope": args.scope,
        "cwd": args.cwd,
        "repo_root": args.repo_root,
        "title": args.title,
        "summary": args.summary,
        "facts_json": stable_json(args.fact),
        "decisions_json": stable_json(args.decision),
        "constraints_json": stable_json(args.constraint),
        "tags_json": stable_json(args.tag),
        "file_refs_json": stable_json(args.file_ref),
        "source_session": args.source_session,
        "source_kind": "manual",
        "created_at": now,
        "updated_at": now,
    }
    conn.execute(
        """
        INSERT INTO memory_cards (
            id, scope, cwd, repo_root, title, summary,
            facts_json, decisions_json, constraints_json, tags_json, file_refs_json,
            source_session, source_kind, created_at, updated_at
        ) VALUES (
            :id, :scope, :cwd, :repo_root, :title, :summary,
            :facts_json, :decisions_json, :constraints_json, :tags_json, :file_refs_json,
            :source_session, :source_kind, :created_at, :updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
            cwd = excluded.cwd,
            repo_root = excluded.repo_root,
            title = excluded.title,
            summary = excluded.summary,
            facts_json = excluded.facts_json,
            decisions_json = excluded.decisions_json,
            constraints_json = excluded.constraints_json,
            tags_json = excluded.tags_json,
            file_refs_json = excluded.file_refs_json,
            source_session = excluded.source_session,
            updated_at = excluded.updated_at
        """,
        payload,
    )
    conn.commit()
    return {"id": memory_id, "merged": merged, "db_path": str(db_path())}


def score_row(row: dict[str, Any], cwd: str | None, repo_root: str | None) -> float:
    score = float(row["fts_score"])
    if cwd and row["cwd"] and Path(row["cwd"]) == Path(cwd):
        score += 8.0
    elif cwd and row["cwd"] and str(cwd).startswith(str(row["cwd"])):
        score += 4.0
    if repo_root and row["repo_root"] and Path(row["repo_root"]) == Path(repo_root):
        score += 6.0
    score += {"repo": 4.0, "project": 3.0, "task": 2.0, "global": 1.0}.get(row["scope"], 0.0)
    tags = json.loads(row["tags_json"])
    query_terms = set((row["query_terms"] or "").split())
    score += len(query_terms.intersection(set(tags))) * 1.5
    return score


def recall_memories(args: argparse.Namespace) -> dict[str, Any]:
    conn = ensure_db()
    query = args.query.strip()
    match_query = build_match_query(query)
    params: list[Any] = []
    cte = ""
    if match_query:
        cte = """
        WITH matched AS (
            SELECT id, -bm25(memory_fts) AS fts_score
            FROM memory_fts
            WHERE memory_fts MATCH ?
        )
        """
        params.append(match_query)
    rows = conn.execute(
        f"""
        {cte}
        SELECT
            m.*,
            COALESCE(matched.fts_score, 0.05) AS fts_score
        FROM memory_cards AS m
        {"LEFT JOIN matched ON matched.id = m.id" if match_query else ""}
        WHERE m.is_archived = 0
          AND (? IS NULL OR m.scope = ?)
          AND (
              {"matched.id IS NOT NULL OR" if match_query else ""}
              m.title LIKE ?
              OR m.summary LIKE ?
              OR m.tags_json LIKE ?
          )
        """,
        (
            *params,
            args.scope,
            args.scope,
            f"%{query}%",
            f"%{query}%",
            f"%{query}%",
        ),
    ).fetchall()

    ranked: list[dict[str, Any]] = []
    query_terms = " ".join(query.lower().split())
    for row in rows:
        row_map = dict(row)
        row_map["query_terms"] = query_terms
        row_map["score"] = score_row(row_map, args.cwd, args.repo_root)
        ranked.append(row_map)
    ranked.sort(key=lambda item: item["score"], reverse=True)

    cards: list[dict[str, Any]] = []
    for item in ranked[: args.limit]:
        cards.append(
            {
                "id": item["id"],
                "scope": item["scope"],
                "title": item["title"],
                "summary": item["summary"],
                "facts": json.loads(item["facts_json"]),
                "decisions": json.loads(item["decisions_json"]),
                "constraints": json.loads(item["constraints_json"]),
                "tags": json.loads(item["tags_json"]),
                "score": round(item["score"], 3),
            }
        )

    summary = "\n".join(f"[{card['scope']}] {card['title']}: {card['summary']}" for card in cards)
    return {"count": len(cards), "cards": cards, "summary": summary}


def compact_session(args: argparse.Namespace) -> dict[str, Any]:
    session_path = find_session_file(args.session_id)
    if session_path is None:
        raise SystemExit(f"Session file not found for id: {args.session_id}")

    user_messages: list[str] = []
    assistant_messages: list[str] = []
    session_cwd = args.cwd

    with session_path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                data = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            if data.get("type") == "session_meta":
                payload = data.get("payload", {})
                meta_cwd = payload.get("cwd")
                if isinstance(meta_cwd, str) and meta_cwd.strip():
                    session_cwd = meta_cwd.strip()
                continue

            payload = data.get("payload", {})
            if data.get("type") == "response_item" and payload.get("type") == "message":
                role = payload.get("role")
                texts = extract_message_text(payload.get("content", []))
                if role == "user":
                    user_messages.extend(texts)
                elif role == "assistant":
                    assistant_messages.extend(texts)

    user_messages = normalize_messages(user_messages)
    assistant_messages = normalize_messages(assistant_messages)

    primary_user = choose_primary_user_message(user_messages, args.session_id)
    latest_user = user_messages[-1] if user_messages else primary_user
    latest_assistant = assistant_messages[-1] if assistant_messages else ""

    title = short_text(primary_user, 80) or f"Session summary {args.session_id}"
    summary = short_text(f"Session for {session_cwd or args.cwd} focused on {primary_user}", 180)
    facts = [
        f"User message count: {len(user_messages)}",
        f"Assistant message count: {len(assistant_messages)}",
        *extract_task_state(user_messages),
    ]
    decisions = extract_decisions(assistant_messages)
    constraints = [f"Compaction mode: {args.mode}"]
    tags = infer_tags(session_cwd, [primary_user, latest_user, latest_assistant])

    conn = ensure_db()
    now = utc_now()
    memory_id = f"session-{args.session_id}"
    conn.execute(
        """
        INSERT INTO memory_cards (
            id, scope, cwd, repo_root, title, summary,
            facts_json, decisions_json, constraints_json, tags_json, file_refs_json,
            source_session, source_kind, created_at, updated_at
        ) VALUES (
            :id, 'task', :cwd, :repo_root, :title, :summary,
            :facts_json, :decisions_json, :constraints_json, :tags_json, :file_refs_json,
            :source_session, 'session_compaction', :created_at, :updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
            cwd = excluded.cwd,
            repo_root = excluded.repo_root,
            title = excluded.title,
            summary = excluded.summary,
            facts_json = excluded.facts_json,
            decisions_json = excluded.decisions_json,
            constraints_json = excluded.constraints_json,
            tags_json = excluded.tags_json,
            file_refs_json = excluded.file_refs_json,
            updated_at = excluded.updated_at
        """,
        {
            "id": memory_id,
            "cwd": session_cwd or args.cwd,
            "repo_root": args.repo_root,
            "title": title,
            "summary": summary,
            "facts_json": stable_json(facts),
            "decisions_json": stable_json(decisions),
            "constraints_json": stable_json(constraints),
            "tags_json": stable_json(["session", "compaction", *tags][:10]),
            "file_refs_json": stable_json([str(session_path)]),
            "source_session": args.session_id,
            "created_at": now,
            "updated_at": now,
        },
    )
    conn.execute(
        """
        INSERT INTO session_ingest_log (session_id, cwd, ingested_at, result_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            cwd = excluded.cwd,
            ingested_at = excluded.ingested_at,
            result_json = excluded.result_json
        """,
        (
            args.session_id,
            session_cwd or args.cwd,
            now,
            json.dumps({"memory_id": memory_id, "session_file": str(session_path)}),
        ),
    )
    conn.commit()
    return {
        "created_memory_ids": [memory_id],
        "updated_memory_ids": [],
        "skipped_candidates": [],
        "session_file": str(session_path),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="codex-mem SQLite memory store")
    subparsers = parser.add_subparsers(dest="command", required=True)

    remember = subparsers.add_parser("remember")
    remember.add_argument("--title", required=True)
    remember.add_argument("--summary", required=True)
    remember.add_argument("--scope", required=True, choices=["global", "project", "repo", "task"])
    remember.add_argument("--cwd")
    remember.add_argument("--repo-root")
    remember.add_argument("--fact", action="append", default=[])
    remember.add_argument("--decision", action="append", default=[])
    remember.add_argument("--constraint", action="append", default=[])
    remember.add_argument("--tag", action="append", default=[])
    remember.add_argument("--file-ref", action="append", default=[])
    remember.add_argument("--source-session")

    recall = subparsers.add_parser("recall")
    recall.add_argument("--query", required=True)
    recall.add_argument("--cwd", required=True)
    recall.add_argument("--repo-root")
    recall.add_argument("--scope", choices=["global", "project", "repo", "task"])
    recall.add_argument("--limit", type=int, default=5)

    compact = subparsers.add_parser("compact-session")
    compact.add_argument("--session-id", required=True)
    compact.add_argument("--cwd", required=True)
    compact.add_argument("--repo-root")
    compact.add_argument("--mode", choices=["manual", "end_of_session"], default="manual")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "remember":
        result = insert_memory(args)
    elif args.command == "recall":
        result = recall_memories(args)
    elif args.command == "compact-session":
        result = compact_session(args)
    else:
        parser.error(f"Unsupported command: {args.command}")
        return 2

    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
