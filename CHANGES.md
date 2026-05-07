# Changes (TypeScript Rewrite vs Original JS Bot)

This file documents every intentional change, structural divergence, new feature, bug fix, and restoration between the original JavaScript bot (`LeviathanOracle-nikovax`) and this TypeScript rewrite (v7).

---

## Language & Toolchain

| Area | Original | Rewrite |
|---|---|---|
| Language | JavaScript (CommonJS) | TypeScript (strict mode, ES2022 target) |
| Runtime | Node.js v18+ | Node.js v20+ |
| Module system | `require()` / `module.exports` | `import` / `export default` (compiled to CommonJS) |
| Type safety | None | Full strict TypeScript; all types defined in `bot/command-types.ts`, `anime/anime-types.ts` |
| Config format | `config.json` | `.env` file parsed by `dotenv` + Zod-validated schema |
| Config validation | Silent failures / undefined access | Zod schema; missing required fields are printed and the process exits cleanly |
| TypeScript compiler | — | `tsc` (strict), `tsx` for dev, `nodemon` for watch |
| Tests | None | `node --test` with `tsx` import; `tests/converters.test.ts`, `tests/fuzzy.test.ts` |
| Build output | — | `dist/` via `npm run build` |

---

## Project Structure

| Area | Original | Rewrite |
|---|---|---|
| Commands | `src/commands/<Category>/<command>.js` | `commands/<category>/<command>.ts` (flat lowercase categories) |
| API clients | `src/utils/API-services.js` (monolith) | Split per-service: `anime/anilist.ts`, `anime/jikan.ts`, `anime/animeschedule.ts`, `anime/nyaa-rss.ts` |
| Database schemas | `src/schemas/db.js`, `postgres.js`, `sqlite3.js`, `redis.js` | `data/adapter.ts`, `data/database.ts`, `data/postgres.ts`, `data/sqlite.ts`, `data/migrate.ts` |
| UI helpers | `src/functions/componentHelper.js`, `modalHelper.js`, `ui.js` | `ui/components-v2.ts`, `ui/modal.ts` |
| Notification scheduler | `src/functions/notificationScheduler.js` | `scheduling/scheduler.ts` (with BullMQ support when Redis is enabled) |
| Autocomplete handler | `src/events/Autocomplete/interactionCreate.js` | `bot/interaction-router.ts` (handles all interaction types including autocomplete + level-role gate) |
| Fuzzy matching | `src/utils/fuzzy.js` | `matching/fuzzy.ts` |
| Watchlist converters | `src/utils/watchlist-converters.js` | `converters/watchlist-converters.ts` (expanded; see Watchlist section) |
| Tracer / logging | `src/utils/tracer.js` | `observability/tracer.ts` |
| Bot entry point | `src/index.js` | `index.ts` |
| Prefix messages | `src/messages/` | **Removed** — prefix commands are gone |
| Health check | None | `observability/health.ts` (`GET /health` HTTP endpoint) |
| Deployment files | None | `deploy/Dockerfile`, `deploy/railway.toml`, `deploy/render.yaml`, `deploy/leviathan-oracle.service` |
| Guild settings store | Inline in commands | `guild/guild-store.ts` |
| Profile store | Inline in commands | `profiles/profile-store.ts` |
| Redis client | `src/schemas/redis.js` | `cache/redis-client.ts` |

---

## Configuration

| Area | Original | Rewrite |
|---|---|---|
| Config file | `config.json` (committed template: `example-config.json`) | `.env` (template: `.env.example`) |
| Database key | `"postgressql"` (typo) | `POSTGRES_ENABLED` / `POSTGRES_*` (Bug 3 fix) |
| Config access | Direct `require('./config.json')` | `config/load.ts` — Zod-validated, env-vars override file values |
| Missing fields | Silent undefined / crash at runtime | Clear error list printed; process exits with code 1 |
| Owner / admin IDs | Arrays in `config.json` | Comma-separated `OWNER_IDS` and `ADMIN_IDS` env vars |
| Developer guild IDs | `developerCommandsServerIds` in config | `DEV_GUILD_IDS` env var |
| Prefix | Configurable via `config.json` | **Removed** — slash-commands only |

