-- Draft Class Generator cache schema (better-sqlite3, WAL).
-- Layered cache: raw_scrape holds re-parseable source payloads so a failed
-- multi-page run resumes; players is the normalized cross-source merge;
-- draft_classes/generated_ratings memoize built classes per options hash.

CREATE TABLE IF NOT EXISTS raw_scrape (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,         -- 'pfr' | 'nflverse' | 'wikipedia' | 'wikipedia_afl' | 'pfa' | 'local'
  year        INTEGER NOT NULL,      -- draft year (0 for bulk/all-years payloads like nflverse)
  scope       TEXT NOT NULL,         -- 'draft' | 'afl_draft' | 'udfa' | 'freeagents' | 'player:<id>' | 'all'
  url         TEXT,
  http_status INTEGER,
  payload     BLOB,                  -- raw HTML/CSV/JSON for re-parse
  payload_kind TEXT,                 -- 'html' | 'csv' | 'json'
  fetched_at  INTEGER NOT NULL,      -- epoch ms
  etag        TEXT,
  UNIQUE(source, year, scope)
);

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_key     TEXT NOT NULL UNIQUE, -- normalized first|last|collegeKey|posGroup|draftYear
  first_name    TEXT,
  last_name     TEXT,
  position      TEXT,                 -- raw source position (e.g. 'HB','DE','OLB')
  pos_group     TEXT,                 -- collapsed group for dedup ('RB','DL','LB'...)
  college       TEXT,
  college_id    INTEGER,
  home_state    TEXT,
  height_in     INTEGER,
  weight        INTEGER,
  draft_year    INTEGER,
  draft_round   INTEGER,
  draft_pick    INTEGER,
  league        TEXT,                 -- 'NFL' | 'AFL' | 'AAFC' | combined
  dual_drafted  INTEGER DEFAULT 0,
  pfr_id        TEXT,
  gsis_id       TEXT,
  pid           INTEGER,              -- Madden PhotoID
  peps          TEXT,                 -- Madden real-player asset name
  comm_id       INTEGER,
  plpo          TEXT,
  is_hof        INTEGER DEFAULT 0,
  actual_wav    REAL,
  wav_source    TEXT,                 -- 'actual' | 'predicted'
  raw_metrics   TEXT,                 -- JSON: per-season + career stats, AP1, PB, St, DrAV
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_year ON players(draft_year);

CREATE TABLE IF NOT EXISTS draft_classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  year         INTEGER NOT NULL,
  league       TEXT NOT NULL,
  options_hash TEXT NOT NULL,         -- hash of generation options (signature)
  member_ids   TEXT,                  -- JSON array of player ids (draft order)
  fa_ids       TEXT,                  -- JSON array of injected free-agent player ids
  built_at     INTEGER NOT NULL,
  UNIQUE(year, league, options_hash)
);

CREATE TABLE IF NOT EXISTS generated_ratings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    INTEGER NOT NULL,
  rating_mode  TEXT NOT NULL,
  seed         TEXT,
  overall      INTEGER,
  dev_trait    INTEGER,
  archetype    INTEGER,
  ratings_json TEXT,
  generated_at INTEGER NOT NULL,
  UNIQUE(player_id, rating_mode, seed)
);

CREATE TABLE IF NOT EXISTS exports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_class_id  INTEGER,
  filename        TEXT,
  byte_size       INTEGER,
  prospect_count  INTEGER,
  truncated       INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL
);
