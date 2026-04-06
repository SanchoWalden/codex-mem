PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS memory_cards (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('global', 'project', 'repo', 'task')),
    cwd TEXT,
    repo_root TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    facts_json TEXT NOT NULL DEFAULT '[]',
    decisions_json TEXT NOT NULL DEFAULT '[]',
    constraints_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    file_refs_json TEXT NOT NULL DEFAULT '[]',
    source_session TEXT,
    source_kind TEXT NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual', 'session_compaction', 'import')),
    confidence REAL NOT NULL DEFAULT 1.0,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_ingest_log (
    session_id TEXT PRIMARY KEY,
    cwd TEXT,
    ingested_at TEXT NOT NULL,
    result_json TEXT NOT NULL DEFAULT '{}'
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    id UNINDEXED,
    title,
    summary,
    facts,
    decisions,
    constraints,
    tags,
    tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS memory_cards_ai
AFTER INSERT ON memory_cards
BEGIN
    INSERT INTO memory_fts (
        id,
        title,
        summary,
        facts,
        decisions,
        constraints,
        tags
    )
    VALUES (
        NEW.id,
        NEW.title,
        NEW.summary,
        NEW.facts_json,
        NEW.decisions_json,
        NEW.constraints_json,
        NEW.tags_json
    );
END;

CREATE TRIGGER IF NOT EXISTS memory_cards_ad
AFTER DELETE ON memory_cards
BEGIN
    DELETE FROM memory_fts WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS memory_cards_au
AFTER UPDATE ON memory_cards
BEGIN
    DELETE FROM memory_fts WHERE id = OLD.id;
    INSERT INTO memory_fts (
        id,
        title,
        summary,
        facts,
        decisions,
        constraints,
        tags
    )
    VALUES (
        NEW.id,
        NEW.title,
        NEW.summary,
        NEW.facts_json,
        NEW.decisions_json,
        NEW.constraints_json,
        NEW.tags_json
    );
END;

CREATE INDEX IF NOT EXISTS idx_memory_cards_scope ON memory_cards(scope);
CREATE INDEX IF NOT EXISTS idx_memory_cards_cwd ON memory_cards(cwd);
CREATE INDEX IF NOT EXISTS idx_memory_cards_repo_root ON memory_cards(repo_root);
CREATE INDEX IF NOT EXISTS idx_memory_cards_updated_at ON memory_cards(updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_cards_archived ON memory_cards(is_archived);
