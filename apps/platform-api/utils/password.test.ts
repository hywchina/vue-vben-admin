import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('stores a salted scrypt hash and verifies only the matching password', async () => {
    const encoded = await hashPassword('RailTest123!');

    expect(encoded).toMatch(/^scrypt\$/);
    await expect(verifyPassword('RailTest123!', encoded)).resolves.toBe(true);
    await expect(verifyPassword('WrongPassword123!', encoded)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed stored password values', async () => {
    await expect(verifyPassword('RailTest123!', 'invalid')).resolves.toBe(
      false,
    );
  });
});
