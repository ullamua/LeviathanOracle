ALTER TABLE watchlists ADD COLUMN kind VARCHAR(10) DEFAULT 'anime';
ALTER TABLE watchlists ADD COLUMN added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE watchlists ADD COLUMN status VARCHAR(20) DEFAULT 'plan_to_watch';

CREATE INDEX IF NOT EXISTS idx_watchlists_user_kind ON watchlists(user_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlists_user_kind_id ON watchlists(user_id, kind, anime_id);

-- Track manga separately in a sister table for searches; schedules stays anime-only.
CREATE TABLE IF NOT EXISTS manga_meta (
  mal_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  cover_image TEXT,
  url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
