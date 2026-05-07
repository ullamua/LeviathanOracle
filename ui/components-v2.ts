import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

export interface CardField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Card {
  title?: string;
  desc?: string;
  description?: string;
  thumbnail?: string;
  image?: string;
  url?: string;
  color?: string | number;
  spoiler?: boolean;
  fields?: CardField[];
  footer?: string | { text: string };
}

export interface InteractionPayloadOptions {
  flags?: number;
  ephemeral?: boolean;
  componentsV2?: boolean;
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>[] | ActionRowBuilder<MessageActionRowComponentBuilder>;
  content?: string;
  files?: AttachmentBuilder[];
  fetchReply?: boolean;
}

const COLOR_NAMES: Record<string, number> = {
  red: 0xff0000, green: 0x00ff00, blue: 0x0000ff, yellow: 0xffff00,
  orange: 0xffa500, purple: 0x800080, pink: 0xffc0cb, cyan: 0x00ffff,
  teal: 0x008080, white: 0xffffff, black: 0x000000, gray: 0x808080, grey: 0x808080,
};

function resolveAccentColor(color: string | number | undefined): number | null {
  if (color == null) return null;
  if (typeof color === 'number') return color;
  const input = color.trim();
  if (!input) return null;
  const named = COLOR_NAMES[input.toLowerCase()];
  if (named !== undefined) return named;
  if (/^0x[\da-f]{1,6}$/i.test(input)) return parseInt(input, 16);
  if (/^#[\da-f]{3}$/i.test(input)) {
    const h = input.slice(1);
    return parseInt(`${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`, 16);
  }
  if (/^#[\da-f]{6}$/i.test(input)) return parseInt(input.slice(1), 16);
  if (/^[\da-f]{6}$/i.test(input)) return parseInt(input, 16);
  if (/^\d+$/.test(input)) return parseInt(input, 10);
  return null;
}

function buildFlags(input: { flags?: number; ephemeral?: boolean; componentsV2?: boolean }): number {
  let out = input.flags ?? 0;
  if (input.ephemeral) out |= MessageFlags.Ephemeral;
  else out &= ~MessageFlags.Ephemeral;
  if (input.componentsV2 ?? true) out |= MessageFlags.IsComponentsV2;
  else out &= ~MessageFlags.IsComponentsV2;
  return out;
}

export function v2(card: Card): ContainerBuilder {
  const c = new ContainerBuilder();
  const accent = resolveAccentColor(card.color);
  if (accent != null) c.setAccentColor(accent);
  if (card.spoiler) c.setSpoiler(true);
  if (card.title) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${card.title}`));
  if (card.title && (card.desc || card.description)) {
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
  }
  if (card.desc || card.description) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(card.desc || card.description || ''));
  }
  const mediaUrl = card.image || card.thumbnail;
  if (mediaUrl) {
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(mediaUrl)),
    );
  }
  if (card.fields?.length) {
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    for (const f of card.fields) {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${f.name}**\n${f.value}`));
    }
  }
  if (card.footer) {
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    const text = typeof card.footer === 'string' ? card.footer : card.footer.text;
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${text}`));
  }
  return c;
}

function normalizeComponents(
  components: InteractionPayloadOptions['components'],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  if (!components) return [];
  return Array.isArray(components) ? components : [components];
}

export function interactionPrivate(card: Card, extra: InteractionPayloadOptions = {}): any {
  const { flags, ephemeral, componentsV2, components, ...rest } = extra;
  const builtFlags = buildFlags({ flags, ephemeral: ephemeral ?? true, componentsV2 });
  return {
    ...rest,
    flags: builtFlags,
    components: [v2(card), ...normalizeComponents(components)],
  };
}

export function interactionPublic(extra: InteractionPayloadOptions = {}): any {
  const { flags, ephemeral, componentsV2, components, ...rest } = extra;
  const builtFlags = buildFlags({ flags, ephemeral: ephemeral ?? false, componentsV2 });
  return {
    ...rest,
    flags: builtFlags,
    ...(components ? { components: normalizeComponents(components) } : {}),
  };
}

export function row(buttons: Array<{ id: string; label: string; style?: ButtonStyle; disabled?: boolean }>): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buttons.map((b) =>
      new ButtonBuilder()
        .setCustomId(b.id)
        .setLabel(b.label)
        .setStyle(b.style ?? ButtonStyle.Primary)
        .setDisabled(b.disabled ?? false),
    ),
  );
}

export function paginationRow(current: number, total: number): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current === 1),
    new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current === total),
  );
}

export function section(texts: string | string[], accessory?: { url?: string; customId?: string; label?: string; style?: ButtonStyle }): SectionBuilder {
  const s = new SectionBuilder();
  const items = Array.isArray(texts) ? texts : [texts];
  s.addTextDisplayComponents(items.map((t) => new TextDisplayBuilder().setContent(t)));
  if (accessory?.url) s.setThumbnailAccessory(new ThumbnailBuilder().setURL(accessory.url));
  else if (accessory?.customId)
    s.setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(accessory.customId)
        .setLabel(accessory.label || '')
        .setStyle(accessory.style ?? ButtonStyle.Primary),
    );
  return s;
}

export const ui = {
  v2,
  interactionPrivate,
  interactionPublic,
  row,
  pagination: paginationRow,
  section,
};
