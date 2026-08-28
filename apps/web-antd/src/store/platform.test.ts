import type {
  PlatformApplication,
  PlatformAsset,
  PlatformProject,
  PlatformUser,
} from '#/modules/platform/types';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlatformStore } from './platform';

const api = vi.hoisted(() => ({
  batchAssetsApi: vi.fn(),
  batchJobsApi: vi.fn(),
  createJobApi: vi.fn(),
  createAssetFolderApi: vi.fn(),
  createProjectApi: vi.fn(),
  createTextAssetApi: vi.fn(),
  deleteAssetApi: vi.fn(),
  deleteAssetFolderApi: vi.fn(),
  getApplicationsApi: vi.fn(),
  getAssetsApi: vi.fn(),
  getAssetFoldersApi: vi.fn(),
  getAuditEventsApi: vi.fn(),
  getJobsApi: vi.fn(),
  getProjectsApi: vi.fn(),
  getRolesApi: vi.fn(),
  getUsersApi: vi.fn(),
  renameAssetApi: vi.fn(),
  renameAssetFolderApi: vi.fn(),
  selectCurrentProjectApi: vi.fn(),
  saveWorkflowOutputApi: vi.fn(),
  setApplicationVisibilityApi: vi.fn(),
  setAssetFavoriteApi: vi.fn(),
  setProjectPinnedApi: vi.fn(),
  setUserRolesApi: vi.fn(),
  setUserStatusApi: vi.fn(),
  uploadAssetApi: vi.fn(),
  updateProjectApi: vi.fn(),
}));

vi.mock('#/api', () => api);

