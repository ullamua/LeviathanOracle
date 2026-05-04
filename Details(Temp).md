Yeah Asked Pilot too. So Most of the things are already achieved like automatic notifications, and usual tracking. You can check #plans for what new things will be added.

Bot has: Episode Tracking, and other essential commands you can get from [here](https://github.com/nikovaxx/LeviathanOracle/blob/nikovax/Command%20List.md). You can see how you can make new commands from [here](https://github.com/nikovaxx/LeviathanOracle/blob/nikovax/Command%20Structure.md).

## 1. Multi-Database Architecture

The database layer is abstracted behind a single router file that decides at startup which engine to use.

### The Router (`src/schemas/db.js`)

```js
const db = config.database.postgresql?.enabled
  ? require('./postgres')
  : require('./sqlite3');
```

This is the entire branching logic. Every command file across the entire bot imports `../../schemas/db` and calls `db.query(sql, params)` - they never know or care whether they're talking to PostgreSQL or SQLite. The interface is identical by design.

### SQLite3 (`src/schemas/sqlite3.js`)

This is the default. It uses `better-sqlite3`, which is a **synchronous** driver, but the exported `query()` function wraps it in an `async` function so the calling code doesn't need to know that. The most important adaptation it does is translating PostgreSQL-style positional parameters (`$1, $2`) into SQLite-style question marks (`?`):

```js
const sql = text.replace(/\$\d+/g, m => {
  refs.push(parseInt(m.slice(1)) - 1);
  return '?';
});
const expanded = refs.map(i => params[i]);
```

It also intercepts `RETURNING` clauses (a PostgreSQL feature SQLite doesn't support) and strips them, instead returning `{ id: info.lastInsertRowid }` manually. The return shape always matches `{ rows, rowCount }` so the callers don't need to change.

### PostgreSQL (`src/schemas/postgres.js`)

Uses the `pg` Pool driver. Since PostgreSQL natively uses `$1, $2` parameters and supports `RETURNING`, no translation is needed. It exposes the same `{ rows, rowCount }` shape that `pg` already returns.

### Redis (`src/schemas/redis.js`)

Redis sits as an **optional caching layer on top** of the API service functions - it's not a primary data store. If `redis.enabled` is false in config, all redis methods (`get`, `set`, `del`) silently return `null`/`undefined` and the `cached()` wrapper in `API-services.js` simply always calls the fetcher function directly. Redis never holds relational data, only serialized JSON of API responses.

## 2. Anime Storage in the Database

### Tables Involved

**`watchlists`** - the core user-facing table. Each row is a single user's subscription to a single anime:

| Column | Purpose |
|---|---|
| `user_id` | Discord user snowflake |
| `discord_username` | Stored at insert time for display |
| `anime_title` | Human-readable title (English or Romaji) |
| `anime_id` | AniList integer ID (nullable for manual imports) |

The unique constraint is on `(user_id, anime_title)` for SQLite and `(user_id, anime_title)` for Postgres. This means the same title can't be added twice by the same user, but it also means two anime with the same English title would collide - which is the known fragility in the codebase.

**`schedules`** - one row per anime being tracked globally, regardless of how many users watch it:

| Column | Purpose |
|---|---|
| `anime_id` | Primary key, the AniList ID |
| `anime_title` | Cached title |
| `next_airing_at` | Unix timestamp in milliseconds |
| `sent_at` | Timestamp of the last notification sent for this slot |

This table is the heartbeat of the notification system. It is shared - if 100 users all have the same anime in their watchlists, there is still only one row here. The scheduler fires once per anime, then fans out to all relevant users.

**`role_notifications`** - server-level subscriptions. A Discord role gets pinged when an anime airs, independently of individual user watchlists. Linked to `schedules` via `anime_id`.

**`guild_settings`** - per-server configuration including the daily schedule channel, whether it's enabled, and what UTC time to post at.

### How Anime Gets Written

When a user runs `/watchlist add`, the flow in `watchlist.js` is:

1. The title or AniList ID is searched via `searchAnimeByAniList()` or `getAnimeByAniListId()`.
2. The resulting anime object is passed to `insertAnime()`.
3. `insertAnime()` checks for duplicates, then `INSERT`s into `watchlists`.
4. If the anime has a `nextAiringEpisode.airingAt` timestamp from AniList, it `INSERT`s or updates a row in `schedules` with that millisecond timestamp, and immediately calls `scheduler.schedule()` to register an in-memory timer.

The same pattern is followed by `/rolenotification add`.


## 3. The Notification System - Complete Flow

The notification system lives in `src/functions/notificationScheduler.js` and has four distinct responsibilities running in parallel.

### Phase 1: Startup (`initialize`)

Called once from `src/index.js` inside the `clientReady` event:

```
catchMissed() runs first
  ↓
All future schedules loaded from DB into memory timers
  ↓
8-hour cron registered (refresh + catchMissed again)
  ↓
Per-minute cron registered (daily schedule poster)
```

**Why catchMissed first?** If the bot was offline when an episode aired, the `schedules` table will have rows where `next_airing_at <= now` and `sent_at` is either `NULL` or older than `next_airing_at`. These are fetched and sent immediately on boot.

### Phase 2: In-Memory Timer Scheduling (`schedule`)

```js
function schedule(entry) {
  const delay = entry.next_airing_at - Date.now();
  if (delay <= 0) return; // already past
  cancel(entry.anime_id);
  const handle = setTimeout(() => send(entry), delay);
  jobs.set(entry.anime_id, handle);
}
```

The `jobs` Map stores `anime_id → setTimeout handle`. This means if a schedule gets updated (e.g. the 8-hour refresh finds a corrected airing time), `cancel()` clears the old timer and `schedule()` sets a new one. The timer's callback is `send(entry)`.

### Phase 3: Sending a Notification (`send`)

This is the most complex function. It has multiple guard layers:

**Guard 1 - `inFlight` Set:** Before doing anything, it checks if this `anime_id` is already being processed. If so, it returns immediately. This prevents duplicate sends if somehow two timers fire for the same anime at nearly the same time.

**Guard 2 - DB `sent_at` check:** Even if not in-flight, it queries the DB to see if `sent_at >= next_airing_at`. This is the persistent guard that survives restarts. If a notification was already sent for this airing slot, it skips.

**The actual send flow:**

```
Mark sent_at in DB immediately (before fetching, to minimize race conditions)
  ↓
Fetch fresh anime data from AniList (title, episode number, next airing)
  ↓
Build the notification embed card
  ↓
Query watchlists for all user_ids watching this anime_id
  ↓
For each user: fetch Discord user → send DM
  ↓
Query role_notifications for all roles watching this anime_id
  ↓
For each role: fetch guild's daily_schedule_channel_id → send to channel with @role mention
  ↓
Check anime status from fresh AniList data:
  - If FINISHED → removeTracking() (delete from schedules, cancel timer)
  - If next_airing found → update schedules table + schedule() next timer
  - Otherwise → leave as-is
```

The 1500ms delay between missed-episode sends (`catchMissed`) and the 1000ms delay between schedule refreshes exist to avoid rate-limiting downstream APIs.

### Phase 4: The 8-Hour Refresh Cron (`updateSchedules`)

AniList's airing times can shift. This cron fires every 8 hours and:

1. Loads all rows from `schedules`.
2. For each, calls `getAnimeByAniListId()` to get the current `next_airing.airing_at`.
3. If the new timestamp differs from the stored one, updates the DB and reschedules the in-memory timer.
4. If AniList reports the anime as `FINISHED`/`COMPLETED`, calls `removeTracking()` to clean up.

A `cronRunning` boolean flag prevents overlapping runs if a refresh takes longer than 8 hours (unlikely, but guarded).

### Phase 5: The Per-Minute Daily Schedule Poster (`postDailySchedule`)

Every minute, it:

1. Gets the current UTC time as `HH:MM`.
2. Queries `guild_settings` for all guilds where `daily_schedule_enabled = 'true'` AND `daily_schedule_time = currentUtcTime`.
3. Fetches today's full anime schedule from AnimeSchedule API.
4. Posts an embed to each matched guild's configured channel.

This means the posting accuracy is within ±1 minute of the configured UTC time, which is acceptable for a daily digest.

---

## 4. API Responsibilities

The file `src/utils/API-services.js` has a strict separation of concerns, as documented in its own header comment.

**Jikan / MyAnimeList** handles everything manga-related and MAL profile operations - `searchMangaCatalog`, `getMangaDetailsByMalId`, `getMalUserProfile`, `getMalUserStats`, `getMalUserFavorites`. MAL profile verification for `/linkprofile` also goes through Jikan, with an HTML scraper fallback (`fetchMalAboutFromProfilePage`) for when the Jikan `about` field returns empty. (This was due to MAL changing their path to about me)

**AniList GraphQL** handles all anime data - search, details by ID, airing schedules, AniList user profiles, and the verification check for `/linkprofile anilist`. All AniList calls go through `anilistPost()` which wraps `axios.post` to the GraphQL endpoint. The `mapAniListAnime()` function normalizes the raw GraphQL response into a consistent internal shape used throughout the bot.

**AnimeSchedule API** (requires a token) is exclusively used by `/upcoming` and `/daily-schedule`. It provides the weekly timetable organized by day and airing type (sub/dub/raw). No user or anime detail data comes from here - it's purely a scheduling source.

### The Caching Wrapper

Every API function is wrapped in `cached(key, ttl, fetcher)`:

```js
async function cached(key, ttl, fetcher) {
  if (redis.client) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  }
  const data = await fetcher();
  if (redis.client && data != null) {
    redis.set(key, JSON.stringify(data), { EX: ttl });
  }
  return data;
}
```

Cache TTLs by category are: search results (30 min), details (6 hours), schedule data (15 min), user profiles (1 hour). If Redis is disabled, `cached()` is effectively just `fetcher()` - no code changes needed elsewhere.
