import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  bypassLevelRole: true,
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot latency'),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply(interactionPrivate({ title: 'Pinging…' }));
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.editReply(interactionPrivate({
      title: '🏓 Pong',
      description: `Roundtrip: **${latency}ms**\nWS: **${interaction.client.ws.ping}ms**`,
      color: 'green',
    }));
  },
};

export default command;
