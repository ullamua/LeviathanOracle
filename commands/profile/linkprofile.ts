import { SlashCommandBuilder, type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import type { SlashCommand } from '../../bot/command-types';
import { interactionPrivate } from '../../ui/components-v2';
import { saveProfile, getProfile } from '../../profiles/profile-store';
import { getMalUserProfile, malVerification, MalScrapeError } from '../../anime/jikan';
import { getAniListUserProfile, anilistVerification } from '../../anime/anilist';
import { tracer } from '../../observability/tracer';

const VERIFY_TTL = 10 * 60 * 1000;
const pending = new Map<string, { token: string; expires: number }>();

function tokenFor(userId: string, type: 'mal' | 'anilist', username: string): string {
  const key = `${userId}:${type}:${username.toLowerCase()}`;
  const cur = pending.get(key);
  if (cur && Date.now() < cur.expires) return cur.token;
  const token = `LORA-${userId.slice(-4)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  pending.set(key, { token, expires: Date.now() + VERIFY_TTL });
  return token;
}

const PLATFORM = {
  mal: { label: 'MyAnimeList', editUrl: 'https://myanimelist.net/editprofile.php' },
  anilist: { label: 'AniList', editUrl: 'https://anilist.co/settings' },
} as const;

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('linkprofile')
    .setDescription('Link your anime tracking accounts')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .addSubcommand((s) =>
      s.setName('mal').setDescription('Link MyAnimeList').addStringOption((o) =>
        o.setName('username').setDescription('Your MAL username').setRequired(true),
      ),
    )
    .addSubcommand((s) =>
      s.setName('anilist').setDescription('Link AniList').addStringOption((o) =>
        o.setName('username').setDescription('Your AniList username').setRequired(true),
      ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const type = interaction.options.getSubcommand() as 'mal' | 'anilist';
    const username = interaction.options.getString('username', true);
    const userId = interaction.user.id;
    const platform = PLATFORM[type];
    await interaction.deferReply({ flags: 1 << 6 });

    try {
      // 1. Confirm the username actually exists.
      const profile = type === 'mal'
        ? await getMalUserProfile(username, { fresh: true }).catch(() => null)
        : await getAniListUserProfile(username, { fresh: true }).catch(() => null);
      if (!profile) {
        return interaction.editReply(interactionPrivate({
          title: 'Not Found', description: `No ${platform.label} account for **${username}**.`, color: 'red',
        }));
      }
      const canonical = type === 'mal'
        ? (profile as { username?: string }).username || username
        : (profile as { name?: string }).name || username;

      // 2. Already-linked checks (per-platform - never clobber the other account).
      const mine = await getProfile(userId);
      if ((type === 'mal' ? mine?.mal_username : mine?.anilist_username)?.toLowerCase() === canonical.toLowerCase()) {
        return interaction.editReply(interactionPrivate({
          title: '✅ Already linked',
          description: `Your account is already linked to **${canonical}** on ${platform.label}.`,
          color: 'green',
        }));
      }

      // 3. Verify token in bio. The same command issues OR completes verification.
      const token = tokenFor(userId, type, canonical);
      let about = '';
      try {
        about = type === 'mal' ? await malVerification(canonical) : await anilistVerification(canonical);
      } catch (err) {
        if (err instanceof MalScrapeError) {
          return interaction.editReply(interactionPrivate({ title: 'Lookup failed', description: err.message, color: 'red' }));
        }
        tracer.warn('LINKPROFILE', 'verification fetch failed', err);
      }
      const verified = about.toUpperCase().includes(token.toUpperCase());

      if (!verified) {
        return interaction.editReply(interactionPrivate({
          title: '🔐 Ownership Verification',
          description:
            `To link **${canonical}**, add this token to your **About / Bio** on ${platform.label}:\n\n` +
            `**Token:** \`${token}\`\n\n` +
            `[Edit your ${platform.label} bio](${platform.editUrl})\n\n` +
            `-# Run \`/linkprofile ${type} ${canonical}\` again once saved. The token is valid for 10 minutes.`,
          color: 'orange',
        }));
      }

      // 4. Link & celebrate.
      await saveProfile(userId, type, canonical);
      pending.delete(`${userId}:${type}:${canonical.toLowerCase()}`);
      return interaction.editReply(interactionPrivate({
        title: '✅ Profile Linked',
        description: `Connected to **${canonical}** on ${platform.label}. You can remove the verification token from your bio now.`,
        color: 'green',
      }));
    } catch (err) {
      tracer.error('LINKPROFILE', 'execute failed', err);
      return interaction.editReply(interactionPrivate({ title: 'Error', description: 'An error occurred. Please try again.', color: 'red' }));
    }
  },
};

export default command;
