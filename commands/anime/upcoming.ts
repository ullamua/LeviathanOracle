import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getScheduleByType } from '../../anime/animeschedule';
import { interactionPrivate } from '../../ui/components-v2';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('upcoming')
    .setDescription('Show upcoming anime episodes for the next 7 days'),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const all = await getScheduleByType('sub');
    const now = Date.now();
    const upcoming = all
      .map((it) => ({ ...it, ts: new Date(it.episodeDate).getTime() }))
      .filter((it) => it.ts >= now && it.ts <= now + 7 * 86_400_000)
      .sort((a, b) => a.ts - b.ts);

    const grouped = new Map<string, string[]>();
    for (const it of upcoming) {
      const day = new Date(it.ts).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      const title = it.title || it.english || it.title_english || it.title_romaji || '(unknown)';
      const ep = it.episodeNumber ?? it.episode ?? '?';
      const line = `• **${title}** — Ep ${ep} · <t:${Math.floor(it.ts / 1000)}:R>`;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(line);
    }
    const desc = DAYS
      .map((d) => d[0].toUpperCase() + d.slice(1))
      .filter((d) => grouped.has(d))
      .map((d) => `**${d}**\n${grouped.get(d)!.slice(0, 8).join('\n')}`)
      .join('\n\n')
      .slice(0, 3500);

    await interaction.editReply(interactionPrivate({
      title: '📅 Upcoming anime (next 7 days)',
      description: desc || '_Nothing scheduled._',
      color: 'blue',
    }, { ephemeral: false }));
  },
};

export default command;