const firstProject: PlatformProject = {
  activeJobCount: 0,
  assetCount: 1,
  canDelete: true,
  code: 'CR-2026-0001',
  createdAt: '2026-08-03T00:00:00.000Z',
  description: '第一项目',
  id: '11111111-1111-4111-8111-111111111111',
  isPinned: false,
  isOwner: true,
  jobCount: 3,
  memberPreviews: [],
  members: 2,
  name: '项目一',
  ownerId: '44444444-4444-4444-8444-444444444444',
  stage: 'concept',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

const secondProject: PlatformProject = {
  activeJobCount: 1,
  assetCount: 0,
  canDelete: false,
  code: 'CR-2026-0002',
  createdAt: '2026-08-04T00:00:00.000Z',
  description: '第二项目',
  id: '22222222-2222-4222-8222-222222222222',
  isPinned: true,
  isOwner: false,
  jobCount: 4,
  memberPreviews: [],
  members: 1,
  name: '项目二',
  ownerId: '55555555-5555-4555-8555-555555555555',
  stage: 'design',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

const projects: PlatformProject[] = [firstProject, secondProject];

const application: PlatformApplication = {
  acceptedAssetTypes: ['image'],
  adapterConfigured: false,
  canManageVisibility: true,
  category: 'generation',
  color: '#b91c32',
  description: '测试应用',
  icon: 'lucide:image',
  key: 'test-app',
  name: '测试应用',
  outputAssetTypes: ['image'],
  provider: 'adapter',
  shortName: '测试',
  status: 'testing',
  updatedAt: '2026-08-04T00:00:00.000Z',
  visible: true,
};

const asset: PlatformAsset = {
  accent: '#b91c32',
  createdAt: '2026-08-04T00:00:00.000Z',
  description: '测试图片',
  favorite: false,
  format: 'PNG',
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: '参考图',
  owner: '测试用户',
  ownerId: '44444444-4444-4444-8444-444444444444',
  ownerPublicId: 'USR-000001',
  projectId: firstProject.id,
  publicId: 'AST-00000001',
  size: '1.0 MB',
  source: 'upload',
  tags: [],
  type: 'image',
  version: 1,
};

const platformUser: PlatformUser = {
  department: '工业设计中心',
  email: 'zhangchen@rail.local',
  id: '44444444-4444-4444-8444-444444444444',
  lastActive: '2026-08-04T00:00:00.000Z',
  name: '测试用户',
  projectCount: 1,
  publicId: 'USR-000001',
  roleCodes: ['user'],
  roles: ['普通用户'],
  status: 'enabled',
  username: 'tester',
};

describe('platform store with real API contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    api.getProjectsApi.mockResolvedValue({
      currentProjectId: firstProject.id,
      items: projects.map((project) => ({ ...project })),
    });
    api.getApplicationsApi.mockResolvedValue([{ ...application }]);
    api.getAssetsApi.mockResolvedValue([{ ...asset }]);
    api.getAssetFoldersApi.mockResolvedValue([]);
    api.getJobsApi.mockResolvedValue([]);
    api.selectCurrentProjectApi.mockResolvedValue({
      projectId: secondProject.id,
    });
  });

  it('loads projects, applications and current project data from APIs', async () => {
    const store = usePlatformStore();

    await store.initialize();

    expect(store.initialized).toBe(true);
    expect(store.currentProject?.name).toBe('项目一');
    expect(store.currentAssets).toEqual([asset]);
    expect(api.getAssetsApi).toHaveBeenCalledWith(firstProject.id);
  });

  it('persists project selection and reloads project-scoped data', async () => {
    const store = usePlatformStore();
    await store.initialize();
    api.getAssetsApi.mockResolvedValueOnce([]);

    await store.switchProject(secondProject.id);

    expect(api.selectCurrentProjectApi).toHaveBeenCalledWith(secondProject.id);
    expect(store.currentProjectId).toBe(secondProject.id);
    expect(store.currentAssets).toEqual([]);
  });

  it('creates and selects a database-backed project', async () => {
    const store = usePlatformStore();
    await store.initialize();
    const created = {
      ...secondProject,
      id: '33333333-3333-4333-8333-333333333333',
    };
    api.createProjectApi.mockResolvedValue(created);

    const result = await store.addProject('项目三', '真实项目');

    expect(result).toEqual(created);
    expect(store.projects[0]).toEqual(created);
    expect(store.currentProjectId).toBe(created.id);
  });

  it('adds an object-storage asset only after the API upload completes', async () => {
    const store = usePlatformStore();
    await store.initialize();
    const uploaded = { ...asset, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    api.uploadAssetApi.mockResolvedValue(uploaded);
    const file = new File(['image'], 'reference.png', { type: 'image/png' });

    await store.uploadAsset({
      derivedFromAssetId: asset.id,
      file,
      name: '新参考图',
      type: 'image',
    });

    expect(store.currentAssets[0]).toEqual(uploaded);
    expect(api.uploadAssetApi).toHaveBeenCalledWith(
      expect.objectContaining({
        derivedFromAssetId: asset.id,
        projectId: firstProject.id,
      }),
    );
  });

  it('adds a staged workflow output only after the user saves it', async () => {
    const store = usePlatformStore();
    await store.initialize();
    const generated = {
      ...asset,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      source: 'workflow' as const,
    };
    api.saveWorkflowOutputApi.mockResolvedValue(generated);

    await store.saveWorkflowOutput(generated.id);

    expect(api.saveWorkflowOutputApi).toHaveBeenCalledWith(
      generated.id,
      undefined,
    );
    expect(store.currentAssets[0]).toEqual(generated);
  });

  it('removes a deleted asset from the current project cache', async () => {
    const store = usePlatformStore();
    await store.initialize();
    api.deleteAssetApi.mockResolvedValue({ deleted: true, id: asset.id });

    await store.deleteAsset(asset.id);

    expect(api.deleteAssetApi).toHaveBeenCalledWith(asset.id);
    expect(store.currentAssets).toEqual([]);
  });

  it('refreshes the current folder and folders after toggling a favorite', async () => {
    const store = usePlatformStore();
    await store.initialize();
    const favoriteFolder = {
      assetCount: 1,
      createdAt: '2026-08-12T00:00:00.000Z',
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      kind: 'favorites' as const,
      name: '收藏',
      parentId: null,
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const favoriteAsset = {
      ...asset,
      favorite: true,
    };
    api.setAssetFavoriteApi.mockResolvedValue(favoriteAsset);
    api.getAssetFoldersApi.mockResolvedValueOnce([favoriteFolder]);
    api.getAssetsApi.mockResolvedValueOnce([favoriteAsset]);

    const result = await store.toggleAssetFavorite(asset.id, {
      folderId: 'root',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(api.setAssetFavoriteApi).toHaveBeenCalledWith(asset.id, true);
    expect(api.getAssetFoldersApi).toHaveBeenLastCalledWith(firstProject.id);
    expect(api.getAssetsApi).toHaveBeenLastCalledWith(firstProject.id, {
      folderId: 'root',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(result).toEqual(favoriteAsset);
    expect(store.currentAssets).toEqual([favoriteAsset]);
    expect(store.assetFolders).toEqual([favoriteFolder]);
  });

  it('renames an asset from the API response and supports server-side sorting', async () => {
    const store = usePlatformStore();
    await store.initialize();
    const renamed = { ...asset, name: '重命名后的参考图' };
    api.renameAssetApi.mockResolvedValue(renamed);
    api.getAssetsApi.mockResolvedValueOnce([renamed]);

    await store.renameAsset(asset.id, renamed.name);
    await store.refreshCurrentProjectAssets({
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(api.renameAssetApi).toHaveBeenCalledWith(asset.id, renamed.name);
    expect(api.getAssetsApi).toHaveBeenLastCalledWith(firstProject.id, {
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(store.currentAssets).toEqual([renamed]);
  });

  it('persists asset folders and delegates batch operations to the API', async () => {
    const store = usePlatformStore();
    await store.initialize();
    const folder = {
      assetCount: 0,
      createdAt: '2026-08-12T00:00:00.000Z',
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      kind: 'normal' as const,
      name: '方案资料',
      parentId: null,
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    api.createAssetFolderApi.mockResolvedValue(folder);
    api.batchAssetsApi.mockResolvedValue({ movedCount: 1 });
    api.getAssetFoldersApi.mockResolvedValue([folder]);

    await store.createAssetFolder(folder.name);
    await store.batchAssets([asset.id], 'move', folder.id, null);

    expect(api.createAssetFolderApi).toHaveBeenCalledWith({
      name: folder.name,
      parentId: undefined,
      projectId: firstProject.id,
    });
    expect(api.batchAssetsApi).toHaveBeenCalledWith({
      assetIds: [asset.id],
      operation: 'move',
      projectId: firstProject.id,
      targetFolderId: folder.id,
    });
  });

  it('renames and pins projects from server-backed preferences', async () => {
    const store = usePlatformStore();
    await store.initialize();
    api.updateProjectApi.mockResolvedValue({
      description: '新说明',
      id: firstProject.id,
      name: '新名称',
    });
    api.setProjectPinnedApi.mockResolvedValue({
      id: firstProject.id,
      pinned: true,
    });

    await store.updateProject(firstProject.id, {
      description: '新说明',
      name: '新名称',
    });
    await store.setProjectPinned(firstProject.id, true);

    expect(
      store.projects.find((item) => item.id === firstProject.id)?.name,
    ).toBe('新名称');
    expect(
      store.projects.find((item) => item.id === firstProject.id)?.description,
    ).toBe('新说明');
    expect(store.projects[0]?.isPinned).toBe(true);
  });

  it('implements the global reset contract used during logout', async () => {
    const store = usePlatformStore();
    await store.initialize();

    expect(() => store.$reset()).not.toThrow();
    expect(store.initialized).toBe(false);
    expect(store.projects).toEqual([]);
    expect(store.currentProjectId).toBe('');
  });

  it('updates user roles only from the administrator API response', async () => {
    const store = usePlatformStore();
    api.getUsersApi.mockResolvedValue([{ ...platformUser }]);
    api.getRolesApi.mockResolvedValue([]);
    api.setUserRolesApi.mockResolvedValue({
      id: platformUser.id,
      roleCodes: ['admin'],
      roles: ['管理员'],
    });

    await store.loadAdministration();
    await store.updateUserRoles(platformUser.id, ['admin']);

    expect(api.setUserRolesApi).toHaveBeenCalledWith(platformUser.id, [
      'admin',
    ]);
    expect(store.users[0]?.roleCodes).toEqual(['admin']);
    expect(store.users[0]?.roles).toEqual(['管理员']);
  });

  it('updates application visibility only from the administrator API response', async () => {
    const store = usePlatformStore();
    await store.initialize();
    api.setApplicationVisibilityApi.mockResolvedValue({
      key: application.key,
      updatedAt: '2026-08-08T00:00:00.000Z',
      visible: false,
    });

    await store.setApplicationVisibility(application.key, false);

    expect(api.setApplicationVisibilityApi).toHaveBeenCalledWith(
      application.key,
      false,
    );
    expect(store.applications[0]?.visible).toBe(false);
    expect(store.applications[0]?.updatedAt).toBe('2026-08-08T00:00:00.000Z');
  });

  it('loads the audit scope and events returned by the server', async () => {
    const store = usePlatformStore();
    const auditEvent = {
      action: 'page.view',
      actorId: platformUser.id,
      actorRoles: ['user'],
      actorType: 'user' as const,
      createdAt: '2026-08-04T00:00:00.000Z',
      durationMs: null,
      id: '55555555-5555-4555-8555-555555555555',
      ip: '127.0.0.1',
      method: null,
      module: 'navigation',
      operator: platformUser.name,
      requestId: 'request-1',
      result: 'success' as const,
      statusCode: null,
      target: 'page:/audit',
      username: platformUser.username,
    };
    api.getAuditEventsApi.mockResolvedValue({
      items: [auditEvent],
      limit: 100,
      page: 1,
      scope: 'self',
      total: 1,
    });

    await store.loadAuditEvents();

    expect(store.auditScope).toBe('self');
    expect(store.auditTotal).toBe(1);
    expect(store.auditEvents).toEqual([auditEvent]);
  });
});
