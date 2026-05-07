import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type TextInputComponentData,
} from "discord.js";

export function buildModal(
  customId: string,
  title: string,
  fields: Array<{
    id: string;
    label: string;
    style?: TextInputStyle;
    required?: boolean;
    placeholder?: string;
    max?: number;
  }>,
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setStyle(f.style ?? TextInputStyle.Short)
      .setRequired(f.required ?? true);
    if (f.placeholder) input.setPlaceholder(f.placeholder);
    if (f.max) input.setMaxLength(f.max);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
  }
  return modal;
}
