import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getAniListUserProfile } from '../../anime/anilist';
import { getProfile } from '../../profiles/profile-store';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('search-profile-anilist')
    .setDescription('Look up an AniList profile')
    .addStringOption((o) => o.setName('username').setDescription('AniList username (defaults to your linked one)'))
    .addUserOption((o) => o.setName('user').setDescription('Discord user (uses their linked AniList)')),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    let username = interaction.options.getString('username') || undefined;
    const targetUser = interaction.options.getUser('user') || (username ? null : interaction.user);
    if (!username && targetUser) {
      const p = await getProfile(targetUser.id);
      username = p?.anilist_username ?? undefined;
    }
    if (!username) return interaction.editReply(interactionPrivate({ title: 'No username', description: 'Either pass a username or link your AniList with `/linkprofile`.', color: 'red' }));
    const user = await getAniListUserProfile(username);
    if (!user) return interaction.editReply(interactionPrivate({ title: 'Not found', description: `No AniList user **${username}**.`, color: 'red' }));
    const a = user.statistics.anime;
    const m = user.statistics.manga;
    await interaction.editReply(interactionPrivate({
      title: `📺 AniList — ${user.name}`,
      description: (user.about || '_No bio._').slice(0, 600).replace(/<[^>]*>/g, ''),
      thumbnail: user.avatar.large || undefined,
      url: `https://anilist.co/user/${encodeURIComponent(user.name)}`,
      color: 'blue',
      fields: [
        { name: 'Anime', value: `${a.count} entries · ${a.episodesWatched} eps · mean ${a.meanScore}` },
        { name: 'Manga', value: `${m.count} entries · ${m.chaptersRead} ch · mean ${m.meanScore}` },
        { name: 'Favourite anime', value: user.favourites.anime.nodes.slice(0, 5).map((n) => n.title.english || n.title.romaji || n.title.native).join(', ') || '—' },
      ],
    }, { ephemeral: false }));
  },
};

export default command;
