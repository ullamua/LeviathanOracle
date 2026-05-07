import * as fs from 'node:fs';
import * as path from 'node:path';
import { Collection, REST, Routes } from 'discord.js';
import type { SlashCommand } from './command-types';
import type { BotConfig } from '../config/load';
import { tracer } from '../observability/tracer';

const COMMANDS_DIR = path.resolve(__dirname, '..', 'commands');

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(t|j)s$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

export async function loadCommands(): Promise<Collection<string, SlashCommand>> {
  const collection = new Collection<string, SlashCommand>();
  for (const file of walk(COMMANDS_DIR)) {
    try {
      const mod = await import(file);
      const cmd: SlashCommand | undefined = mod.default ?? mod.command;
      if (!cmd?.data || typeof cmd.execute !== 'function') {
        tracer.warn('COMMANDS', `Skipping ${path.relative(COMMANDS_DIR, file)} — missing data/execute`);
        continue;
      }
      const name = cmd.data.name;
      collection.set(name, cmd);
      tracer.trace('COMMANDS', `Loaded /${name}`);
    } catch (err) {
      tracer.error('COMMANDS', `Failed to load ${file}`, err);
    }
  }
  return collection;
}

export async function registerSlashCommands(commands: Collection<string, SlashCommand>, cfg: BotConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(cfg.bot.token);

  const global = commands.filter((c) => !c.devOnly).map((c) => c.data.toJSON());
  const dev = commands.filter((c) => c.devOnly).map((c) => c.data.toJSON());

  tracer.info('COMMANDS', `Registering ${global.length} global commands…`);
  await rest.put(Routes.applicationCommands(cfg.bot.id), { body: global });

  if (dev.length && cfg.bot.devGuildIds.length) {
    for (const guildId of cfg.bot.devGuildIds) {
      tracer.info('COMMANDS', `Registering ${dev.length} dev commands in guild ${guildId}`);
      await rest.put(Routes.applicationGuildCommands(cfg.bot.id, guildId), { body: dev });
    }
  }
  tracer.info('COMMANDS', 'Slash command registration complete');
}
