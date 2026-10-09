import type { H3Event } from 'h3';

import { describe, expect, it } from 'vitest';

import { getUuidParam } from './resource-id';

function event(id?: string) {
  return { context: { params: { id } } } as unknown as H3Event;
}

describe('uuid route parameters', () => {
  it('retains valid IDs and existing missing-ID behavior', () => {
    expect(getUuidParam(event('31de58da-df9c-4858-aded-4fc41f2803fe'))).toBe(
      '31de58da-df9c-4858-aded-4fc41f2803fe',
    );
    expect(getUuidParam(event())).toBeUndefined();
  });

  it.each(['not-uuid', 'AST-00000001', "' OR true --", '31de58da'])(
    'rejects malformed UUID %s with a client error',
    (id) => {
      expect(() => getUuidParam(event(id))).toThrowError(
        expect.objectContaining({
          code: 'RESOURCE_ID_INVALID',
          statusCode: 400,
        }),
      );
    },
  );
});
