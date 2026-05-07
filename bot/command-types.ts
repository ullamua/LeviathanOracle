import type { ChatInputCommandInteraction, AutocompleteInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';

export type SlashBuilder = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface SlashCommand {
  data: SlashBuilder;
  guildOnly?: boolean;
  ownerOnly?: boolean;
  bypassLevelRole?: boolean;
  devOnly?: boolean;
  execute(interaction: ChatInputCommandInteraction): Promise<unknown> | unknown;
  autocomplete?(interaction: AutocompleteInteraction): Promise<unknown> | unknown;
}
