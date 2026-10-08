import { describe, expect, it } from 'vitest';

import { isUserPublicId } from './business-ids';

describe('public user ID validation', () => {
  it('accepts canonical and recorded legacy shapes including sequence overflow', () => {
    for (const id of ['USR-00000001', 'USR-100000000', 'USR-000001']) {
      expect(isUserPublicId(id)).toBe(true);
    }
  });
  it('rejects other kinds, malformed strings and unbounded input', () => {
    for (const id of [
      'RAIL-USR-00000001',
      'PRJ-00000001',
      'USR-0000001',
      'USR-1',
      'USR-00000001\n',
      `USR-${'1'.repeat(20)}`,
    ]) {
      expect(isUserPublicId(id)).toBe(false);
    }
  });
});
