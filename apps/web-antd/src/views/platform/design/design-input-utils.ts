export function markdownTextContent(content: string) {
  return content
    .replaceAll('\r\n', '\n')
    .replaceAll(/<img\b[^>]*>/gi, '')
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replaceAll(/^\s{0,3}#{1,6}\s+/gm, '')
    .replaceAll(/^\s*>\s?/gm, '')
    .replaceAll(/^\s*[-*+]\s+/gm, '')
    .replaceAll(/^\s*\d+[.)]\s+/gm, '')
    .replaceAll(/^```[^\n]*$/gm, '')
    .replaceAll(/`([^`]+)`/g, '$1')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

export function appendTextInput(
  current: unknown,
  imported: string,
  maximumLength?: number,
) {
  const existing = typeof current === 'string' ? current.trimEnd() : '';
  const combined = existing ? `${existing}\n\n${imported}` : imported;
  if (!maximumLength || combined.length <= maximumLength) {
    return { truncated: false, value: combined };
  }
  return {
    truncated: true,
    value: [...combined].slice(0, maximumLength).join(''),
  };
}
