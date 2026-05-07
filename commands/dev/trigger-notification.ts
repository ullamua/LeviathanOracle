import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getDatabase } from '../../data/database';
import { interactionPrivate } from '../../ui/components-v2';

/**
 * Admin/owner-only debug helper.
 *  - `anime_id`        - required AniList id to dispatch.
 *  - `delay_seconds`   - schedule the dispatch N seconds in the future
 *                        (defaults to 0 = immediate next tick).
 *  - `dry_run`         - if true, just report what would happen and which
 *                        users/roles would receive it. Does NOT touch sent_at.
 *  - `force_resend`    - if true, clears sent_at so the next tick re-dispatches
 *                        even if the episode was already sent.
 */
const command: SlashCommand = {
  devOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('trigger-notification')
    .setDescription('[ADMIN] Force a notification for an anime in the schedules table')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((o) => o.setName('anime_id').setDescription('AniList ID').setRequired(true))
    .addIntegerOption((o) => o.setName('delay_seconds').setDescription('Delay before dispatch (default 0)').setMinValue(0).setMaxValue(3600))
    .addBooleanOption((o) => o.setName('dry_run').setDescription('Show recipients without dispatching'))
    .addBooleanOption((o) => o.setName('force_resend').setDescription('Clear sent_at to allow re-dispatch')),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const id = interaction.options.getInteger('anime_id', true);
    const delay = interaction.options.getInteger('delay_seconds') ?? 0;
    const dryRun = interaction.options.getBoolean('dry_run') ?? false;
    const force = interaction.options.getBoolean('force_resend') ?? false;
    const db = getDatabase();

    const { rows } = await db.query<{ anime_id: number; anime_title: string; sent_at: number | null; next_airing_at: number | null }>(
      'SELECT anime_id, anime_title, sent_at, next_airing_at FROM schedules WHERE anime_id = $1',
      [id],
    );
    const sched = rows[0];
    if (!sched) {
      return interaction.editReply(interactionPrivate({
        title: 'Not in schedule',
        description: `Anime \`${id}\` is not tracked. Add it to a watchlist first.`,
        color: 'red',
      }));
    }

    const { rows: userCount } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM watchlists WHERE anime_id = $1', [id]);
    const { rows: roleCount } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM role_notifications WHERE anime_id = $1', [id]);

    const summary =
      `**${sched.anime_title}** (id \`${id}\`)\n` +
      `• Watchlist subscribers: **${userCount[0]?.n ?? 0}**\n` +
      `• Role subscribers: **${roleCount[0]?.n ?? 0}**\n` +
      `• Last sent: ${sched.sent_at ? `<t:${sched.sent_at}:R>` : '_never_'}\n` +
      `• Delay: **${delay}s** · Force resend: **${force}**`;

    if (dryRun) {
      return interaction.editReply(interactionPrivate({
        title: '🧪 Dry run',
        description: summary + '\n\n_Nothing dispatched. Re-run without `dry_run: true` to fire._',
        color: 'orange',
      }));
    }

    const target = Math.floor(Date.now() / 1000) + delay;
    if (force) {
      await db.query('UPDATE schedules SET next_airing_at = $1, sent_at = NULL WHERE anime_id = $2', [target, id]);
    } else {
      await db.query('UPDATE schedules SET next_airing_at = $1 WHERE anime_id = $2', [target, id]);
    }

    return interaction.editReply(interactionPrivate({
      title: '✅ Triggered',
      description: summary + `\n\nDispatch scheduled at <t:${target}:R> (next scheduler tick after that fires).`,
      color: 'green',
    }));
  },
};

export default command;
