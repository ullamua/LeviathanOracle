import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { setDailyScheduleChannel, setDailyScheduleEnabled, setDailyScheduleTime, getGuildSettings } from '../../guild/guild-store';
import { interactionPrivate } from '../../ui/components-v2';
import { getDailyScheduleByDay } from '../../anime/animeschedule';

function parseTimeInput(input: string | null): { valid: boolean; value?: string } {
  if (!input || !input.trim()) return { valid: true, value: '05:00' };
  const raw = input.trim();
  const m12 = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*([aApP][mM])$/);
  if (m12) {
    let h = Number(m12[1]); const m = Number(m12[2] || '0'); const suf = m12[3].toLowerCase();
    if (h < 1 || h > 12) return { valid: false };
    if (suf === 'pm' && h !== 12) h += 12;
    if (suf === 'am' && h === 12) h = 0;
    return { valid: true, value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }
  const m24 = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m24) return { valid: true, value: `${String(Number(m24[1])).padStart(2, '0')}:${m24[2]}` };
  return { valid: false };
}

const command: SlashCommand = {
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName('daily-schedule')
    .setDescription('Configure automatic daily anime schedule posting')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('enable').setDescription('Enable automatic daily schedule posting')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName('time').setDescription('UTC time — 24h (17:30) or 12h (5:30 PM)')))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable automatic daily schedule posting'))
    .addSubcommand((s) => s.setName('status').setDescription('View current daily schedule settings'))
    .addSubcommand((s) => s.setName('preview').setDescription("Preview today's schedule")),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'enable') {
      const cur = await getGuildSettings(guildId);
      const channel = interaction.options.getChannel('channel');
      const parsed = parseTimeInput(interaction.options.getString('time'));
      if (!parsed.valid) {
        return interaction.editReply(interactionPrivate({
          title: 'Invalid Time Format',
          description: 'Use `HH:MM` (24-hour) or `h[:mm] AM/PM`. Examples: `05:00`, `17:30`, `5 PM`, `5:30 PM`.',
          color: 'red',
        }));
      }
      const channelId = channel?.id || cur?.daily_schedule_channel_id || null;
      if (!channelId) {
        return interaction.editReply(interactionPrivate({
          title: 'Channel Required',
          description: 'Pass `channel:#somewhere` the first time you enable.',
          color: 'red',
        }));
      }
      await setDailyScheduleChannel(guildId, channelId);
      if (parsed.value) await setDailyScheduleTime(guildId, parsed.value);
      await setDailyScheduleEnabled(guildId, true);
      return interaction.editReply(interactionPrivate({
        title: '✅ Daily Schedule Enabled',
        description: `Posting in <#${channelId}> daily at **${parsed.value} UTC**.`,
        color: 'green',
      }));
    }
    if (sub === 'disable') {
      await setDailyScheduleEnabled(guildId, false);
      return interaction.editReply(interactionPrivate({ title: '🔕 Daily Schedule Disabled', color: 'red' }));
    }
    if (sub === 'status') {
      const s = await getGuildSettings(guildId);
      const enabled = s?.daily_schedule_enabled === 'true';
      const time = s?.daily_schedule_time || '05:00';
      const ch = s?.daily_schedule_channel_id ? `<#${s.daily_schedule_channel_id}>` : '`Not set`';
      return interaction.editReply(interactionPrivate({
        title: 'Daily Schedule Status',
        description: enabled ? `**Enabled** in ${ch} at **${time} UTC**.` : `Currently **disabled**. Configured time: **${time} UTC**.`,
        color: enabled ? 'blue' : 'gray',
      }));
    }
    // preview
    const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date());
    const items = await getDailyScheduleByDay(today, 'sub').catch(() => []);
    if (!items.length) {
      return interaction.editReply(interactionPrivate({ title: 'No Schedule', description: 'Nothing airing today.', color: 'gray' }));
    }
    items.sort((a, b) => new Date(a.episodeDate).getTime() - new Date(b.episodeDate).getTime());
    return interaction.editReply(interactionPrivate({
      title: `📅 ${today}'s Anime Schedule`,
      description: `**${items.length}** shows airing today`,
      fields: items.slice(0, 25).map((a) => ({
        name: a.english || a.title || 'Unknown',
        value: `Ep ${a.episodeNumber ?? '?'} — <t:${Math.floor(new Date(a.episodeDate).getTime() / 1000)}:t>`,
      })),
      color: 'blue',
      footer: items.length > 25 ? `+${items.length - 25} more…` : undefined,
    }));
  },
};

export default command;
