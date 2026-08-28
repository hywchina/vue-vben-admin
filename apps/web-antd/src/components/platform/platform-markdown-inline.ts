export type MarkdownInlineToken =
  | { content: string; href: string; kind: 'link' }
  | { content: string; kind: 'code' | 'emphasis' | 'strong' | 'text' };

const inlinePattern =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\((?:[^()\s]+|\([^()\s]*\))+\)|\*[^*\n]+\*|_[^_\n]+_)/g;

function safeLinkHref(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export function parseMarkdownInline(content: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;
  for (const match of content.matchAll(inlinePattern)) {
    const raw = match[0];
    const index = match.index;
    if (index > cursor) {
      tokens.push({ content: content.slice(cursor, index), kind: 'text' });
    }
    if (raw.startsWith('**') || raw.startsWith('__')) {
      tokens.push({ content: raw.slice(2, -2), kind: 'strong' });
    } else if (raw.startsWith('`')) {
      tokens.push({ content: raw.slice(1, -1), kind: 'code' });
    } else if (raw.startsWith('[')) {
      const separator = raw.indexOf('](');
      const label = raw.slice(1, separator);
      const href = safeLinkHref(raw.slice(separator + 2, -1));
      if (label && href) {
        tokens.push({ content: label, href, kind: 'link' });
      } else {
        tokens.push({ content: raw, kind: 'text' });
      }
    } else {
      tokens.push({ content: raw.slice(1, -1), kind: 'emphasis' });
    }
    cursor = index + raw.length;
  }
  if (cursor < content.length) {
    tokens.push({ content: content.slice(cursor), kind: 'text' });
  }
  return tokens.length > 0 ? tokens : [{ content, kind: 'text' }];
}
