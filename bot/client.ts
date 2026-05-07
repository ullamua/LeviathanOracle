import { Client, GatewayIntentBits, ActivityType, Partials } from 'discord.js';
import { tracer } from '../observability/tracer';

export function createBotClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });
}

const PRESENCES: Array<{ name: string; type: ActivityType }> = [
  { name: '/help • anime notifications', type: ActivityType.Watching },
  { name: 'your watchlist', type: ActivityType.Watching },
  { name: 'AniList & MAL', type: ActivityType.Listening },
  { name: 'new episodes drop', type: ActivityType.Watching },
];

export function startPresenceRotation(client: Client): void {
  let i = 0;
  const set = (): void => {
    const p = PRESENCES[i % PRESENCES.length];
    client.user?.setPresence({ activities: [{ name: p.name, type: p.type }], status: 'online' });
    i += 1;
  };
  set();
  setInterval(set, 5 * 60 * 1000).unref();
  tracer.info('DISCORD', 'Presence rotation started');
}
