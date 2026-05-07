# Command Reference — LeviathanOracle (TypeScript v7)

Every slash command available in the rewrite, with all options, permissions, and embed behaviour documented individually.

> **Note:** All commands are slash commands (`/`). Prefix commands have been fully removed.

---

## Table of Contents

- [Anime Commands](#anime-commands)
  - [/search-anime](#search-anime)
  - [/search-manga](#search-manga)
  - [/upcoming](#upcoming)
  - [/nyaa](#nyaa)
  - [/rolenotification](#rolenotification)
  - [/daily-schedule](#daily-schedule)
- [Watchlist Commands](#watchlist-commands)
  - [/watchlist add](#watchlist-add)
  - [/watchlist remove](#watchlist-remove)
  - [/watchlist view](#watchlist-view)
  - [/watchlist clear](#watchlist-clear)
  - [/watchlist export](#watchlist-export)
  - [/watchlist import](#watchlist-import)
  - [/watchlist sync](#watchlist-sync)
- [Profile Commands](#profile-commands)
  - [/linkprofile mal](#linkprofile-mal)
  - [/linkprofile anilist](#linkprofile-anilist)
  - [/linkedprofile view](#linkedprofile-view)
  - [/linkedprofile unlink](#linkedprofile-unlink)
  - [/search-profile-mal](#search-profile-mal)
  - [/search-profile-anilist](#search-profile-anilist)
- [Community Commands](#community-commands)
  - [/ping](#ping)
  - [/help](#help)
  - [/report](#report)
  - [/preference](#preference)
  - [/set-levelrole set](#set-levelrole-set)
  - [/set-levelrole remove](#set-levelrole-remove)
  - [/set-levelrole status](#set-levelrole-status)
- [Dev / Admin Commands](#dev--admin-commands)
  - [/trigger-notification](#trigger-notification)

---

## Anime Commands

---

### `/search-anime`

Search for an anime on AniList.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Public (ephemeral: false) |
| Level-role bypass | No |
| Guild only | No |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `query` | String (autocomplete) | ✅ | Anime title. Autocomplete returns up to 25 AniList results as you type. |

**Autocomplete behaviour:** Calls `searchAnime(focused, 10)` on AniList; returns up to 25 entries with title as label and `anilist_id` as value.

**Response embed fields:**
- Title, synopsis (up to 1 500 chars), cover thumbnail, AniList URL
- Status, Episodes, Score (`/100`), Genres
- Next episode (if airing): `Ep N · <relative timestamp>`
- Footer: `AniList`
- Color: purple

**Example:**
```
/search-anime query:bocchi the rock
```

---

### `/search-manga`

Search for a manga on MyAnimeList via the Jikan API.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Public (ephemeral: false) |
| Level-role bypass | No |
| Guild only | No |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `query` | String (autocomplete) | ✅ | Manga title. Autocomplete returns up to 25 Jikan results. |

**Autocomplete behaviour:** Calls `searchManga(focused, 10)` on Jikan; returns up to 25 entries with English title (or romanised) as label and `mal_id` as value.

**Response embed fields:**
- Title (English preferred), synopsis (up to 1 500 chars), cover thumbnail, MAL URL
- Status, Volumes, Score (`/10`)
- Footer: `MyAnimeList`
- Color: orange

**Example:**
```
/search-manga query:chainsaw man
```

---

### `/upcoming`

Show every airing anime episode in the next 7 days, grouped by weekday.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Public (ephemeral: false) |
| Level-role bypass | No |
| Guild only | No |

**Options:** None.

**Behaviour:** Queries AnimeSchedule for `sub` type; filters to the next 168 hours; groups by UTC weekday; shows up to 8 entries per day with relative Discord timestamps.

**Response embed fields:**
- Title: `📅 Upcoming anime (next 7 days)`
- Description: grouped by day, up to 3 500 chars
- Color: blue

**Example:**
```
/upcoming
```

---

### `/nyaa`

Search Nyaa.si for English subbed or dubbed anime releases via RSS.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Level-role bypass | No |
| Guild only | No |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `query` | String | ✅ | Search term — e.g. anime title, group name, resolution |

**Behaviour:** Fetches `https://nyaa.si/?page=rss&q=<query>&c=1_2&f=0`, filters items to English-only releases, returns top 10 as a numbered link list.

**Response embed fields:**
- Title: `🌊 Nyaa results — <query>`
- Description: numbered list of up to 10 entries with title (truncated to 100 chars) linked to the Nyaa page
- Color: cyan

**Example:**
```
/nyaa query:Frieren 1080p
```

---

### `/rolenotification`

Manage role-based airing notifications for a server.

#### `/rolenotification add`

Pair a server role with an anime — the role will be pinged when a new episode airs.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Roles |
| Guild only | Yes |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `role` | Role | ✅ | The role to ping |
| `anime` | String (autocomplete) | ✅ | Anime title — autocomplete searches AniList; the chosen value is the `anilist_id` |
| `channel` | Channel | ❌ | Override channel for this role's notifications; defaults to server notification channel |

**Behaviour:** Upserts a row in `role_notifications`; calls `ensureScheduleEntry` so the anime is tracked even if no user has it on their watchlist.

**Response embed:**
- Success: `✅ Linked` — `<@&role> will be pinged for **<anime>**.` (green)
- Not found: `Not found` (red)

**Example:**
```
/rolenotification add role:@AnimeFans anime:Dungeon Meshi channel:#anime-pings
```

---

#### `/rolenotification remove`

Remove a role-anime notification pairing.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Roles |
| Guild only | Yes |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `role` | Role | ✅ | The role to unlink |
| `anime` | String (autocomplete) | ✅ | Autocomplete is populated from existing pairings for this server |

**Example:**
```
/rolenotification remove role:@AnimeFans anime:Dungeon Meshi
```

---

#### `/rolenotification list`

List every role notification pairing configured in this server.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Roles |
| Guild only | Yes |

**Options:** None.

**Response embed:**
- Title: `🔔 Role notifications`
- Description: `<@&role> → **anime title**` per row (up to 3 500 chars)
- Color: blue

**Example:**
```
/rolenotification list
```

---

### `/daily-schedule`

Configure automatic daily anime schedule posting for a server.

#### `/daily-schedule enable`

Enable the daily schedule poster.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `channel` | Channel (Text/Announcement) | ❌ | Channel to post in; required on first enable |
| `time` | String | ❌ | UTC time to post — accepts `HH:MM` (24h) or `h[:mm] AM/PM` (12h); defaults to `05:00` |

**Behaviour:** Persists channel, time, and `enabled = true` to `guild_settings`.

**Response embed:**
- Success: `✅ Daily Schedule Enabled` (green)
- Invalid time format: `Invalid Time Format` with examples (red)
- No channel: `Channel Required` (red)

**Example:**
```
/daily-schedule enable channel:#schedule time:17:30
/daily-schedule enable channel:#schedule time:5:30 PM
```

---

#### `/daily-schedule disable`

Disable automatic daily schedule posting.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:** None.

**Response embed:** `🔕 Daily Schedule Disabled` (red)

**Example:**
```
/daily-schedule disable
```

---

#### `/daily-schedule status`

View the current daily schedule configuration.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:** None.

**Response embed:**
- Title: `Daily Schedule Status`
- Shows enabled/disabled state, configured channel, and posting time (UTC)

**Example:**
```
/daily-schedule status
```

---

#### `/daily-schedule preview`

Preview today's anime schedule without changing any settings.

| Property | Value |
|---|---|
| Category | Anime |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:** None.

**Example:**
```
/daily-schedule preview
```

---

## Watchlist Commands

All watchlist subcommands share the `/watchlist` root.

---

### `/watchlist add`

Add an anime or manga to your personal watchlist.

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |
| Level-role bypass | No |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `anime` or `manga` | String (autocomplete) | ✅ | Title to add — autocomplete searches AniList (anime) or Jikan (manga) |
| `kind` | Choice: `anime` / `manga` | ❌ | Defaults to `anime` |

**Behaviour:**
- Anime: searches AniList; resolves to `anilist_id`.
- Manga: searches Jikan; resolves to `mal_id`.
- Dedup: `ON CONFLICT (user_id, kind, anime_id) DO NOTHING` — silently skips if already present (Bug 1 fix).
- Calls `ensureScheduleEntry` so the anime is tracked for notifications.

**Example:**
```
/watchlist add anime:Frieren: Beyond Journey's End
/watchlist add anime:Berserk kind:manga
```

---

### `/watchlist remove`

Remove an anime or manga from your watchlist.

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `anime` or `manga` | String (autocomplete) | ✅ | Entry to remove — autocomplete is populated from your existing watchlist |
| `kind` | Choice: `anime` / `manga` | ❌ | Defaults to `anime` |

**Example:**
```
/watchlist remove anime:Frieren: Beyond Journey's End
```

---

### `/watchlist view`

View your watchlist (or another user's public watchlist), paginated 25 entries per page.

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `page` | Integer | ❌ | Page number (default 1) |
| `user` | User | ❌ | Discord user whose public watchlist to view |

**Response embed:**
- Lists entries with kind icon (📺 anime / 📖 manga), title, and status
- Footer: `Page N / total · X entries total`

**Example:**
```
/watchlist view
/watchlist view page:2
/watchlist view user:@friend
```

---

### `/watchlist clear`

Clear your entire watchlist, or just one kind.

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `kind` | Choice: `anime` / `manga` / `both` | ❌ | Defaults to `both` |

**Example:**
```
/watchlist clear
/watchlist clear kind:manga
```

---

### `/watchlist export`

Export your watchlist as a file attachment.

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `format` | Choice: `mal` / `anilist` | ❌ | Output format — MAL XML or AniList JSON (default: `mal`) |

**Behaviour:** Returns a plain `AttachmentBuilder` file so Discord renders the download button correctly. The `slice(0, 200)` cap from the original is removed — all entries are exported.

**Example:**
```
/watchlist export format:mal
/watchlist export format:anilist
```

---

### `/watchlist import`

Import entries from a MAL XML or AniList JSON file.

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |

**Options:** None — upload a file as an attachment with the command.

**Behaviour:**
- Accepts MAL XML (`myanimelist` root) or AniList JSON (`lists` key).
- MAL entries are resolved via `getAnimeByMalId` to get the correct AniList ID.
- 250 ms delay between API calls to avoid rate limits.
- Failed lookups are inserted as `Imported #<id>` rather than silently dropped.
- No entry cap (the original 200-entry limit is removed).
- Deduplicates by `(user_id, kind, anime_id)`.

**Example:**
```
/watchlist import   ← attach your XML/JSON file
```

---

### `/watchlist sync`

Sync your watchlist directly from your linked MAL or AniList account (no file upload required).

| Property | Value |
|---|---|
| Category | Watchlist |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `source` | Choice: `mal` / `anilist` | ✅ | Account to pull from (must be linked via `/linkprofile`) |
| `kind` | Choice: `anime` / `manga` / `both` | ❌ | What to sync (default: `both`) |

**Behaviour:**
- MAL: calls Jikan `users/{name}/animelist` and `mangalist`.
- AniList: calls `MediaListCollection` GraphQL query.
- Upserts entries; deduplicates by id.

**Example:**
```
/watchlist sync source:anilist kind:anime
/watchlist sync source:mal kind:both
```

---

## Profile Commands

---

### `/linkprofile mal`

Link your MyAnimeList account using a bio-token verification flow.

| Property | Value |
|---|---|
| Category | Profile |
| Visibility | Private (ephemeral) |
| Guild only | No (works in DMs) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `username` | String | ✅ | Your MAL username |

**Verification flow:**
1. Run the command — the bot confirms the username exists on MAL and responds with a `LORA-XXXX` token.
2. Add the token anywhere in your MAL profile bio (About Me section).
3. Run the **same command again** — the bot reads your bio, finds the token, and completes the link.
4. Token expires after 10 minutes if not verified.

**Behaviour:** Updates only the `mal_username` column — never touches your AniList link (Bug 7 fix).

**Example:**
```
/linkprofile mal username:YourMALUsername
```

---

### `/linkprofile anilist`

Link your AniList account using a bio-token verification flow.

| Property | Value |
|---|---|
| Category | Profile |
| Visibility | Private (ephemeral) |
| Guild only | No (works in DMs) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `username` | String | ✅ | Your AniList username |

**Verification flow:** Identical to MAL — add the `LORA-XXXX` token to your AniList bio settings, then re-run the command within 10 minutes.

**Behaviour:** Updates only the `anilist_username` column — never touches your MAL link (Bug 7 fix).

**Example:**
```
/linkprofile anilist username:YourAniListUsername
```

---

### `/linkedprofile view`

View your currently linked MAL and AniList profiles.

| Property | Value |
|---|---|
| Category | Profile |
| Visibility | Private (ephemeral) |

**Options:** None.

**Response embed:**
- Title: `🔗 Your linked profiles`
- Shows MAL and AniList usernames (or `_not linked_` if absent)
- Color: blue

**Example:**
```
/linkedprofile view
```

---

### `/linkedprofile unlink`

Unlink one of your linked anime tracking accounts.

| Property | Value |
|---|---|
| Category | Profile |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `platform` | Choice: `MyAnimeList` / `AniList` | ✅ | Which platform to unlink |

**Behaviour:** Sets the chosen platform's username column to `NULL`; leaves the other column untouched.

**Example:**
```
/linkedprofile unlink platform:MyAnimeList
```

---

### `/search-profile-mal`

Look up a MyAnimeList user profile.

| Property | Value |
|---|---|
| Category | Profile |
| Visibility | Public (ephemeral: false) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `username` | String | ❌ | MAL username to look up |
| `user` | User | ❌ | Discord user — uses their linked MAL account |

If neither option is provided, defaults to your own linked MAL account.

**Response embed fields:**
- Title: `📺 MAL — <username>`
- Bio (up to 600 chars), avatar thumbnail, MAL profile URL
- Anime stats: total entries, days watched, mean score
- Manga stats: total entries, mean score
- Favourite anime (up to 5)
- Color: orange

**Example:**
```
/search-profile-mal username:Pilot_kun
/search-profile-mal user:@friend
```

---

### `/search-profile-anilist`

Look up an AniList user profile.

| Property | Value |
|---|---|
| Category | Profile |
| Visibility | Public (ephemeral: false) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `username` | String | ❌ | AniList username |
| `user` | User | ❌ | Discord user — uses their linked AniList account |

If neither option is provided, defaults to your own linked AniList account.

**Response embed fields:**
- Title: `📺 AniList — <name>`
- Bio (up to 600 chars, HTML stripped), avatar thumbnail, AniList profile URL
- Anime stats: count, episodes watched, mean score
- Manga stats: count, chapters read, mean score
- Favourite anime (up to 5)
- Color: blue

**Example:**
```
/search-profile-anilist username:ullamua
/search-profile-anilist user:@friend
```

---

## Community Commands

---

### `/ping`

Check the bot's latency.

| Property | Value |
|---|---|
| Category | Community |
| Level-role bypass | Yes — always available regardless of level-role |

**Options:** None.

**Behaviour:** Sends an initial reply, then edits it to include the actual roundtrip time.

**Response embed:**
- Title: `🏓 Pong`
- Description: `Roundtrip: **Xms** / WS: **Yms**`
- Color: green

**Example:**
```
/ping
```

---

### `/help`

List every registered slash command with its description.

| Property | Value |
|---|---|
| Category | Community |
| Level-role bypass | Yes — always available |

**Options:** None.

**Behaviour:** Fetches live from `client.application.commands` — always reflects the current deployed command set (Bug 8 fix; no longer hardcoded).

**Response embed:**
- Title: `📖 LeviathanOracle commands`
- Description: sorted list of `</command:id> — description`
- Color: blue

**Example:**
```
/help
```

---

### `/report`

Submit a bug report or feature request via a Discord modal.

| Property | Value |
|---|---|
| Category | Community |
| Level-role bypass | Yes — always available |

**Options:** None — opens a modal.

**Modal fields:**

| Field | Max length | Required | Description |
|---|---|---|---|
| Short title | 100 | ✅ | One-line summary |
| Description | 1 000 | ✅ | Detailed description |
| Steps to reproduce | 1 000 | ❌ | Optional reproduction steps |

**Behaviour:**
- Submission is written to the `reports` table in the database (Bug 6 fix).
- If `REPORT_CHANNEL_ID` is set, a formatted embed is also posted to that channel.
- Modal listener is attached once on first use (idempotent across calls).

**Example:**
```
/report
```

---

### `/preference`

Configure your personal notification delivery and watchlist visibility.

| Property | Value |
|---|---|
| Category | Community |
| Visibility | Private (ephemeral) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `notification_type` | Choice: `DM` / `Channel (server)` | ❌ | How you receive airing notifications |
| `watchlist_visibility` | Choice: `Private` / `Public` | ❌ | Whether others can view your watchlist |
| `notification_channel` | Channel (Text) | ❌ | Specific channel for server notifications |

All options are optional — pass any combination to update, or none to view current settings.

**Response embed:**
- Title: `⚙️ Your preferences`
- Description: current notification type, watchlist visibility, and notification channel
- Color: blue

**Example:**
```
/preference notification_type:DM
/preference watchlist_visibility:Public
/preference notification_type:Channel notification_channel:#anime-pings
```

---

### `/set-levelrole set`

Require users to have a specific role to use any bot command.

| Property | Value |
|---|---|
| Category | Community |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `role` | Role | ✅ | Role users must have to use commands |

**Behaviour:** Stores `level_role_id` in `guild_settings`. Commands marked `bypassLevelRole: true` (`/ping`, `/help`, `/report`) remain accessible to everyone.

**Response embed:** `Level Role Set` with `Required: <@&role>` (green)

**Example:**
```
/set-levelrole set role:@VerifiedMember
```

---

### `/set-levelrole remove`

Remove the level-role requirement.

| Property | Value |
|---|---|
| Category | Community |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:** None.

**Behaviour:** Sets `level_role_id = NULL` in `guild_settings`.

**Response embed:** `Level Role Removed` (red)

**Example:**
```
/set-levelrole remove
```

---

### `/set-levelrole status`

View the current level-role configuration.

| Property | Value |
|---|---|
| Category | Community |
| Visibility | Private (ephemeral) |
| Permission | Manage Guild |
| Guild only | Yes |

**Options:** None.

**Response embed:**
- Shows current required role (or `No role requirement set.`)
- Color: blue (role set) / gray (no role)

**Example:**
```
/set-levelrole status
```

---

## Dev / Admin Commands

---

### `/trigger-notification`

Force a notification dispatch for a tracked anime. Useful for testing notification delivery without waiting for a real airing event.

| Property | Value |
|---|---|
| Category | Dev |
| Visibility | Private (ephemeral) |
| Permission | Administrator + Owner only |
| Guild only | No |
| Dev only | Yes (registers only in `DEV_GUILD_IDS`) |

**Options:**

| Option | Type | Required | Description |
|---|---|---|---|
| `anime_id` | Integer | ✅ | AniList ID of the anime to dispatch |
| `delay_seconds` | Integer (0–3 600) | ❌ | Schedule the dispatch N seconds in the future (default: 0 = immediate next tick) |
| `dry_run` | Boolean | ❌ | If `true`, show recipient counts without actually dispatching (default: false) |
| `force_resend` | Boolean | ❌ | If `true`, clears `sent_at` so an already-sent episode re-dispatches (default: false) |

**Behaviour:**
- Looks up the `schedules` table row for `anime_id`; errors if not tracked.
- Counts watchlist subscribers and role subscribers.
- `dry_run: true` → returns summary and exits without touching the DB.
- `force_resend: true` → sets `sent_at = NULL` so the dedup guard won't skip it.
- Sets `next_airing_at` to `now + delay_seconds`; the scheduler fires on its next tick after that.

**Response embeds:**
- `🧪 Dry run` with subscriber counts and note (orange)
- `✅ Triggered` with dispatch time as relative timestamp (green)
- `Not in schedule` if the anime is not in the `schedules` table (red)

**Example:**
```
/trigger-notification anime_id:163132
/trigger-notification anime_id:163132 dry_run:True
/trigger-notification anime_id:163132 force_resend:True delay_seconds:30
```

---

## Embed Colours Reference

| Colour key | Hex | Used for |
|---|---|---|
| `green` | `#57F287` | Success responses |
| `red` | `#ED4245` | Errors / not found |
| `blue` | `#5865F2` | Info / list responses |
| `orange` | `#FEE75C` | Warnings / dry-run / reports |
| `purple` | `#9B59B6` | Anime search results |
| `cyan` | `#1ABC9C` | Nyaa results |
| `gray` | `#99AAB5` | Neutral status |
| `#0099ff` | `#0099FF` | Airing notification embeds |

---

## Notification Embed Format

When a new episode airs, users and role-subscribed members receive:

```
Title:       New Episode of <Anime Title> Released!
Description: **Episode N is now available!**
             Aired at: <timestamp>
Thumbnail:   Cover image (if available in schedules table)
Color:       #0099ff
Footer:      Episode just released!
```

---

## Command Permissions Summary

| Command | Manage Guild | Manage Roles | Administrator | Owner | Level-role bypass |
|---|---|---|---|---|---|
| `/set-levelrole *` | ✅ | — | — | — | — |
| `/daily-schedule *` | ✅ | — | — | — | — |
| `/rolenotification *` | — | ✅ | — | — | — |
| `/trigger-notification` | — | — | ✅ | ✅ | — |
| `/ping` | — | — | — | — | ✅ |
| `/help` | — | — | — | — | ✅ |
| `/report` | — | — | — | — | ✅ |
| All others | — | — | — | — | — |
