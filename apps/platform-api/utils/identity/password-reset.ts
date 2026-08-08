import { createHash, randomBytes } from 'node:crypto';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString('base64url');
  return { hash: hashPasswordResetToken(token), token };
}

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createPasswordResetUrl(publicUrl: string, token: string) {
  const url = new URL('/auth/reset-password', publicUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
