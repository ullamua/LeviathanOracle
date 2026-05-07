import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getMalUserProfile } from '../../anime/jikan';
import { getProfile } from '../../profiles/profile-store';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('search-profile-mal')
    .setDescription('Look up a MyAnimeList profile')
    .addStringOption((o) => o.setName('username').setDescription('MAL username (defaults to your linked one)'))
    .addUserOption((o) => o.setName('user').setDescription('Discord user (uses their linked MAL)')),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    let username = interaction.options.getString('username') || undefined;
    const targetUser = interaction.options.getUser('user') || (username ? null : interaction.user);
    if (!username && targetUser) {
      const p = await getProfile(targetUser.id);
      username = p?.mal_username ?? undefined;
    }
    if (!username) return interaction.editReply(interactionPrivate({ title: 'No username', description: 'Either pass a username or link your MAL with `/linkprofile`.', color: 'red' }));
    const user = await getMalUserProfile(username);
    if (!user) return interaction.editReply(interactionPrivate({ title: 'Not found', description: `No MAL user **${username}**.`, color: 'red' }));
    const a = user.statistics?.anime;
    const m = user.statistics?.manga;
    await interaction.editReply(interactionPrivate({
      title: `📺 MAL — ${user.username}`,
      description: (user.about || '_No bio._').slice(0, 600),
      thumbnail: user.images.jpg.image_url,
      url: user.url,
      color: 'orange',
      fields: [
        ...(a ? [{ name: 'Anime', value: `${a.total_entries} entries · ${a.days_watched.toFixed(1)} days · mean ${a.mean_score}` }] : []),
        ...(m ? [{ name: 'Manga', value: `${m.total_entries} entries · mean ${m.mean_score}` }] : []),
        { name: 'Favourite anime', value: user.favorites?.anime.slice(0, 5).map((f) => f.title).join(', ') || '—' },
      ],
    }, { ephemeral: false }));
  },
};

export default command;
