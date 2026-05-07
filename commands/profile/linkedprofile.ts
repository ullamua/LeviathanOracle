import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getProfile, unlinkProfile } from '../../profiles/profile-store';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('linkedprofile')
    .setDescription('View or unlink your linked anime profiles')
    .addSubcommand((s) => s.setName('view').setDescription('See what is linked'))
    .addSubcommand((s) => s.setName('unlink').setDescription('Unlink one platform')
      .addStringOption((o) => o.setName('platform').setDescription('mal or anilist').setRequired(true)
        .addChoices({ name: 'MyAnimeList', value: 'mal' }, { name: 'AniList', value: 'anilist' }))),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const sub = interaction.options.getSubcommand();
    if (sub === 'view') {
      const p = await getProfile(interaction.user.id);
      if (!p) return interaction.editReply(interactionPrivate({ title: 'No linked profiles', description: 'Use `/linkprofile start` to link one.', color: 'orange' }));
      return interaction.editReply(interactionPrivate({
        title: '🔗 Your linked profiles',
        description: `**MyAnimeList:** ${p.mal_username || '_not linked_'}\n**AniList:** ${p.anilist_username || '_not linked_'}`,
        color: 'blue',
      }));
    }
    if (sub === 'unlink') {
      const platform = interaction.options.getString('platform', true) as 'mal' | 'anilist';
      await unlinkProfile(interaction.user.id, platform);
      return interaction.editReply(interactionPrivate({ title: '✅ Unlinked', description: `Removed your ${platform === 'mal' ? 'MyAnimeList' : 'AniList'} link.`, color: 'green' }));
    }
  },
};

export default command;
