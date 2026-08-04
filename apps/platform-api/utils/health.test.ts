import { describe, expect, it } from 'vitest';

import { isReady } from './health';

describe('readiness state', () => {
  it('requires both PostgreSQL and object storage', () => {
    expect(isReady({ database: 'up', storage: 'up' })).toBe(true);
    expect(isReady({ database: 'down', storage: 'up' })).toBe(false);
    expect(isReady({ database: 'up', storage: 'down' })).toBe(false);
  });
});
