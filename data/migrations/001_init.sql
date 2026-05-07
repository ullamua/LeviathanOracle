CREATE TABLE IF NOT EXISTS watchlists (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  discord_username TEXT,
  anime_title TEXT NOT NULL,
  anime_id INTEGER,
  UNIQUE(user_id, anime_title)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  mal_username VARCHAR(255),
  anilist_username VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id VARCHAR(255) PRIMARY KEY,
  notification_type VARCHAR(50) DEFAULT 'dm',
  watchlist_visibility VARCHAR(50) DEFAULT 'private',
  notification_channel_id VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_notifications (
  id SERIAL PRIMARY KEY,
  role_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255) NOT NULL,
  anime_title TEXT NOT NULL,
  anime_id INTEGER,
  role_notification_channel_id VARCHAR(255),
  UNIQUE(role_id, anime_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  anime_id INTEGER PRIMARY KEY,
  anime_title TEXT NOT NULL,
  next_airing_at BIGINT,
  sent_at BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id VARCHAR(255) PRIMARY KEY,
  notification_channel_id VARCHAR(255),
  daily_schedule_channel_id VARCHAR(255),
  daily_schedule_enabled VARCHAR(10) DEFAULT 'false',
  daily_schedule_time VARCHAR(5) DEFAULT '05:00',
  level_role_id VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_anime_title ON watchlists(anime_title);
CREATE INDEX IF NOT EXISTS idx_role_notifications_guild ON role_notifications(guild_id);
CREATE INDEX IF NOT EXISTS idx_role_notifications_anime_title ON role_notifications(anime_title);
CREATE INDEX IF NOT EXISTS idx_role_notifications_anime_id ON role_notifications(anime_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next_airing ON schedules(next_airing_at);
CREATE INDEX IF NOT EXISTS idx_schedules_anime_title ON schedules(anime_title)
