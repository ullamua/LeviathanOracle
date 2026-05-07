# LeviathanOracle

A fully featured anime community Discord bot — TypeScript rewrite (v7) of the original LeviathanOracle. Built to track AniList / MAL / AnimeSchedule, ship airing notifications (DM, channel, or role-pinged), manage personal watchlists, link MAL/AniList profiles via bio-token verification, and post daily schedule digests per server.

The idea for this bot was given by [baku](https://github.com/maiorikizu) and originally brought to life by [Pilot_kun](https://github.com/PilotKun). New file structure and full code rewrite by [Niko](https://github.com/nikovaxx).

Complete TypeScript rewrite by [ullamua](https://github.com/ullamua).

---

## Features

- **Anime & manga search** — `/search-anime`, `/search-manga` with full autocomplete powered by AniList and Jikan (MAL).
- **Personal watchlists** — `/watchlist add|remove|view|clear|export|import|sync` with manga support, pagination, and direct account sync.
- **Airing notifications** — DM or channel, dedup-safe (won't double-notify after a restart or crash).
- **Role notifications** — `/rolenotification add|remove|list` per-server; optional channel override per role pairing.
- **Daily schedule poster** — `/daily-schedule enable|disable|status|preview` configures auto-posting per guild at a configurable UTC time.
- **Profile linking** — `/linkprofile mal|anilist` using a `LORA-XXXX` bio token with auto-verification on re-run.
- **Profile lookups** — `/search-profile-anilist`, `/search-profile-mal` — works by username or by tagging a Discord user.
- **Nyaa search** — `/nyaa <query>` (English subbed/dubbed only, RSS-backed).
- **Reports** — `/report` opens a structured modal; entries persist to the database and relay to a configured report channel.
- **Level-role gating** — server admins can lock all commands behind a role via `/set-levelrole`.
- **Optional Redis caching** — auto-skipped when disabled; `{fresh}` bypass available per API call.
- **Dual database support** — SQLite by default; Postgres when `POSTGRES_ENABLED=true` or `DATABASE_URL` is set.
- **Health endpoint** — `GET /health` when `PORT` is set (Railway / Render compatible).
- **Observability** — structured logger with configurable log level and optional file output.
- **Auto-migrations** — schema migrations run automatically on every boot; no manual SQL needed.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js v20+ | v18 may work but is not tested |
| SQLite | Default DB — created and migrated automatically |
| PostgreSQL | Optional; set `POSTGRES_ENABLED=true` or `DATABASE_URL` |
| Redis | Optional; enables BullMQ scheduler and caching |
| Discord bot token | From the [Discord Developer Portal](https://discord.com/developers/applications) |
| AnimeSchedule token | From [animeschedule.net](https://animeschedule.net) profile → API |

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/ullamua/LeviathanOracle
cd LeviathanOracle
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the Discord application

1. Visit <https://discord.com/developers/applications> → **New Application**.
2. Under **Bot**, click **Add Bot** and copy the **Token** → `DISCORD_TOKEN`.
3. Copy the **Application ID** (top of General Information) → `BOT_ID`.
4. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**.
5. Under **OAuth2 → URL Generator** select scopes `bot` + `applications.commands` and the following permissions:
   - Send Messages, Embed Links, Attach Files
   - Read Message History
   - Manage Roles *(required for `/rolenotification` and `/set-levelrole`)*
6. Visit the generated URL to invite the bot to your server.

### 4. Get your AnimeSchedule token

Register at <https://animeschedule.net/users/sign-up> → **Profile → API** → generate a token → paste as `ANIMESCHEDULE_TOKEN`.

### 5. Configure environment

```bash
cp .env.example .env
$EDITOR .env
```

Full `.env` reference:

```env
# ── Required ──────────────────────────────────────────────────────────────────
DISCORD_TOKEN=            # Bot token from Discord developer portal
BOT_ID=                   # Application/Client ID
ANIMESCHEDULE_TOKEN=      # From animeschedule.net profile → API

# Comma-separated Discord user IDs. The first one is the primary owner.
OWNER_IDS=
ADMIN_IDS=                # Secondary admins (can use admin-only commands)

# ── Recommended ───────────────────────────────────────────────────────────────
REPORT_CHANNEL_ID=        # Channel where /report submissions are posted
DEV_GUILD_IDS=            # Comma-separated guild IDs for instant dev-command registration

# ── Logging channels (optional) ───────────────────────────────────────────────
GUILD_JOIN_LOGS_ID=
GUILD_LEAVE_LOGS_ID=
COMMAND_LOGS_CHANNEL_ID=
ERROR_LOGS_CHANNEL_ID=

# ── PostgreSQL (leave blank to use SQLite) ────────────────────────────────────
POSTGRES_ENABLED=false
POSTGRES_HOST=
POSTGRES_PORT=5432
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=

# Or paste a single connection URL (takes priority over individual fields above)
DATABASE_URL=

# ── Redis (optional) ──────────────────────────────────────────────────────────
REDIS_ENABLED=false
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=                # Takes priority over individual fields above

# ── Mongo (optional, reserved for future expansion) ───────────────────────────
MONGO_URL=

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL=info            # trace | debug | info | warn | error
LOG_FILE_DIR=logs
```

> **Config precedence:** environment variables override `config.json` values. The Zod-validated config loader prints a clear list of any missing required fields on startup and exits cleanly instead of crashing mid-run.

### 6. Database setup

No manual SQL is required. On every boot the bot applies its migration files automatically:

| Migration | Contents |
|---|---|
| `data/migrations/001_init.sql` | Core tables: `watchlists`, `user_profiles`, `user_preferences`, `role_notifications`, `schedules`, `guild_settings`, `reports` |
| `data/migrations/002_manga_and_dedup.sql` | Adds `kind`, `added_at`, `status` columns to watchlists; `manga_meta` table; `(user_id, kind, anime_id)` unique index |

If you are using PostgreSQL or Redis, ensure those services are running before starting the bot.

### 7. Start the bot

```bash
# Development — tsx watch mode (auto-restarts on file changes)
npm run dev

# Production — compile TypeScript first, then run
npm run build
npm start
```

Slash commands register **globally** on the first `ready` event (up to ~1 minute propagation from Discord). Commands listed in `DEV_GUILD_IDS` register **instantly** in those guilds only — useful for testing.

---

## Development

```bash
# Watch mode with auto-reload
npm run dev

# Type-check only (no emit)
npm run typecheck

# Run unit tests
npm test

# Compile TypeScript → dist/
npm run build

# Run compiled output (production)
npm start
```

---

## Command List

> All commands are slash commands (`/`). Prefix commands have been fully removed.

### 🎌 Anime

| Command | Options | Description |
|---|---|---|
| `/search-anime` | `query` (required, autocomplete) | Search for an anime on AniList |
| `/search-manga` | `query` (required, autocomplete) | Search for a manga on MyAnimeList via Jikan |
| `/upcoming` | — | Show every airing anime in the next 7 days, grouped by day |
| `/nyaa` | `query` (required) | Search Nyaa.si for English subbed/dubbed releases |
| `/rolenotification add` | `role`, `anime` (autocomplete), `channel` (optional) | Pair a role with an anime for notifications *(Manage Roles required)* |
| `/rolenotification remove` | `role`, `anime` (autocomplete) | Remove a role notification pairing |
| `/rolenotification list` | — | List all role notification pairings in this server |
| `/daily-schedule enable` | `channel` (optional), `time` (optional, 24h or 12h) | Enable auto daily schedule posting |
| `/daily-schedule disable` | — | Disable auto daily schedule posting |
| `/daily-schedule status` | — | View current daily schedule configuration |
| `/daily-schedule preview` | — | Preview today's schedule without changing settings |

### Watchlist

| Command | Options | Description |
|---|---|---|
| `/watchlist add` | `anime\|manga` (autocomplete), `kind` (anime/manga) | Add an entry to your watchlist |
| `/watchlist remove` | `anime\|manga` (autocomplete), `kind` | Remove an entry from your watchlist |
| `/watchlist view` | `page` (optional), `user` (optional) | View your watchlist (or another user's public one), 25 per page |
| `/watchlist clear` | `kind` (optional: anime/manga/both) | Clear your entire watchlist or a specific kind |
| `/watchlist export` | `format` (mal/anilist) | Export watchlist as MAL XML or AniList JSON attachment |
| `/watchlist import` | *(file upload)* | Import from a MAL XML or AniList JSON file |
| `/watchlist sync` | `source` (mal/anilist), `kind` (anime/manga/both) | Sync directly from your linked MAL or AniList account |

### Profile

| Command | Options | Description |
|---|---|---|
| `/linkprofile mal` | `username` (required) | Link your MyAnimeList account — issues `LORA-XXXX` token; re-run to auto-verify |
| `/linkprofile anilist` | `username` (required) | Link your AniList account — same token flow |
| `/linkedprofile view` | — | View your currently linked profiles |
| `/linkedprofile unlink` | `platform` (mal/anilist) | Unlink a specific platform |
| `/search-profile-mal` | `username` (optional), `user` (optional Discord mention) | Look up a MAL profile |
| `/search-profile-anilist` | `username` (optional), `user` (optional Discord mention) | Look up an AniList profile |

### Community

| Command | Options | Description |
|---|---|---|
| `/ping` | — | Check bot latency (roundtrip + WebSocket) |
| `/help` | — | List every registered command with its live description |
| `/report` | — | Submit a bug report or feature request via a modal |
| `/preference` | `notification_type` (dm/channel), `watchlist_visibility` (private/public), `notification_channel` | Configure how you receive notifications and watchlist visibility |
| `/set-levelrole set` | `role` (required) | Require a role to use any bot command *(Manage Guild required)* |
| `/set-levelrole remove` | — | Remove the role requirement |
| `/set-levelrole status` | — | View the current role requirement |

### Dev / Admin

| Command | Options | Permissions | Description |
|---|---|---|---|
| `/trigger-notification` | `anime_id` (required), `delay_seconds`, `dry_run`, `force_resend` | Owner + Administrator | Force a notification dispatch for an AniList ID; supports dry-run preview and delayed scheduling |

---

## Command Structure

Commands are discovered automatically by the loader. Drop a `.ts` file in `commands/<category>/` and restart — no registration step needed.

### File layout

```
commands/
  anime/
    daily-schedule.ts      ← /daily-schedule (4 subcommands)
    nyaa.ts                ← /nyaa
    rolenotification.ts    ← /rolenotification (3 subcommands)
    search-anime.ts        ← /search-anime
    search-manga.ts        ← /search-manga
    upcoming.ts            ← /upcoming
    watchlist.ts           ← /watchlist (7 subcommands)
  community/
    help.ts                ← /help
    ping.ts                ← /ping
    preference.ts          ← /preference
    report.ts              ← /report
    set-levelrole.ts       ← /set-levelrole (3 subcommands)
  dev/
    trigger-notification.ts← /trigger-notification
  profile/
    linkedprofile.ts       ← /linkedprofile (2 subcommands)
    linkprofile.ts         ← /linkprofile (2 subcommands: mal, anilist)
    search-profile-anilist.ts ← /search-profile-anilist
    search-profile-mal.ts  ← /search-profile-mal
```

### Shared `SlashCommand` properties

| Property | Type | Required | Description |
|---|---|---|---|
| `data` | `SlashCommandBuilder` | ✅ | Command name, description, and options |
| `execute(interaction)` | `async function` | ✅ | Main command handler |
| `autocomplete(interaction)` | `async function` | Optional | Handles autocomplete for string options |
| `guildOnly` | `boolean` | Optional | Refuse execution outside a guild context |
| `devOnly` | `boolean` | Optional | Restrict to guilds in `DEV_GUILD_IDS` |
| `ownerOnly` | `boolean` | Optional | Restrict to user IDs in `OWNER_IDS` |
| `adminOnly` | `boolean` | Optional | Restrict to user IDs in `ADMIN_IDS` |
| `bypassLevelRole` | `boolean` | Optional | Allow command even if user lacks the level-role |

### Example — minimal slash command

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply(interactionPrivate({ title: 'Pinging…' }));
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.editReply(interactionPrivate({
      title: '🏓 Pong',
      description: `Roundtrip: **${latency}ms**\nWS: **${interaction.client.ws.ping}ms**`,
      color: 'green',
    }));
  },
};

export default command;
```

### Example — command with autocomplete

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { searchAnime } from '../../anime/anilist';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('search-anime')
    .setDescription('Search for an anime on AniList')
    .addStringOption((o) =>
      o.setName('query').setDescription('Anime title').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    if (!focused) return interaction.respond([]);
    const results = await searchAnime(focused, 10).catch(() => []);
    await interaction.respond(
      results.slice(0, 25).map((a) => ({
        name: (a.title || a.title_romaji || 'Unknown').slice(0, 100),
        value: String(a.anilist_id),
      })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    // ... handle the command
  },
};

export default command;
```

---

## Bug Fixes (from original JS bot)

All known bugs in the original bot are patched in this rewrite:

| # | Bug | Fix location |
|---|---|---|
| 1 | Watchlist add silently failed on duplicate title | `commands/anime/watchlist.ts` — uses `ON CONFLICT DO NOTHING` |
| 2 | Notification dispatch crashed when channel was deleted | `scheduling/scheduler.ts` — `.catch(() => null)` + warn log |
| 3 | Postgres path was unreachable (`postgressql` typo in config) | `config/load.ts` + `data/database.ts` |
| 4 | Duplicate notifications fired after bot restart | `schedules.sent_at` column + `sent_at IS NULL OR sent_at < next_airing_at` dedup query |
| 5 | `/upcoming` skipped today's airings (timezone off-by-one) | `anime/animeschedule.ts` — uses `timeZone: 'UTC'` consistently |
| 6 | Modal `/report` had no persistence | `commands/community/report.ts` writes to `reports` table in DB |
| 7 | Profile re-link clobbered the other platform's data | `profiles/profile-store.ts` — updates one column at a time |
| 8 | `/help` was hardcoded and went stale after command changes | `commands/community/help.ts` — reads live from `client.application.commands` |
| 9 | MAL profile scrape silently returned `''` on site layout change | `anime/jikan.ts` — throws `MalScrapeError` with user-facing message |
| 10 | `/rolenotification add` ignored the optional channel override | `commands/anime/rolenotification.ts` — persists `role_notification_channel_id` |
| 11 | `discobase-core` middleware was bypassed on autocomplete interactions | Replaced with a custom interaction router in `bot/interaction-router.ts` |
| 12 | Level-role gate bypassed for commands not registered with middleware | Router enforces gate globally; opt-out via `bypassLevelRole: true` on the command |
| 13 | SQLite did not support `RETURNING` in `INSERT` statements | `data/sqlite.ts` — synthesises `RETURNING` result from `lastInsertRowid` |

---

## Deployment Options

### Docker

```bash
# Build image
docker build -f deploy/Dockerfile -t leviathan-oracle .

# Run with env file
docker run --env-file .env leviathan-oracle
```

The Dockerfile uses a multi-stage build (Node 20 Alpine). The final image exposes port 8080 and runs `node dist/index.js`.

### Railway

Set all required env vars in the Railway dashboard. The `deploy/railway.toml` tells Railway to use the Dockerfile and configures a health check at `/health` with automatic restart on failure.

### Render

`deploy/render.yaml` configures a worker service using the Dockerfile. Set env vars in the Render dashboard.

### systemd / VPS

```bash
sudo cp deploy/leviathan-oracle.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now leviathan-oracle
sudo journalctl -u leviathan-oracle -f   # tail logs
```

---

## Common Problems

| Symptom | Fix |
|---|---|
| **Missing permissions** | Re-invite the bot using the OAuth2 URL with scopes `bot` + `applications.commands` and the correct permissions |
| **Unknown interaction / commands not appearing** | Wait up to 1 hour for global command propagation; use `DEV_GUILD_IDS` for instant registration during testing |
| **Bot is offline** | Check `DISCORD_TOKEN`; inspect logs for rate limits or auth errors |
| **Commands not showing** | Confirm `BOT_ID` matches your Application ID in the developer portal |
| **Daily schedule not posting** | Run `/daily-schedule status` — confirm enabled and channel is set |
| **Postgres connection error** | Verify `POSTGRES_ENABLED=true` and all `POSTGRES_*` fields; ensure the server is reachable |
| **Redis connection error** | Verify `REDIS_ENABLED=true` and credentials; bot falls back to SQLite-only if Redis is unreachable |
| **Config validation error on startup** | Zod prints exactly which fields are missing — fill them in `.env` and restart |
| **`LORA-XXXX` token not verifying** | Add the token to your bio, then re-run the same `/linkprofile` command within 10 minutes |

---

## Reference & Acknowledgements

- [AniList GraphQL API](https://docs.anilist.co/)
- [Jikan API for MyAnimeList](https://jikan.moe/)
- [AnimeSchedule API](https://animeschedule.net)
- [Nyaa Torrent RSS](https://nyaa.si)
- [discord.js v14](https://discord.js.org)
- [BullMQ](https://docs.bullmq.io/) — Redis-backed job scheduler

## License

MIT License — see `LICENSE` file for details.
