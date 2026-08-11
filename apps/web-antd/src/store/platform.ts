import type { AssetType } from '#/modules/platform/types';

import { computed, ref } from 'vue';

import { defineStore } from 'pinia';

import {
  cancelJobApi,
  createJobApi,
  createProjectApi,
  createTextAssetApi,
  deleteAssetApi,
  getApplicationsApi,
  getAssetsApi,
  getAuditEventsApi,
  getJobsApi,
  getProjectsApi,
  getRolesApi,
  getUsersApi,
  saveWorkflowOutputApi,
  selectCurrentProjectApi,
  setApplicationVisibilityApi,
  setAssetFavoriteApi,
  setUserRolesApi,
  setUserStatusApi,
  uploadAssetApi,
} from '#/api';

import { isActivePlatformJob, normalizePlatformJobs } from './platform/helpers';

export const usePlatformStore = defineStore('rail-platform', () => {
  const currentProjectId = ref('');
  const projects = ref<Awaited<ReturnType<typeof getProjectsApi>>['items']>([]);
  const assets = ref<Awaited<ReturnType<typeof getAssetsApi>>>([]);
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
      jobs.value = [];
      return;
    }
    const projectId = currentProjectId.value;
    const [nextAssets, nextJobs] = await Promise.all([
      getAssetsApi(projectId),
      getJobsApi(projectId),
    ]);
    if (currentProjectId.value === projectId) {
      assets.value = nextAssets;
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
    jobs.value = [];
    return project;
  }

  async function toggleAssetFavorite(assetId: string) {
    const asset = assets.value.find((item) => item.id === assetId);
    if (!asset) return;
    const updated = await setAssetFavoriteApi(assetId, !asset.favorite);
    const index = assets.value.findIndex((item) => item.id === assetId);
    if (index !== -1) assets.value[index] = updated;
  }

  async function deleteAsset(assetId: string) {
    await deleteAssetApi(assetId);
    const index = assets.value.findIndex((item) => item.id === assetId);
    if (index !== -1) assets.value.splice(index, 1);
    const project = currentProject.value;
    if (project && project.assetCount > 0) project.assetCount -= 1;
  }

  async function saveWorkflowOutput(assetId: string) {
    const asset = await saveWorkflowOutputApi(assetId);
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
    name: string;
    tags?: string[];
    type: AssetType;
  }) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const asset = await uploadAssetApi({
      description: input.description ?? '',
      derivedFromAssetId: input.derivedFromAssetId,
      file: input.file,
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
    name: string;
    tags?: string[];
  }) {
    if (!currentProjectId.value) throw new Error('请先创建或选择项目');
    const asset = await createTextAssetApi({
      content: input.content,
      description: input.description ?? '',
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
      | { designConversationId: string }
      | { workspaceInstanceId: string },
    inputAssetIds: string[],
    parameters: Record<string, unknown>,
    inputTransferIds: string[] = [],
  ) {
    const application = applications.value.find((item) => item.key === appKey);
    if (!application || !currentProjectId.value) return;
    const job = await createJobApi({
      appKey,
      ...executionContext,
      inputAssetIds,
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
    applications,
    assets,
    auditEvents,
    auditScope,
    auditTotal,
    cancelJob,
    createTextAsset,
    deleteAsset,
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
    refreshCurrentProjectData,
    roles,
    runApplication,
    saveWorkflowOutput,
    setApplicationVisibility,
    switchProject,
    toggleAssetFavorite,
    toggleUserStatus,
    updateUserRoles,
    uploadAsset,
    users,
  };
});
