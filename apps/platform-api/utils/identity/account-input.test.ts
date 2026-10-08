import { describe, expect, it } from 'vitest';

import {
  createAccountSchema,
  registerAccountSchema,
  updateProfileSchema,
} from './account-input';

const account = { username: 'test-user', password: 'RailTest123!' };

describe('accounts without email', () => {
  it('registers using username and password only', () => {
    expect(registerAccountSchema.parse(account)).toEqual({
      ...account,
      department: '',
    });
  });
  it.each(['', 'invalid-email', 'old@rail.local'])(
    'ignores legacy email %j without weakening role isolation',
    (email) => {
      const result = registerAccountSchema.parse({
        ...account,
        email,
        role: 'admin',
        roles: ['admin'],
      });
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('role');
      expect(result).not.toHaveProperty('roles');
    },
  );
  it.each(['short', 'abcdefgh!', '12345678!', 'RailTest123'])(
    'rejects weak password %j',
    (password) => {
      expect(
        registerAccountSchema.safeParse({ ...account, password }).success,
      ).toBe(false);
    },
  );
  it.each(['ab', 'contains spaces', '@invalid', 'a'.repeat(33)])(
    'rejects invalid username %j',
    (username) => {
      expect(
        registerAccountSchema.safeParse({ ...account, username }).success,
      ).toBe(false);
    },
  );
  it('allows administrator creation without email with the same role rules', () => {
    expect(
      createAccountSchema.parse({ ...account, realName: '测试用户' }),
    ).toMatchObject({ role: 'user' });
    expect(
      createAccountSchema.safeParse({
        ...account,
        realName: '测试用户',
        role: 'superuser',
      }).success,
    ).toBe(false);
    expect(createAccountSchema.safeParse(account).success).toBe(false);
  });
  it('saves profile without requiring or updating email/role/username', () => {
    const values = { department: '', introduction: '', realName: '测试用户' };
    expect(updateProfileSchema.parse(values)).toEqual(values);
    expect(
      updateProfileSchema.parse({
        ...values,
        email: 'replacement@rail.local',
        roles: ['admin'],
        username: 'other',
      }),
    ).toEqual(values);
  });
  it.each([
    { realName: ' ' },
    { realName: 'a'.repeat(101) },
    { department: 'a'.repeat(101) },
    { introduction: 'a'.repeat(501) },
  ])('retains profile validation: %j', (changes) => {
    expect(
      updateProfileSchema.safeParse({
        department: '',
        introduction: '',
        realName: '测试用户',
        ...changes,
      }).success,
    ).toBe(false);
  });
});
