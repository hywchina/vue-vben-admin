import { describe, expect, it } from 'vitest';

import { hasAdministratorRole, PLATFORM_ROLE_CODES } from './roles';

describe('platform role model', () => {
  it('contains only administrator and regular user roles', () => {
    expect(PLATFORM_ROLE_CODES).toEqual(['admin', 'user']);
  });

  it('recognizes only the administrator role as administrative', () => {
    expect(hasAdministratorRole(['admin'])).toBe(true);
    expect(hasAdministratorRole(['user'])).toBe(false);
    expect(hasAdministratorRole(['super'])).toBe(false);
  });
});
