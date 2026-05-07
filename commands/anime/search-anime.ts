import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { searchAnime, getAnimeByAniListId } from '../../anime/anilist';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('search-anime')
    .setDescription('Search for an anime on AniList')
    .addStringOption((o) => o.setName('query').setDescription('Anime title').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    if (!focused) return interaction.respond([]);
    const results = await searchAnime(focused, 10).catch(() => []);
    await interaction.respond(
      results.slice(0, 25).map((a) => ({
        name: (a.title || a.title_romaji || a.title_native || 'Unknown').slice(0, 100),
        value: String(a.anilist_id),
      })),
    );
  },
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const raw = interaction.options.getString('query', true);
    const id = Number(raw);
    let anime = null;
    if (!Number.isNaN(id) && id > 0) anime = await getAnimeByAniListId(id);
    if (!anime) {
      const results = await searchAnime(raw, 1);
      anime = results[0] ?? null;
    }
    if (!anime) {
      await interaction.editReply(interactionPrivate({ title: 'No results', description: `Nothing found for **${raw}**.`, color: 'red' }));
      return;
    }
    await interaction.editReply(interactionPrivate({
      title: anime.title || 'Unknown',
      description: (anime.description || '_No synopsis._').slice(0, 1500),
      thumbnail: anime.cover_image || undefined,
      url: anime.url,
      color: 'purple',
      fields: [
        { name: 'Status', value: anime.status || '—' },
        { name: 'Episodes', value: String(anime.episodes ?? '—') },
        { name: 'Score', value: anime.average_score != null ? `${anime.average_score}/100` : '—' },
        { name: 'Genres', value: anime.genres.join(', ') || '—' },
        ...(anime.next_airing ? [{ name: 'Next episode', value: `Ep ${anime.next_airing.episode} · <t:${anime.next_airing.airing_at}:R>` }] : []),
      ],
      footer: 'AniList',
    }, { ephemeral: false }));
  },
};

export default command;
