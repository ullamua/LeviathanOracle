import { Client, Events, Guild, TextChannel } from 'discord.js';
import type { BotConfig } from '../config/load';
import { tracer } from '../observability/tracer';
import { v2 } from '../ui/components-v2';

async function logToChannel(client: Client, channelId: string | undefined, title: string, desc: string, color: string): Promise<void> {
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch instanceof TextChannel) {
      await ch.send({ flags: 1 << 15, components: [v2({ title, description: desc, color })] });
    }
  } catch (err) {
    tracer.warn('GUILD_EVENTS', `Could not log to ${channelId}`, err);
  }
}

export function wireGuildEvents(client: Client, cfg: BotConfig): void {
  client.on(Events.GuildCreate, (guild: Guild) => {
    tracer.info('GUILD', `Joined ${guild.name} (${guild.id}) — ${guild.memberCount} members`);
    void logToChannel(client, cfg.logging.guildJoinLogsId, '➕ Joined a guild', `**${guild.name}** (\`${guild.id}\`) — ${guild.memberCount} members`, 'green');
  });
  client.on(Events.GuildDelete, (guild: Guild) => {
    tracer.info('GUILD', `Left ${guild.name} (${guild.id})`);
    void logToChannel(client, cfg.logging.guildLeaveLogsId, '➖ Left a guild', `**${guild.name}** (\`${guild.id}\`)`, 'red');
  });
}
