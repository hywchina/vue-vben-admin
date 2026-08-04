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
  createJobApi: vi.fn(),
  createProjectApi: vi.fn(),
  createTextAssetApi: vi.fn(),
  getApplicationsApi: vi.fn(),
  getAssetsApi: vi.fn(),
  getAuditEventsApi: vi.fn(),
  getJobsApi: vi.fn(),
  getProjectsApi: vi.fn(),
  getRolesApi: vi.fn(),
  getUsersApi: vi.fn(),
  selectCurrentProjectApi: vi.fn(),
  setAssetFavoriteApi: vi.fn(),
  setUserRolesApi: vi.fn(),
  setUserStatusApi: vi.fn(),
  uploadAssetApi: vi.fn(),
}));

vi.mock('#/api', () => api);

const firstProject: PlatformProject = {
  assetCount: 1,
  code: 'CR-2026-0001',
  description: '第一项目',
  id: '11111111-1111-4111-8111-111111111111',
  members: 2,
  name: '项目一',
  stage: 'concept',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

const secondProject: PlatformProject = {
  assetCount: 0,
  code: 'CR-2026-0002',
  description: '第二项目',
  id: '22222222-2222-4222-8222-222222222222',
  members: 1,
  name: '项目二',
  stage: 'design',
  updatedAt: '2026-08-04T00:00:00.000Z',
};

const projects: PlatformProject[] = [firstProject, secondProject];

const application: PlatformApplication = {
  acceptedAssetTypes: ['image'],
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
  projectId: firstProject.id,
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
      items: [...projects],
    });
    api.getApplicationsApi.mockResolvedValue([application]);
    api.getAssetsApi.mockResolvedValue([asset]);
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

    await store.uploadAsset({ file, name: '新参考图', type: 'image' });

    expect(store.currentAssets[0]).toEqual(uploaded);
    expect(api.uploadAssetApi).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: firstProject.id }),
    );
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
