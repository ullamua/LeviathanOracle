import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction, PermissionFlagsBits } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getDatabase } from '../../data/database';
import { searchAnime, getAnimeByAniListId } from '../../anime/anilist';
import { ensureScheduleEntry } from '../../scheduling/scheduler';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName('rolenotification')
    .setDescription('Manage role-based anime notifications for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Pair a role with an anime')
      .addRoleOption((o) => o.setName('role').setDescription('Role to ping').setRequired(true))
      .addStringOption((o) => o.setName('anime').setDescription('Anime title').setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in (optional)')))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a role notification')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((o) => o.setName('anime').setDescription('Anime').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List role notifications in this server')),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    if (interaction.options.getSubcommand() === 'remove') {
      const { rows } = await getDatabase().query<{ anime_title: string; anime_id: number | null }>(
        'SELECT DISTINCT anime_title, anime_id FROM role_notifications WHERE guild_id = $1 LIMIT 25',
        [interaction.guildId],
      );
      return interaction.respond(rows.map((r) => ({ name: r.anime_title.slice(0, 100), value: String(r.anime_id ?? r.anime_title) })));
    }
    if (!focused) return interaction.respond([]);
    const results = await searchAnime(focused, 10).catch(() => []);
    await interaction.respond(results.slice(0, 25).map((a) => ({
      name: (a.title || a.title_romaji || 'Unknown').slice(0, 100),
      value: String(a.anilist_id),
    })));
  },

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const sub = interaction.options.getSubcommand();
    const db = getDatabase();
    const guildId = interaction.guildId!;

    if (sub === 'add') {
      const role = interaction.options.getRole('role', true);
      const raw = interaction.options.getString('anime', true);
      const channel = interaction.options.getChannel('channel');
      const id = Number(raw);
      const anime = !Number.isNaN(id) && id > 0 ? await getAnimeByAniListId(id) : (await searchAnime(raw, 1))[0];
      if (!anime) return interaction.editReply(interactionPrivate({ title: 'Not found', description: `Nothing matched **${raw}**.`, color: 'red' }));
      await db.query(
        db.type === 'postgres'
          ? 'INSERT INTO role_notifications (role_id, guild_id, anime_title, anime_id, role_notification_channel_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (role_id, anime_id) DO UPDATE SET role_notification_channel_id = EXCLUDED.role_notification_channel_id'
          : 'INSERT OR REPLACE INTO role_notifications (role_id, guild_id, anime_title, anime_id, role_notification_channel_id) VALUES ($1,$2,$3,$4,$5)',
        [role.id, guildId, anime.title || anime.title_romaji || raw, anime.anilist_id, channel?.id ?? null],
      );
      await ensureScheduleEntry(anime.anilist_id, anime.title || anime.title_romaji || raw);
      return interaction.editReply(interactionPrivate({ title: '✅ Linked', description: `<@&${role.id}> will be pinged for **${anime.title}**.`, color: 'green' }));
    }
    if (sub === 'remove') {
      const role = interaction.options.getRole('role', true);
      const raw = interaction.options.getString('anime', true);
      const id = Number(raw);
      const r = !Number.isNaN(id) && id > 0
        ? await db.query('DELETE FROM role_notifications WHERE guild_id = $1 AND role_id = $2 AND anime_id = $3', [guildId, role.id, id])
        : await db.query('DELETE FROM role_notifications WHERE guild_id = $1 AND role_id = $2 AND LOWER(anime_title) = LOWER($3)', [guildId, role.id, raw]);
      return interaction.editReply(interactionPrivate({ title: r.rowCount > 0 ? '🗑️ Removed' : 'Not found', description: r.rowCount > 0 ? 'Removed.' : 'No matching pairing.', color: r.rowCount > 0 ? 'green' : 'red' }));
    }
    if (sub === 'list') {
      const { rows } = await db.query<{ role_id: string; anime_title: string }>('SELECT role_id, anime_title FROM role_notifications WHERE guild_id = $1 ORDER BY anime_title', [guildId]);
      const desc = rows.length ? rows.map((r) => `<@&${r.role_id}> → **${r.anime_title}**`).join('\n') : '_No role notifications configured._';
      return interaction.editReply(interactionPrivate({ title: '🔔 Role notifications', description: desc.slice(0, 3500), color: 'blue' }));
    }
  },
};

export default command;
