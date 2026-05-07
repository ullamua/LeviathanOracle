import { SlashCommandBuilder, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { setLevelRole, getGuildSettings } from '../../guild/guild-store';
import { interactionPrivate } from '../../ui/components-v2';

/**
 * Reverted to the original three-subcommand surface. The previous rewrite
 * folded notification-channel + daily-schedule config into this command,
 * which broke muscle memory for existing servers. Those settings live in
 * `/daily-schedule` and `/rolenotification` again.
 */
const command: SlashCommand = {
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName('set-levelrole')
    .setDescription('Manage bot command role requirements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('set').setDescription('Set the role')
      .addRoleOption((o) => o.setName('role').setDescription('Role required').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove requirement'))
    .addSubcommand((s) => s.setName('status').setDescription('View current setting')),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 1 << 6 });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'set') {
      const role = interaction.options.getRole('role', true);
      await setLevelRole(guildId, role.id);
      return interaction.editReply(interactionPrivate({
        title: 'Level Role Set', description: `Required: <@&${role.id}>`, color: 'green',
      }));
    }
    if (sub === 'remove') {
      await setLevelRole(guildId, null);
      return interaction.editReply(interactionPrivate({
        title: 'Level Role Removed', description: 'Requirement cleared.', color: 'red',
      }));
    }
    const s = await getGuildSettings(guildId);
    return interaction.editReply(interactionPrivate({
      title: 'Level Role Status',
      description: s?.level_role_id ? `Required: <@&${s.level_role_id}>` : 'No role requirement set.',
      color: s?.level_role_id ? 'blue' : 'gray',
    }));
  },
};

export default command;
