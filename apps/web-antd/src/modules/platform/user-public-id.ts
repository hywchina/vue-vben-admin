// Keep canonical and recorded legacy input compatible with the API validator.
export const USER_PUBLIC_ID_MAX_LENGTH = 23;
const userPublicIdPattern = /^USR-(?:\d{6}|\d{8,19})$/;

export function normalizeUserPublicId(value: string) {
  return value.trim().toUpperCase();
}

export function getUserPublicIdInputError(value: string) {
  const normalized = normalizeUserPublicId(value);
  if (!normalized) return '请输入用户 ID。';
  if (!userPublicIdPattern.test(normalized)) {
    return '请输入 USR- 加 8–19 位数字，例如 USR-00000002。';
  }
  return '';
}
