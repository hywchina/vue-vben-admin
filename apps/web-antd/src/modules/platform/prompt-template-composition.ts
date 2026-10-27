/** Replace only an intact previously applied template, preserving free text. */
export function composePromptApplication(
  current: string,
  next: string,
  previous = '',
) {
  let base = current;
  if (previous && base.includes(previous)) base = base.replace(previous, '');
  base = base.trim();
  const addition = next.trim();
  if (!addition || base.includes(addition))
    return { text: base, appliedTemplate: '' };
  return {
    text: [base, addition].filter(Boolean).join('\n'),
    appliedTemplate: addition,
  };
}

export function mergePromptTemplate(
  current: string,
  next: string,
  previous = '',
) {
  return composePromptApplication(current, next, previous).text;
}