---

## Database

| Area | Original | Rewrite |
|---|---|---|
| Default DB | SQLite3 via `sqlite3` npm package | SQLite via `better-sqlite3` (synchronous API, faster) |
| Postgres | Optional via `postgressql` key (had typo Bug 3) | Optional via `POSTGRES_ENABLED=true` or `DATABASE_URL` (Bug 3 fixed) |
| MongoDB | Optional via `mongodbUrl` | Reserved (`MONGO_URL`) but not yet implemented |
| Redis | Optional caching | Optional caching + BullMQ scheduler when enabled |
| `RETURNING` in SQLite | Not supported — broke inserts | Synthesised from `lastInsertRowid` in `data/sqlite.ts` (Bug 13 fix) |
| Schema migrations | Manual or implicit table creation in schemas | `data/migrate.ts` runs `001_init.sql` and `002_manga_and_dedup.sql` on every boot |
| Dedup | `UNIQUE(user_id, anime_title)` — title-keyed | `UNIQUE(user_id, kind, anime_id)` — id-keyed (Bug 1, dedup improvement) |

### Schema additions in `002_manga_and_dedup.sql`
- `watchlists.kind` (`anime` | `manga`)
- `watchlists.added_at` (timestamp)
- `watchlists.status` (e.g. `plan_to_watch`)
- `manga_meta` table (`mal_id`, `title`, `cover_image`, `url`)
- `UNIQUE INDEX (user_id, kind, anime_id)` on `watchlists`

---

## Commands — Surface Changes

### Restored to match original behaviour

| Command | What was restored |
|---|---|
| `/set-levelrole` | 3 subcommands only: `set`, `remove`, `status`. Notification channel and daily-schedule config moved back to `/rolenotification` and `/daily-schedule` respectively. |
| `/linkprofile` | Single command per platform: `/linkprofile mal <name>` and `/linkprofile anilist <name>`. Issuing the same command again auto-verifies via the bio token. No `start`/`verify` split. |
| Notification embed style | Title `New Episode of <Title> Released!`, body `**Episode N is now available!\nAired at: …`**, color `#0099ff`, footer `Episode just released!` |
| All embeds | `interactionPrivate` shape with `title / description / thumbnail / color / footer` preserved across all commands |

### New / changed commands

| Command | Change |
|---|---|
| `/watchlist` | Added `kind` option (anime/manga); new `sync` subcommand; new `clear` with kind filter; paginated `view`; improved `import`/`export` (see Watchlist section) |
| `/rolenotification add` | Now persists `role_notification_channel_id` (Bug 10 fix); channel option is respected |
| `/daily-schedule` | Fully new command replacing the old inline guild config; 4 subcommands: `enable`, `disable`, `status`, `preview`; accepts 24h or 12h time format |
| `/linkedprofile` | Added `unlink` subcommand |
| `/help` | Now reads live from `client.application.commands`; no longer hardcoded (Bug 8 fix) |
| `/preference` | Merged `notification`, `watchlist` and `view` subcommands into a single flat command with optional string/channel options |
| `/trigger-notification` | Added `delay_seconds`, `dry_run`, `force_resend` options; locked to `Administrator` permission + owner check |
| `/search-profile-mal` | Now accepts `user` Discord mention option in addition to `username` |
| `/search-profile-anilist` | Now accepts `user` Discord mention option in addition to `username` |

### Removed commands / features

| Feature | Reason |
|---|---|
| All prefix (`!`) commands | Removed in the original v3 rewrite; not brought back |
| `!pull` prefix command | Was in `src/commands/Anime/pull.js`; dropped entirely |
| `discobase-core` middleware | Replaced by custom interaction router (Bug 11 fix) |
| `prefix.value` in config | Prefix system gone; field no longer read |

---

## Watchlist — Detailed Changes

