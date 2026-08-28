import type { AssetType } from '#/modules/platform/types';

import { computed, ref } from 'vue';

import { defineStore } from 'pinia';

import {
  batchAssetsApi,
  batchJobsApi,
  cancelJobApi,
  createAssetFolderApi,
  createJobApi,
  createProjectApi,
  createTextAssetApi,
  deleteAssetApi,
  deleteAssetFolderApi,
  deleteProjectApi,
  getApplicationsApi,
  getAssetFoldersApi,
  getAssetsApi,
  getAuditEventsApi,
  getJobsApi,
  getProjectsApi,
  getRolesApi,
  getUsersApi,
  renameAssetApi,
  renameAssetFolderApi,
  saveWorkflowOutputApi,
  selectCurrentProjectApi,
  setApplicationVisibilityApi,
  setAssetFavoriteApi,
  setProjectPinnedApi,
  setUserRolesApi,
  setUserStatusApi,
  updateProjectApi,
  uploadAssetApi,
} from '#/api';

import { isActivePlatformJob, normalizePlatformJobs } from './platform/helpers';

export const usePlatformStore = defineStore('rail-platform', () => {
  const currentProjectId = ref('');
  const projects = ref<Awaited<ReturnType<typeof getProjectsApi>>['items']>([]);
  const assets = ref<Awaited<ReturnType<typeof getAssetsApi>>>([]);
  const assetFolders = ref<Awaited<ReturnType<typeof getAssetFoldersApi>>>([]);
  const applications = ref<Awaited<ReturnType<typeof getApplicationsApi>>>([]);
  const jobs = ref<Awaited<ReturnType<typeof getJobsApi>>>([]);
  const users = ref<Awaited<ReturnType<typeof getUsersApi>>>([]);
  const roles = ref<Awaited<ReturnType<typeof getRolesApi>>>([]);
  const auditEvents = ref<
    Awaited<ReturnType<typeof getAuditEventsApi>>['items']
  >([]);
  const auditScope = ref<'all' | 'self'>('self');
  const auditTotal = ref(0);
  const initialized = ref(false);
  const loading = ref(false);
  let initialization: Promise<void> | undefined;

  const currentProject = computed(() =>
    projects.value.find((project) => project.id === currentProjectId.value),
  );
  const currentAssets = computed(() => assets.value);
  const currentJobs = computed(() => jobs.value);
  const activeJobs = computed(() => jobs.value.filter(isActivePlatformJob));

  async function refreshCurrentProjectData() {
    if (!currentProjectId.value) {
      assets.value = [];
      assetFolders.value = [];
      jobs.value = [];
      return;
    }
    const projectId = currentProjectId.value;
    const [nextAssets, nextFolders, nextJobs] = await Promise.all([
      getAssetsApi(projectId),
      getAssetFoldersApi(projectId),
      getJobsApi(projectId),
    ]);
    if (currentProjectId.value === projectId) {
      assets.value = nextAssets;
      assetFolders.value = nextFolders;
      jobs.value = normalizePlatformJobs(nextJobs);
    }
  }

  async function refreshCurrentProjectAssets(options?: {
    folderId?: string;
    ownerId?: string;
    sortBy?: 'createdAt' | 'name' | 'owner' | 'type';
    sortOrder?: 'asc' | 'desc';
  }) {
    if (!currentProjectId.value) {
      assets.value = [];
      return;
    }
    const projectId = currentProjectId.value;
    const nextAssets = await getAssetsApi(projectId, options);
    if (currentProjectId.value === projectId) assets.value = nextAssets;
  }

  async function refreshCurrentProjectJobs() {
    if (!currentProjectId.value) {
      jobs.value = [];
      return;
    }
    const projectId = currentProjectId.value;
    const nextJobs = await getJobsApi(projectId);
    if (currentProjectId.value === projectId) {
      jobs.value = normalizePlatformJobs(nextJobs);
    }
  }

  async function initialize(force = false) {
    if (initialized.value && !force) return;
    if (initialization && !force) return await initialization;

    initialization = (async () => {
      loading.value = true;
      try {
        const [projectResult, applicationResult] = await Promise.all([
          getProjectsApi(),
          getApplicationsApi(),
        ]);
        projects.value = projectResult.items;
        applications.value = applicationResult;
        currentProjectId.value =
          projectResult.currentProjectId ?? projectResult.items[0]?.id ?? '';
        await refreshCurrentProjectData();
        initialized.value = true;
      } finally {
        loading.value = false;
        initialization = undefined;
      }
    })();
    return await initialization;
  }

  async function switchProject(projectId: string) {
    if (!projects.value.some((project) => project.id === projectId)) return;
    await selectCurrentProjectApi(projectId);
    currentProjectId.value = projectId;
    await refreshCurrentProjectData();
  }

  async function addProject(name: string, description: string) {
    const project = await createProjectApi({ description, name });
    projects.value.unshift(project);
    currentProjectId.value = project.id;
    assets.value = [];
    assetFolders.value = [];
    jobs.value = [];
    return project;
  }

  async function refreshProjects(options?: {
    sortBy?: 'createdAt' | 'name' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    const result = await getProjectsApi(options);
    projects.value = result.items;
    if (
      !projects.value.some((project) => project.id === currentProjectId.value)
    ) {
      currentProjectId.value =
        result.currentProjectId ?? projects.value[0]?.id ?? '';
    }
  }

  async function updateProject(
    projectId: string,
    input: { description?: string; name?: string },
  ) {
    const updated = await updateProjectApi(projectId, input);
    const project = projects.value.find((item) => item.id === projectId);
    if (project) {
      project.name = updated.name;
      project.description = updated.description;
      project.updatedAt = new Date().toISOString();
    }
    return updated;
  }

  async function deleteProject(projectId: string) {
    await deleteProjectApi(projectId);
    await refreshProjects();
    if (currentProjectId.value) {
      await selectCurrentProjectApi(currentProjectId.value);
    }
    await refreshCurrentProjectData();
  }

  async function setProjectPinned(projectId: string, pinned: boolean) {
    await setProjectPinnedApi(projectId, pinned);
    const project = projects.value.find((item) => item.id === projectId);
    if (project) project.isPinned = pinned;
    projects.value = projects.value.toSorted(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async function refreshAssetFolders() {
    if (!currentProjectId.value) {
      assetFolders.value = [];
      return;
    }
    assetFolders.value = await getAssetFoldersApi(currentProjectId.value);
  }

  async function createAssetFolder(name: string, parentId?: null | string) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const folder = await createAssetFolderApi({
      name,
      parentId,
      projectId: currentProjectId.value,
    });
    assetFolders.value.push(folder);
    return folder;
  }

  async function renameAssetFolder(folderId: string, name: string) {
    await renameAssetFolderApi(folderId, name);
    const folder = assetFolders.value.find((item) => item.id === folderId);
    if (folder) folder.name = name;
  }

  async function deleteAssetFolder(folderId: string) {
    const result = await deleteAssetFolderApi(folderId);
    await Promise.all([refreshAssetFolders(), refreshProjects()]);
    return result;
  }

  async function batchAssets(
    assetIds: string[],
    operation: 'copy' | 'delete' | 'move',
    targetFolderId?: null | string,
    sourceFolderId?: null | string,
  ) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const result = await batchAssetsApi({
      assetIds,
      operation,
      projectId: currentProjectId.value,
      targetFolderId,
    });
    await Promise.all([
      refreshAssetFolders(),
      refreshCurrentProjectAssets({ folderId: sourceFolderId ?? 'root' }),
    ]);
    await refreshProjects();
    return result;
  }

  async function toggleAssetFavorite(
    assetId: string,
    options?: {
      folderId?: string;
      ownerId?: string;
      sortBy?: 'createdAt' | 'name' | 'owner' | 'type';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const asset = assets.value.find((item) => item.id === assetId);
    if (!asset) return;
    const updated = await setAssetFavoriteApi(assetId, !asset.favorite);
    await Promise.all([
      refreshAssetFolders(),
      refreshCurrentProjectAssets(options),
    ]);
    return updated;
  }

  async function deleteAsset(assetId: string) {
    await deleteAssetApi(assetId);
    const index = assets.value.findIndex((item) => item.id === assetId);
    if (index !== -1) assets.value.splice(index, 1);
    const project = currentProject.value;
    if (project && project.assetCount > 0) project.assetCount -= 1;
  }

  async function renameAsset(assetId: string, name: string) {
    const updated = await renameAssetApi(assetId, name);
    const index = assets.value.findIndex((item) => item.id === assetId);
    if (index !== -1) assets.value[index] = updated;
    return updated;
  }

  async function saveWorkflowOutput(assetId: string, folderId?: string) {
    const asset = await saveWorkflowOutputApi(assetId, folderId);
    if (!assets.value.some((item) => item.id === asset.id)) {
      assets.value.unshift(asset);
      const project = currentProject.value;
      if (project) project.assetCount += 1;
    }
    for (const job of jobs.value) {
      const output = job.outputs.find((item) => item.assetId === assetId);
      if (output) output.saved = true;
    }
    return asset;
  }

  async function setApplicationVisibility(appKey: string, visible: boolean) {
    const updated = await setApplicationVisibilityApi(appKey, visible);
    const application = applications.value.find((item) => item.key === appKey);
    if (application) {
      application.visible = updated.visible;
      application.updatedAt = updated.updatedAt;
    }
    return updated;
  }

  async function toggleUserStatus(userId: string) {
    const user = users.value.find((item) => item.id === userId);
    if (!user) return;
    const status = user.status === 'enabled' ? 'disabled' : 'enabled';
    await setUserStatusApi(userId, status);
    user.status = status;
  }

  async function updateUserRoles(userId: string, roles: string[]) {
    const updated = await setUserRolesApi(userId, roles);
    const user = users.value.find((item) => item.id === userId);
    if (!user) return updated;
    user.roleCodes = updated.roleCodes;
    user.roles = updated.roles;
    return updated;
  }

  async function uploadAsset(input: {
    derivedFromAssetId?: string;
    description?: string;
    file: File;
    folderId?: string;
    name: string;
    tags?: string[];
    type: AssetType;
  }) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const asset = await uploadAssetApi({
      description: input.description ?? '',
      derivedFromAssetId: input.derivedFromAssetId,
      file: input.file,
      folderId: input.folderId,
      kind: input.type,
      name: input.name,
      projectId: currentProjectId.value,
      tags: input.tags,
    });
    assets.value.unshift(asset);
    const project = currentProject.value;
    if (project) project.assetCount += 1;
    return asset;
  }

  async function createTextAsset(input: {
    content: string;
    description?: string;
    folderId?: string;
    name: string;
    tags?: string[];
  }) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const asset = await createTextAssetApi({
      content: input.content,
      description: input.description ?? '',
      folderId: input.folderId,
      name: input.name,
      projectId: currentProjectId.value,
      tags: input.tags,
    });
    assets.value.unshift(asset);
    const project = currentProject.value;
    if (project) project.assetCount += 1;
    return asset;
  }

  async function runApplication(
    appKey: string,
    executionContext:
      | {
          designConversationId: string;
          designMode?: 'cabin' | 'cmf' | 'component' | 'report';
        }
      | { workspaceInstanceId: string },
    inputAssetIds: string[],
    parameters: Record<string, unknown>,
    inputTransferIds: string[] = [],
    inputAnnotations: Array<{ assetId: string; position: number }> = [],
  ) {
    const application = applications.value.find((item) => item.key === appKey);
    if (!application || !currentProjectId.value) return;
    const job = await createJobApi({
      appKey,
      ...executionContext,
      inputAssetIds,
      inputAnnotations,
      inputTransferIds,
      name: `${application.shortName}方案 · ${currentProject.value?.name ?? '未命名项目'}`,
      parameters,
      projectId: currentProjectId.value,
    });
    jobs.value.unshift(job);
    return job;
  }

  async function cancelJob(jobId: string) {
    const result = await cancelJobApi(jobId);
    const job = jobs.value.find((item) => item.id === jobId);
    if (job) {
      job.status = result.status;
      job.stage =
        result.status === 'cancelling' ? '正在取消外部任务' : '任务已取消';
    }
    return result;
  }

  async function archiveJobs(jobIds: string[]) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const result = await batchJobsApi({
      jobIds,
      operation: 'archive',
      projectId: currentProjectId.value,
    });
    jobs.value = jobs.value.filter((job) => !jobIds.includes(job.id));
    await refreshProjects();
    return result;
  }

  async function loadAdministration() {
    const [nextUsers, nextRoles] = await Promise.all([
      getUsersApi(),
      getRolesApi(),
    ]);
    users.value = nextUsers;
    roles.value = nextRoles;
  }

  async function loadAuditEvents(params?: {
    actorId?: string;
    limit?: number;
    module?: string;
    page?: number;
  }) {
    const result = await getAuditEventsApi(params);
    auditEvents.value = result.items;
    auditScope.value = result.scope;
    auditTotal.value = result.total;
    return result;
  }

  function $reset() {
    currentProjectId.value = '';
    projects.value = [];
    assets.value = [];
    assetFolders.value = [];
    applications.value = [];
    jobs.value = [];
    users.value = [];
    roles.value = [];
    auditEvents.value = [];
    auditScope.value = 'self';
    auditTotal.value = 0;
    initialized.value = false;
    loading.value = false;
    initialization = undefined;
  }

  return {
    $reset,
    activeJobs,
    addProject,
    archiveJobs,
    applications,
    assetFolders,
    assets,
    batchAssets,
    auditEvents,
    auditScope,
    auditTotal,
    cancelJob,
    createTextAsset,
    createAssetFolder,
    deleteAsset,
    deleteAssetFolder,
    deleteProject,
    currentAssets,
    currentJobs,
    currentProject,
    currentProjectId,
    initialize,
    initialized,
    jobs,
    loadAdministration,
    loadAuditEvents,
    loading,
    projects,
    refreshCurrentProjectAssets,
    refreshCurrentProjectData,
    refreshCurrentProjectJobs,
    refreshAssetFolders,
    refreshProjects,
    renameAsset,
    renameAssetFolder,
    roles,
    runApplication,
    saveWorkflowOutput,
    setApplicationVisibility,
    setProjectPinned,
    switchProject,
    toggleAssetFavorite,
    toggleUserStatus,
    updateProject,
    updateUserRoles,
    uploadAsset,
    users,
  };
});
