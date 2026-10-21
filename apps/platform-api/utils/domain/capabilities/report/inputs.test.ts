import type { CurrentIdentity } from '../../../identity';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadReportImages } from './inputs';

const mocks = vi.hoisted(() => ({ sql: vi.fn(), access: vi.fn() }));
vi.mock('../../../database', () => ({ useDatabase: () => mocks.sql }));
vi.mock('../../projects/access', () => ({
  requireProjectAccess: mocks.access,
}));

const identity = { id: 'report-owner', roles: ['user'] } as CurrentIdentity;
const asset = {
  id: 'image-a',
  projectId: 'source-project',
  mimeType: 'image/png',
  sizeBytes: 100,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([asset]);
  mocks.access.mockResolvedValue({ projectRole: 'viewer' });
});

describe('report input access', () => {
  it('accepts read-only source projects and checks each source separately', async () => {
    const second = { ...asset, id: 'image-b', projectId: 'another-project' };
    mocks.sql.mockResolvedValue([asset, second]);
    await expect(
      loadReportImages(identity, [asset.id, second.id]),
    ).resolves.toEqual([asset, second]);
    expect(mocks.access).toHaveBeenCalledWith(identity, 'source-project');
    expect(mocks.access).toHaveBeenCalledWith(identity, 'another-project');
  });
  it('rejects removed memberships rather than trusting a queued job', async () => {
    mocks.access.mockRejectedValue(new Error('PROJECT_NOT_FOUND'));
    await expect(loadReportImages(identity, [asset.id])).rejects.toThrow(
      'PROJECT_NOT_FOUND',
    );
  });
  it('rejects missing or unsaved/deleted images excluded by the query', async () => {
    mocks.sql.mockResolvedValue([]);
    await expect(loadReportImages(identity, [asset.id])).rejects.toMatchObject({
      code: 'REPORT_IMAGE_ASSET_INVALID',
    });
  });
  it('retains format and aggregate size limits', async () => {
    mocks.sql.mockResolvedValue([{ ...asset, mimeType: 'image/webp' }]);
    await expect(loadReportImages(identity, [asset.id])).rejects.toMatchObject({
      code: 'REPORT_IMAGE_FORMAT_UNSUPPORTED',
    });
    mocks.sql.mockResolvedValue([{ ...asset, sizeBytes: 101 * 1024 * 1024 }]);
    await expect(loadReportImages(identity, [asset.id])).rejects.toMatchObject({
      code: 'REPORT_INPUT_TOO_LARGE',
    });
  });
  it('does not query unrelated projects for reports without images', async () => {
    expect(await loadReportImages(identity, [])).toEqual([]);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