| Area | Original | Rewrite |
|---|---|---|
| Manga support | No | Yes — `kind: manga` on `add`, `remove`, `clear`, `view`; lookups go through Jikan |
| Direct sync | No (file upload only) | `/watchlist sync source:mal\|anilist kind:anime\|manga\|both` pulls from linked account |
| `view` | Flat dump, no pagination | Paginated 25/page with kind icons (📺/📖), status badge, page count footer |
| `export` | Wrapped in a Discord v2 container component | Plain `AttachmentBuilder` so Discord renders the download button correctly |
| `import` entry cap | `slice(0, 200)` — hard limit of 200 entries | Cap removed; all entries processed |
| `import` MAL id lookup | Direct title-only insert | Resolves MAL ids via `getAnimeByMalId` so AniList gets the correct id |
| `import` rate limiting | None | 250 ms delay between API calls |
| `import` failed lookups | Silently dropped | Inserted as `Imported #<id>` so nothing is lost |
| Dedup | By title (`UNIQUE(user_id, anime_title)`) | By id (`UNIQUE(user_id, kind, anime_id)`) — migration 002 |

---

## Notifications — Detailed Changes

| Area | Original | Rewrite |
|---|---|---|
| Dedup after restart | No — double-fires on restart | `schedules.sent_at` column + `sent_at IS NULL OR sent_at < next_airing_at` guard (Bug 4 fix) |
| Scheduler engine | `node-cron` only | `node-cron` (always) + BullMQ (when Redis is enabled) |
| Cover image in notification | No | Scheduler reads `cover_image` from `schedules` and embeds as thumbnail |
| Synopsis in notification | Not trimmed | Trimmed at sentence/word boundaries before truncation |
| Channel-deleted crash | Yes — unhandled rejection | `.catch(() => null)` + warn log (Bug 2 fix) |
| `/trigger-notification` | Basic: anime_id only | Extended: `delay_seconds`, `dry_run`, `force_resend` options |

---

## Profile Linking — Detailed Changes

| Area | Original | Rewrite |
|---|---|---|
| Re-link clobber | Yes — re-linking MAL overwrote AniList too | Per-column update; only the linked platform column is touched (Bug 7 fix) |
| Verification token | `LORA-XXXX` | Same format; token TTL is 10 minutes; token is regenerated if expired |
| Token verify flow | Separate `start` / `verify` subcommands | Single command; re-running auto-detects token in bio |
| Unlink | Not supported | `/linkedprofile unlink <platform>` |

---

## Observability

| Area | Original | Rewrite |
|---|---|---|
| Logging | `console.log` / `console.error` | Structured `tracer` in `observability/tracer.ts` with log levels |
| Health check | None | `GET /health` HTTP endpoint; enabled when `PORT` env var is set |
| OpenTelemetry | None | Stub in `observability/tracer.ts`; ready for extension |

---

## Deployment

| Target | Original | Rewrite |
|---|---|---|
| Railway | Not documented | `deploy/railway.toml` with Dockerfile builder + health check |
| Render | Not documented | `deploy/render.yaml` with Docker worker service |
| Docker | Not documented | `deploy/Dockerfile` (multi-stage Node 20 Alpine) |
| systemd | Not documented | `deploy/leviathan-oracle.service` |

---

## Dependencies

| Package | Original | Rewrite |
|---|---|---|
| Discord library | `discord.js` v14 | `discord.js` v14.16.3 |
| SQLite | `sqlite3` | `better-sqlite3` v11 (synchronous, faster) |
| Postgres | `pg` | `pg` v8 |
| Redis | `ioredis` | `ioredis` v5 |
| HTTP client | Built-in fetch / axios | `axios` v1 |
| RSS parser | Custom | `rss-parser` v3 |
| Scheduler | `node-cron` | `node-cron` v3 + `bullmq` v5 |
| Config validation | None | `zod` v3 |
| Concurrency limit | None | `p-limit` v5 |
| TypeScript runtime (dev) | — | `tsx` v4 + `nodemon` v3 |
| Type definitions | — | `@types/better-sqlite3`, `@types/node`, `@types/node-cron`, `@types/pg` |
