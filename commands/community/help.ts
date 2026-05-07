import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { interactionPrivate } from '../../ui/components-v2';

const command: SlashCommand = {
  bypassLevelRole: true,
  data: new SlashCommandBuilder().setName('help').setDescription('List every available command'),
  async execute(interaction: ChatInputCommandInteraction) {
    const cmds = await interaction.client.application?.commands.fetch();
    const lines = (cmds ? [...cmds.values()] : [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `</${c.name}:${c.id}> — ${c.description}`)
      .join('\n');
    await interaction.reply(interactionPrivate({
      title: '📖 LeviathanOracle commands',
      description: lines || '_No commands registered yet._',
      color: 'blue',
    }));
  },
};

export default command;
