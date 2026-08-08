import { describe, expect, it } from 'vitest';

import { resolveAuditVisibility } from './access';

describe('audit visibility', () => {
  it('allows an administrator to read all actors', () => {
    expect(
      resolveAuditVisibility({ id: 'admin-id', roles: ['admin'] }),
    ).toEqual({ actorId: null, scope: 'all' });
  });

  it('allows an administrator to filter another administrator or user', () => {
    expect(
      resolveAuditVisibility(
        { id: 'admin-id', roles: ['admin'] },
        'another-actor-id',
      ),
    ).toEqual({ actorId: 'another-actor-id', scope: 'all' });
  });

  it('forces a regular user to their own records', () => {
    expect(
      resolveAuditVisibility(
        { id: 'user-id', roles: ['user'] },
        'another-actor-id',
      ),
    ).toEqual({ actorId: 'user-id', scope: 'self' });
  });
});
