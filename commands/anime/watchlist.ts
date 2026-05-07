import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  AttachmentBuilder,
} from "discord.js";
import type { SlashCommand } from "../../bot/command-types";
import { getDatabase } from "../../data/database";
import {
  searchAnime,
  getAnimeByAniListId,
  getAnimeByMalId,
  getAniListMediaList,
} from "../../anime/anilist";
import {
  getMalAnimeList,
  getMalMangaList,
  searchManga,
} from "../../anime/jikan";
import { interactionPrivate } from "../../ui/components-v2";
import { ensureScheduleEntry } from "../../scheduling/scheduler";
import { getProfile } from "../../profiles/profile-store";
import {
  toMalXML,
  toAniListJSON,
  parseImport,
  type ImportEntry,
  type WatchlistRow,
} from "../../converters/watchlist-converters";
import axios from "axios";

/**
 * Notes:
 *  - `add` now takes a `kind` (anime|manga). Manga uses Jikan; anime uses AniList.
 *  - `view` paginates 25/page with a thumbnail-rich listing instead of a flat dump.
 *  - `export` returns the file as a *plain* attachment (no v2 container) so
 *    Discord renders the download button correctly.
 *  - New `sync` subcommand pulls directly from a linked MAL/AniList account.
 *  - New `clear` keeps original behaviour but accepts a `kind` filter.
 */

const PAGE_SIZE = 25;
const DEFAULT_KIND: "anime" | "manga" = "anime";

