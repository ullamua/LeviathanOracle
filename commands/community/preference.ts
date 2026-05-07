import { SlashCommandBuilder, type ChatInputCommandInteraction, ChannelType } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getDatabase } from '../../data/database';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('preference')
    .setDescription('Configure how you receive notifications')
    .addStringOption((o) => o.setName('notification_type').setDescription('How to be notified')
      .addChoices({ name: 'DM', value: 'dm' }, { name: 'Channel (server)', value: 'channel' }))
    .addStringOption((o) => o.setName('watchlist_visibility').setDescription('Visibility')
      .addChoices({ name: 'Private', value: 'private' }, { name: 'Public', value: 'public' }))
    .addChannelOption((o) => o.setName('notification_channel').setDescription('Channel for notifications').addChannelTypes(ChannelType.GuildText)),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const db = getDatabase();
    const userId = interaction.user.id;
    const ntype = interaction.options.getString('notification_type');
    const vis = interaction.options.getString('watchlist_visibility');
    const ch = interaction.options.getChannel('notification_channel');

    // upsert minimal row
    await db.query(
      db.type === 'postgres'
        ? 'INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING'
        : 'INSERT OR IGNORE INTO user_preferences (user_id) VALUES ($1)',
      [userId],
    );
    if (ntype) await db.query('UPDATE user_preferences SET notification_type = $1 WHERE user_id = $2', [ntype, userId]);
    if (vis) await db.query('UPDATE user_preferences SET watchlist_visibility = $1 WHERE user_id = $2', [vis, userId]);
    if (ch) await db.query('UPDATE user_preferences SET notification_channel_id = $1 WHERE user_id = $2', [ch.id, userId]);

    const { rows } = await db.query<{ notification_type: string | null; watchlist_visibility: string | null; notification_channel_id: string | null }>(
      'SELECT notification_type, watchlist_visibility, notification_channel_id FROM user_preferences WHERE user_id = $1', [userId],
    );
    const cur = rows[0];
    await interaction.editReply(interactionPrivate({
      title: '⚙️ Your preferences',
      description: `Notification type: **${cur?.notification_type || 'dm'}**\nWatchlist visibility: **${cur?.watchlist_visibility || 'private'}**\nNotification channel: ${cur?.notification_channel_id ? `<#${cur.notification_channel_id}>` : '_unset_'}`,
      color: 'blue',
    }));
  },
};

export default command;
