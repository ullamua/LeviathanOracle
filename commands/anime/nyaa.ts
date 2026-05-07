import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { fetchRSSFeedWithRetries, filterEnglishAnimeItems } from '../../anime/nyaa-rss';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('nyaa')
    .setDescription('Search Nyaa.si for anime torrents (English subbed/dubbed only)')
    .addStringOption((o) => o.setName('query').setDescription('Search query').setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const q = interaction.options.getString('query', true);
    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q)}&c=1_2&f=0`;
    const feed = await fetchRSSFeedWithRetries(url).catch(() => ({ items: [] }));
    const items = filterEnglishAnimeItems(feed.items).slice(0, 10);
    if (!items.length) {
      return interaction.editReply(interactionPrivate({ title: 'No results', description: `No English releases found for **${q}**.`, color: 'red' }));
    }
    const description = items.map((it, i) => `**${i + 1}.** [${it.title.slice(0, 100)}](${it.link})`).join('\n');
    await interaction.editReply(interactionPrivate({
      title: `🌊 Nyaa results — ${q}`,
      description: description.slice(0, 3500),
      color: 'cyan',
    }));
  },
};

export default command;
