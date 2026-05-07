# Setup guide — LeviathanOracle

## 1. Create the Discord application

1. Visit <https://discord.com/developers/applications> → **New Application**.
2. Under **Bot**, click **Add Bot** and copy the **token** → `DISCORD_TOKEN`.
3. Copy the **Application ID** (top of General Information) → `BOT_ID`.
4. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**.
5. Under **OAuth2 → URL Generator** select scopes `bot` + `applications.commands`, plus permissions:
   - Send Messages, Embed Links, Attach Files
   - Read Message History
   - Manage Roles (only required for `/rolenotification`, `/set-levelrole`)
6. Visit the generated URL to invite the bot to your test server.

## 2. AnimeSchedule API token

Register at <https://animeschedule.net/users/sign-up> → **Profile → API** → generate a token → `ANIMESCHEDULE_TOKEN`.

## 3. Get your owner ID

Discord → **User Settings → Advanced → Developer Mode**, then right-click yourself → **Copy User ID** → `OWNER_IDS=<your id>`.

## 4. Configure `.env`

```bash
cp .env.example .env
$EDITOR .env
```

Required:
- `DISCORD_TOKEN`
- `BOT_ID`
- `OWNER_IDS`
- `ANIMESCHEDULE_TOKEN`

Optional but recommended:
- `REPORT_CHANNEL_ID` — where `/report` submissions land
- `DEV_GUILD_IDS` — guild(s) where dev-only commands register
- `REDIS_*` — enables caching + persistent queues
- `POSTGRES_*` / `DATABASE_URL` — switch from SQLite

## 5. Run

```bash
npm install
npm run dev          # tsx watch mode
# or
npm run build && npm start
```

Slash commands register globally on first ready (~1 minute propagation). Dev commands register instantly in `DEV_GUILD_IDS`.

## 6. Deployment options

| Target | File |
|---|---|
| Railway | `deploy/railway.toml` (set env vars in dashboard) |
| Render  | `deploy/render.yaml` |
| Docker  | `deploy/Dockerfile` |
| systemd | `deploy/leviathan-oracle.service` |

## 7. Common problems

| Symptom | Fix |
|---|---|
| **Missing permissions** | Re-invite using the OAuth2 URL with the correct scopes |
| **Unknown interaction** | Wait a few minutes for global commands to propagate |
| **Bot is offline** | Check `DISCORD_TOKEN`; check rate limits in logs |
| **Commands not showing** | Confirm `BOT_ID` matches your Application ID |
| **Daily schedule not posting** | Confirm `daily_schedule_enabled = true` and channel set via `/set-levelrole daily-schedule` |
