import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addWorkflowVersion } from './repository';

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { json: vi.fn((value: unknown) => value) }),
}));

vi.mock('../../database', () => ({ useDatabase: () => mocks.sql }));

const snapshot = {
  apiJson: {
    '1': { class_type: 'SaveImage', inputs: { filename_prefix: 'test' } },
  },
  modelRequirements: [],
  outputSchema: [
    {
      field: 'images',
      kind: 'image' as const,
      nodeId: '1',
      role: 'primary' as const,
      tags: [],
    },
  ],
  parameterSchema: [],
};

describe('workflow version insert', () => {
  beforeEach(() => {
    mocks.sql.mockReset();
  });

  it('selects only the eight inserted values, not a public presentation ID', async () => {
    mocks.sql.mockResolvedValue([{ id: 'version-id', version: 2 }]);
    await expect(
      addWorkflowVersion('workflow-id', snapshot, 'actor-id'),
    ).resolves.toEqual({ id: 'version-id', version: 2 });
    const query = mocks.sql.mock.calls[0]?.[0].join('?');
    expect(query).toContain('INSERT INTO workflow_versions');
    expect(query).toContain('COALESCE(max(wv.version), 0)');
    expect(query).not.toContain('wd.public_id');
  });

  it('preserves the missing-workflow and duplicate-version errors', async () => {
    mocks.sql.mockResolvedValue([]);
    await expect(
      addWorkflowVersion('missing-id', snapshot, 'actor-id'),
    ).rejects.toMatchObject({ code: 'WORKFLOW_NOT_FOUND' });
    mocks.sql.mockRejectedValue({ code: '23505' });
    await expect(
      addWorkflowVersion('workflow-id', snapshot, 'actor-id'),
    ).rejects.toMatchObject({ code: 'WORKFLOW_VERSION_DUPLICATE' });
  });
});