interface WLRow {
  anime_id: number | null;
  anime_title: string;
  kind: "anime" | "manga" | null;
  status: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function upsertEntry(
  userId: string,
  username: string,
  kind: "anime" | "manga",
  animeId: number | null,
  title: string,
  status: string | null,
): Promise<void> {
  const db = getDatabase();
  if (animeId == null) {
    // No id → fall back to title-keyed insert (legacy).
    await db.query(
      db.type === "postgres"
        ? "INSERT INTO watchlists (user_id, discord_username, anime_title, anime_id, kind, status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, anime_title) DO NOTHING"
        : "INSERT OR IGNORE INTO watchlists (user_id, discord_username, anime_title, anime_id, kind, status) VALUES ($1,$2,$3,$4,$5,$6)",
      [userId, username, title, null, kind, status],
    );
    return;
  }
  await db.query(
    db.type === "postgres"
      ? `INSERT INTO watchlists (user_id, discord_username, anime_title, anime_id, kind, status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, kind, anime_id) DO UPDATE SET anime_title = EXCLUDED.anime_title, status = COALESCE(EXCLUDED.status, watchlists.status)`
      : `INSERT INTO watchlists (user_id, discord_username, anime_title, anime_id, kind, status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, kind, anime_id) DO UPDATE SET anime_title = excluded.anime_title, status = COALESCE(excluded.status, watchlists.status)`,
    [userId, username, title, animeId, kind, status],
  );
}

async function importBatch(
  userId: string,
  username: string,
  entries: ImportEntry[],
): Promise<{ added: number; failed: number }> {
  let added = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      let animeId: number | null = entry.id || null;
      let title = entry.title;
      if (entry.kind === "anime") {
        // Resolve MAL ids → AniList ids when possible.
        const anime =
          entry.type === "mal"
            ? await getAnimeByMalId(entry.id).catch(() => null)
            : await getAnimeByAniListId(entry.id).catch(() => null);
        if (anime) {
          animeId = anime.anilist_id;
          title = anime.title || anime.title_romaji || title;
        }
      }
      // Fallback title for placeholder entries.
      if (!title) title = `Imported #${entry.id}`;
      await upsertEntry(
        userId,
        username,
        entry.kind,
        animeId,
        title,
        entry.status ?? null,
      );
      if (entry.kind === "anime" && animeId) {
        await ensureScheduleEntry(animeId, title).catch(() => null);
      }
      added += 1;
    } catch {
      failed += 1;
    }
    await sleep(250);
  }
  return { added, failed };
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("watchlist")
    .setDescription("Manage your personal anime & manga watchlist")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add an entry")
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription("Title to add")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("anime or manga")
            .addChoices(
              { name: "Anime", value: "anime" },
              { name: "Manga", value: "manga" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove an entry")
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription("Title to remove")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("anime or manga")
            .addChoices(
              { name: "Anime", value: "anime" },
              { name: "Manga", value: "manga" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View your watchlist")
        .addIntegerOption((o) =>
          o
            .setName("page")
            .setDescription("Page number (default 1)")
            .setMinValue(1),
        )
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("Filter by kind")
            .addChoices(
              { name: "Anime", value: "anime" },
              { name: "Manga", value: "manga" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("clear")
        .setDescription("Remove every entry")
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("Only clear one kind")
            .addChoices(
              { name: "Anime", value: "anime" },
              { name: "Manga", value: "manga" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("export")
        .setDescription("Export your watchlist")
        .addStringOption((o) =>
          o
            .setName("format")
            .setDescription("mal or anilist")
            .setRequired(true)
            .addChoices(
              { name: "MAL XML", value: "mal" },
              { name: "AniList JSON", value: "anilist" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("import")
        .setDescription("Import a watchlist file")
        .addAttachmentOption((o) =>
          o
            .setName("file")
            .setDescription("MAL XML or AniList JSON")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("format")
            .setDescription("mal or anilist")
            .setRequired(true)
            .addChoices(
              { name: "MAL XML", value: "mal" },
              { name: "AniList JSON", value: "anilist" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("sync")
        .setDescription("Sync from a linked MAL/AniList account")
        .addStringOption((o) =>
          o
            .setName("source")
            .setDescription("mal or anilist")
            .setRequired(true)
            .addChoices(
              { name: "MyAnimeList", value: "mal" },
              { name: "AniList", value: "anilist" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("What to sync (default: both)")
            .addChoices(
              { name: "Anime only", value: "anime" },
              { name: "Manga only", value: "manga" },
              { name: "Both", value: "both" },
            ),
        ),
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    const sub = interaction.options.getSubcommand();
    const kind =
      (interaction.options.getString("kind") as "anime" | "manga" | null) ??
      DEFAULT_KIND;

    if (sub === "remove") {
      const { rows } = await getDatabase().query<{
        anime_title: string;
        anime_id: number | null;
      }>(
        `SELECT anime_id, anime_title FROM watchlists
         WHERE user_id = $1 AND COALESCE(kind,'anime') = $2 AND LOWER(anime_title) LIKE $3
         ORDER BY anime_title LIMIT 25`,
        [interaction.user.id, kind, `%${focused.toLowerCase()}%`],
      );
      return interaction.respond(
        rows.map((r) => ({
          name: r.anime_title.slice(0, 100),
          value: String(r.anime_id ?? r.anime_title),
        })),
      );
    }
    if (!focused) return interaction.respond([]);
    if (kind === "manga") {
      const results = await searchManga(focused, 10).catch(() => []);
      return interaction.respond(
        results.slice(0, 25).map((m) => ({
          name: (m.title || `Manga #${m.mal_id}`).slice(0, 100),
          value: `mal:${m.mal_id}`,
        })),
      );
    }
    const results = await searchAnime(focused, 10).catch(() => []);
    await interaction.respond(
      results.slice(0, 25).map((a) => ({
        name: (a.title || a.title_romaji || "Unknown").slice(0, 100),
        value: String(a.anilist_id),
      })),
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const sub = interaction.options.getSubcommand();
    const db = getDatabase();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const kindOpt = interaction.options.getString("kind") as
      | "anime"
      | "manga"
      | null;
    const kind: "anime" | "manga" = kindOpt ?? DEFAULT_KIND;

    if (sub === "add") {
      const raw = interaction.options.getString("title", true);
      let animeId: number | null = null;
      let title = raw;
      let thumbnail: string | undefined;

      if (kind === "manga") {
        const malId = raw.startsWith("mal:")
          ? Number(raw.slice(4))
          : Number(raw);
        let manga = null;
        if (!Number.isNaN(malId) && malId > 0) {
          const r = await searchManga(
            raw.startsWith("mal:") ? "" : raw,
            1,
          ).catch(() => []);
          manga = r[0] ?? null;
          // Direct title lookup if id-shaped lookup yields nothing
          if (!manga) {
            const r2 = await searchManga(raw, 1).catch(() => []);
            manga = r2[0] ?? null;
          }
        } else {
          const r = await searchManga(raw, 1).catch(() => []);
          manga = r[0] ?? null;
        }
        if (!manga) {
          return interaction.editReply(
            interactionPrivate({
              title: "Not found",
              description: `No manga matched **${raw}**.`,
              color: "red",
            }),
          );
        }
        animeId = manga.mal_id;
        title = manga.title;
        thumbnail =
          manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url;
      } else {
        const id = Number(raw);
        const anime =
          !Number.isNaN(id) && id > 0
            ? await getAnimeByAniListId(id)
            : ((await searchAnime(raw, 1))[0] ?? null);
        if (!anime) {
          return interaction.editReply(
            interactionPrivate({
              title: "Not found",
              description: `Nothing matched **${raw}**.`,
              color: "red",
            }),
          );
        }
        animeId = anime.anilist_id;
        title = anime.title || anime.title_romaji || raw;
        thumbnail = anime.cover_image || undefined;
      }

      await upsertEntry(
        userId,
        username,
        kind,
        animeId,
        title,
        "plan_to_watch",
      );
      if (kind === "anime" && animeId)
        await ensureScheduleEntry(animeId, title);
      return interaction.editReply(
        interactionPrivate({
          title: "✅ Added to watchlist",
          description: `**${title}** is now on your ${kind} watchlist.`,
          thumbnail,
          color: "green",
        }),
      );
    }

    if (sub === "remove") {
      const raw = interaction.options.getString("title", true);
      const id = Number(raw);
      const result =
        !Number.isNaN(id) && id > 0
          ? await db.query(
              "DELETE FROM watchlists WHERE user_id = $1 AND COALESCE(kind,'anime') = $2 AND anime_id = $3",
              [userId, kind, id],
            )
          : await db.query(
              "DELETE FROM watchlists WHERE user_id = $1 AND COALESCE(kind,'anime') = $2 AND LOWER(anime_title) = LOWER($3)",
              [userId, kind, raw],
            );
      return interaction.editReply(
        interactionPrivate({
          title: result.rowCount > 0 ? "🗑️ Removed" : "Not found",
          description:
            result.rowCount > 0
              ? `Removed from your ${kind} watchlist.`
              : "Nothing matched on your watchlist.",
          color: result.rowCount > 0 ? "green" : "red",
        }),
      );
    }

    if (sub === "view") {
      const filterKind = kindOpt;
      const page = Math.max(1, interaction.options.getInteger("page") ?? 1);
      const params: unknown[] = [userId];
      let where = "user_id = $1";
      if (filterKind) {
        where += " AND COALESCE(kind,'anime') = $2";
        params.push(filterKind);
      }
      const { rows } = await db.query<WLRow>(
        `SELECT anime_id, anime_title, kind, status FROM watchlists WHERE ${where} ORDER BY COALESCE(kind,'anime'), anime_title`,
        params,
      );
      if (!rows.length) {
        return interaction.editReply(
          interactionPrivate({
            title: "📋 Your watchlist",
            description:
              "_Empty._ Use `/watchlist add` or `/watchlist sync` to start.",
            color: "blue",
          }),
        );
      }
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      const safePage = Math.min(page, totalPages);
      const slice = rows.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
      );
      const fmt = (r: WLRow, i: number) => {
        const idx = (safePage - 1) * PAGE_SIZE + i + 1;
        const tag = r.kind === "manga" ? "📖" : "📺";
        const status = r.status ? ` _(${r.status.replace(/_/g, " ")})_` : "";
        return `${idx}. ${tag} **${r.anime_title}**${status}`;
      };
      return interaction.editReply(
        interactionPrivate({
          title: `📋 Your watchlist${filterKind ? ` — ${filterKind}` : ""}`,
          description: slice.map(fmt).join("\n"),
          footer: `Page ${safePage}/${totalPages} · ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`,
          color: "blue",
        }),
      );
    }

    if (sub === "clear") {
      const filterKind = kindOpt;
      const result = filterKind
        ? await db.query(
            "DELETE FROM watchlists WHERE user_id = $1 AND COALESCE(kind,'anime') = $2",
            [userId, filterKind],
          )
        : await db.query("DELETE FROM watchlists WHERE user_id = $1", [userId]);
      return interaction.editReply(
        interactionPrivate({
          title: "🧹 Cleared",
          description: `Removed ${result.rowCount} entr${result.rowCount === 1 ? "y" : "ies"}${filterKind ? ` (${filterKind})` : ""}.`,
          color: "green",
        }),
      );
    }

    if (sub === "export") {
      const fmt = interaction.options.getString("format", true) as
        | "mal"
        | "anilist";
      const { rows } = await db.query<WatchlistRow>(
        "SELECT anime_id, anime_title, COALESCE(kind,'anime') AS kind, status FROM watchlists WHERE user_id = $1",
        [userId],
      );
      const data = fmt === "mal" ? toMalXML(rows) : toAniListJSON(rows);
      const file = new AttachmentBuilder(Buffer.from(data, "utf8"), {
        name: `watchlist.${fmt === "mal" ? "xml" : "json"}`,
      });
      // Plain reply (no v2 container) so Discord renders a real download button.
      return interaction.editReply({
        content: `📤 Exported **${rows.length}** entr${rows.length === 1 ? "y" : "ies"} as **${fmt}**.`,
        files: [file],
      });
    }

    if (sub === "import") {
      const file = interaction.options.getAttachment("file", true);
      const fmt = interaction.options.getString("format", true) as
        | "mal"
        | "anilist";
      const res = await axios.get<string>(file.url, {
        responseType: "text",
        timeout: 15_000,
      });
      const entries = parseImport(fmt, res.data);
      if (!entries || entries.length === 0) {
        return interaction.editReply(
          interactionPrivate({
            title: "Invalid file",
            description: "Could not parse the file.",
            color: "red",
          }),
        );
      }
      await interaction.editReply(
        interactionPrivate({
          title: "📥 Importing…",
          description: `Processing **${entries.length}** entries. This may take a minute.`,
          color: "orange",
        }),
      );
      const { added, failed } = await importBatch(userId, username, entries);
      return interaction.editReply(
        interactionPrivate({
          title: "📥 Import complete",
          description: `Imported **${added}** entries${failed ? `, **${failed}** failed` : ""}.`,
          color: "green",
        }),
      );
    }

    if (sub === "sync") {
      const source = interaction.options.getString("source", true) as
        | "mal"
        | "anilist";
      const which =
        (interaction.options.getString("kind") as
          | "anime"
          | "manga"
          | "both"
          | null) ?? "both";
      const profile = await getProfile(userId);
      const accountName =
        source === "mal" ? profile?.mal_username : profile?.anilist_username;
      if (!accountName) {
        return interaction.editReply(
          interactionPrivate({
            title: "🔗 No linked account",
            description: `Link your ${source === "mal" ? "MyAnimeList" : "AniList"} account first with \`/linkprofile ${source} <username>\`.`,
            color: "red",
          }),
        );
      }
      await interaction.editReply(
        interactionPrivate({
          title: "🔄 Syncing…",
          description: `Fetching ${which} from **${accountName}** on ${source === "mal" ? "MAL" : "AniList"}.`,
          color: "orange",
        }),
      );
      const entries: ImportEntry[] = [];
      try {
        if (source === "mal") {
          if (which !== "manga") {
            const list = await getMalAnimeList(accountName);
            for (const e of list)
              entries.push({
                id: e.mal_id,
                title: e.title,
                type: "mal",
                kind: "anime",
                status: e.status,
              });
          }
          if (which !== "anime") {
            const list = await getMalMangaList(accountName);
            for (const e of list)
              entries.push({
                id: e.mal_id,
                title: e.title,
                type: "mal",
                kind: "manga",
                status: e.status,
              });
          }
        } else {
          if (which !== "manga") {
            const list = await getAniListMediaList(accountName, "ANIME");
            for (const e of list)
              entries.push({
                id: e.media.id,
                title: e.media.title,
                type: "ani",
                kind: "anime",
                status: e.status,
              });
          }
          if (which !== "anime") {
            const list = await getAniListMediaList(accountName, "MANGA");
            for (const e of list)
              entries.push({
                id: e.media.idMal ?? e.media.id,
                title: e.media.title,
                type: e.media.idMal ? "mal" : "ani",
                kind: "manga",
                status: e.status,
              });
          }
        }
      } catch (err) {
        return interaction.editReply(
          interactionPrivate({
            title: "Sync failed",
            description: `Could not fetch your list: ${(err as Error).message}`,
            color: "red",
          }),
        );
      }
      if (!entries.length) {
        return interaction.editReply(
          interactionPrivate({
            title: "Nothing to sync",
            description: `**${accountName}** has no public ${which} entries.`,
            color: "orange",
          }),
        );
      }
      const { added, failed } = await importBatch(userId, username, entries);
      return interaction.editReply(
        interactionPrivate({
          title: "✅ Sync complete",
          description: `Pulled **${entries.length}** from **${accountName}** · imported **${added}**${failed ? `, **${failed}** failed` : ""}.`,
          color: "green",
        }),
      );
    }
  },
};

export default command;
