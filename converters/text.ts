/**
 * Cuts on sentence end if possible, otherwise word boundary,
 * appends an ellipsis only if the text was shortened. Strips HTML tags first
 * so AniList descriptions render cleanly inside Discord components.
 */
export function smartTruncate(input: string | null | undefined, max = 200): string {
  const text = String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!text) return '';
  if (text.length <= max) return text;

  // Try cutting at the last sentence terminator within the window.
  const window = text.slice(0, max + 1);
  const sentenceMatch = window.match(/^[\s\S]*?[.!?](?=\s|$)/g);
  if (sentenceMatch && sentenceMatch.length) {
    const candidate = sentenceMatch.join('').trim();
    if (candidate.length >= Math.floor(max * 0.6) && candidate.length <= max) {
      return candidate + (text.length > candidate.length ? ' …' : '');
    }
  }

  // Fall back to last word boundary inside the limit (never mid-word).
  const lastSpace = text.lastIndexOf(' ', max - 1);
  const cut = lastSpace > Math.floor(max * 0.6) ? text.slice(0, lastSpace) : text.slice(0, max - 1);
  return cut.replace(/[\s,;:.!?-]+$/, '') + ' …';
}
