import { SlashCommandBuilder, type ChatInputCommandInteraction, ModalSubmitInteraction, Events, TextInputStyle, TextChannel } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { getDatabase } from '../../data/database';
import { buildModal } from '../../ui/modal';
import { loadConfig } from '../../config/load';
import { interactionPrivate, v2 } from '../../ui/components-v2';
import { tracer } from '../../observability/tracer';

let listenerAttached = false;
function attachListener(client: ChatInputCommandInteraction['client']): void {
  if (listenerAttached) return;
  listenerAttached = true;
  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isModalSubmit() || i.customId !== 'report:modal') return;
    const modal = i as ModalSubmitInteraction;
    const title = modal.fields.getTextInputValue('title');
    const description = modal.fields.getTextInputValue('description');
    const steps = modal.fields.getTextInputValue('steps');
    const db = getDatabase();
    await db.query(
      'INSERT INTO reports (user_id, guild_id, title, description, steps) VALUES ($1, $2, $3, $4, $5)',
      [modal.user.id, modal.guildId, title, description, steps],
    );
    const cfg = loadConfig();
    if (cfg.bot.reportChannelId) {
      try {
        const ch = await modal.client.channels.fetch(cfg.bot.reportChannelId);
        if (ch instanceof TextChannel) {
          await ch.send({
            flags: 1 << 15,
            components: [v2({
              title: `📨 New report — ${title}`,
              description: `**By:** <@${modal.user.id}> (${modal.user.tag})\n**Guild:** ${modal.guildId || 'DM'}\n\n**Description**\n${description}\n\n**Steps to reproduce**\n${steps || '_(none)_'}`,
              color: 'orange',
            })],
          });
        }
      } catch (err) {
        tracer.warn('REPORT', 'Could not relay report', err);
      }
    }
    await modal.reply(interactionPrivate({ title: '✅ Report received', description: 'Thanks — the maintainers will look into it.', color: 'green' }));
  });
}

const command: SlashCommand = {
  bypassLevelRole: true,
  data: new SlashCommandBuilder().setName('report').setDescription('Report a bug or request a feature'),
  async execute(interaction: ChatInputCommandInteraction) {
    attachListener(interaction.client);
    const modal = buildModal('report:modal', 'Report a bug or request', [
      { id: 'title', label: 'Short title', max: 100 },
      { id: 'description', label: 'Description', style: TextInputStyle.Paragraph, max: 1000 },
      { id: 'steps', label: 'Steps to reproduce (optional)', style: TextInputStyle.Paragraph, required: false, max: 1000 },
    ]);
    await interaction.showModal(modal);
  },
};

export default command;
