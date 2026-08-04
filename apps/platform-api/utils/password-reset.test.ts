import { describe, expect, it } from 'vitest';

import {
  createPasswordResetToken,
  createPasswordResetUrl,
  hashPasswordResetToken,
  normalizeEmail,
} from './password-reset';

describe('password reset utilities', () => {
  it('normalizes enterprise email addresses', () => {
    expect(normalizeEmail('  Designer@RAIL.LOCAL ')).toBe(
      'designer@rail.local',
    );
  });

  it('creates random tokens and stores only a deterministic hash', () => {
    const first = createPasswordResetToken();
    const second = createPasswordResetToken();

    expect(first.token).not.toBe(second.token);
    expect(first.hash).toHaveLength(64);
    expect(first.hash).toBe(hashPasswordResetToken(first.token));
  });

  it('builds the public one-time reset route', () => {
    expect(
      createPasswordResetUrl('https://design.rail.example/base', 'token-value'),
    ).toBe('https://design.rail.example/auth/reset-password?token=token-value');
  });
});
