import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { searchManga, getMangaDetailsByMalId } from '../../anime/jikan';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('search-manga')
    .setDescription('Search for a manga on MyAnimeList')
    .addStringOption((o) => o.setName('query').setDescription('Manga title').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    if (!focused) return interaction.respond([]);
    const results = await searchManga(focused, 10).catch(() => []);
    await interaction.respond(
      results.slice(0, 25).map((m) => ({
        name: (m.title_english || m.title || 'Unknown').slice(0, 100),
        value: String(m.mal_id),
      })),
    );
  },
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const raw = interaction.options.getString('query', true);
    const id = Number(raw);
    let manga = null;
    if (!Number.isNaN(id) && id > 0) manga = await getMangaDetailsByMalId(id);
    if (!manga) {
      const results = await searchManga(raw, 1);
      manga = results[0] ?? null;
    }
    if (!manga) {
      await interaction.editReply(interactionPrivate({ title: 'No results', description: `Nothing found for **${raw}**.`, color: 'red' }));
      return;
    }
    const cover = manga.images.jpg.large_image_url || manga.images.jpg.image_url;
    await interaction.editReply(interactionPrivate({
      title: manga.title_english || manga.title,
      description: (manga.synopsis || '_No synopsis._').slice(0, 1500),
      thumbnail: cover,
      url: manga.url,
      color: 'orange',
      fields: [
        { name: 'Status', value: manga.status || '—' },
        { name: 'Volumes', value: String(manga.volumes ?? '—') },
        { name: 'Score', value: manga.score != null ? `${manga.score}/10` : '—' },
      ],
      footer: 'MyAnimeList',
    }, { ephemeral: false }));
  },
};

export default command;
