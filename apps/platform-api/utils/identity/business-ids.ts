// Canonical output is PREFIX + at least eight digits. Six-digit user numbers
// are accepted only as recorded legacy aliases, never generated or guessed.
export const userPublicIdPattern = /^USR-(?:\d{6}|\d{8,19})$/;

export function isUserPublicId(value: string) {
  return value.trim() === value && userPublicIdPattern.test(value);
}
