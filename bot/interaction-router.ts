import {
  Client,
  Collection,
  Events,
  Interaction,
  ChatInputCommandInteraction,
  MessageFlags,
  GuildMember,
} from 'discord.js';
import type { SlashCommand } from './command-types';
import type { BotConfig } from '../config/load';
import { tracer } from '../observability/tracer';
import { getGuildSettings } from '../guild/guild-store';
import { interactionPrivate } from '../ui/components-v2';

function isOwner(userId: string, cfg: BotConfig): boolean {
  return cfg.bot.ownerIds.includes(userId) || cfg.bot.adminIds.includes(userId);
}

async function levelRoleGate(
  interaction: ChatInputCommandInteraction,
  cmd: SlashCommand,
  cfg: BotConfig,
): Promise<boolean> {
  if (cmd.bypassLevelRole) return true;
  if (!interaction.guildId) return true;
  if (isOwner(interaction.user.id, cfg)) return true;

  const settings = await getGuildSettings(interaction.guildId);
  const requiredRoleId = settings?.level_role_id;
  if (!requiredRoleId) return true;

  const member = interaction.member;
  let memberObj: GuildMember | null = member instanceof GuildMember ? member : null;
  if (!memberObj && interaction.guild) {
    memberObj = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  }
  if (memberObj?.roles.cache.has(requiredRoleId)) return true;

  await interaction.reply(
    interactionPrivate({
      title: '🔒 Locked',
      description: `You need the <@&${requiredRoleId}> role to use this command in this server.`,
      color: 'red',
    }),
  );
  return false;
}

export function wireInteractionRouter(
  client: Client,
  commands: Collection<string, SlashCommand>,
  cfg: BotConfig,
): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const cmd = commands.get(interaction.commandName);
        if (cmd?.autocomplete) await cmd.autocomplete(interaction);
        return;
      }

      if (!interaction.isChatInputCommand()) return;
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;

      if (cmd.guildOnly && !interaction.guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (cmd.ownerOnly && !isOwner(interaction.user.id, cfg)) {
        await interaction.reply({ content: 'Owner-only command.', flags: MessageFlags.Ephemeral });
        return;
      }

      const allowed = await levelRoleGate(interaction, cmd, cfg);
      if (!allowed) return;

      tracer.info('INTERACTION', `/${interaction.commandName} by ${interaction.user.tag}`);
      await cmd.execute(interaction);
    } catch (err) {
      tracer.error('INTERACTION', 'Handler error', err);
      try {
        if (interaction.isRepliable()) {
          const msg = { content: '❌ Something went wrong handling that command. The error has been logged.', flags: MessageFlags.Ephemeral as const };
          if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
          else await interaction.reply(msg);
        }
      } catch { /* ignore */ }
    }
  });

  tracer.info('DISCORD', 'Interaction router wired');
}
