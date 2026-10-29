import { describe, expect, it } from 'vitest';

import { canonicalWorkspaceQuery } from './model-update-context';
describe('model validation workspace context', () => {
  it('keeps the candidate model context when canonicalizing a newly created workspace tab', () => {
    expect(
      canonicalWorkspaceQuery('instance', {
        modelUpdateId: 'candidate',
        transferId: 'consumed',
      }),
    ).toEqual({ instanceId: 'instance', modelUpdateId: 'candidate' });
  });
  it('preserves normal workspace behavior and rejects ambiguous update queries', () => {
    expect(
      canonicalWorkspaceQuery('instance', { transferId: 'consumed' }),
    ).toEqual({ instanceId: 'instance' });
    expect(
      canonicalWorkspaceQuery('instance', { modelUpdateId: ['a', 'b'] }),
    ).toEqual({ instanceId: 'instance' });
  });
});
