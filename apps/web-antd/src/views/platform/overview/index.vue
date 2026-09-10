<script lang="ts" setup>
import type { PlatformProject, ProjectMember } from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Input,
  message,
  Modal,
  Popover,
  Select,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  getProjectMembersApi,
  inviteProjectMemberApi,
  removeProjectMemberApi,
} from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { usePlatformStore } from '#/store';
import { copyTextToClipboard } from '#/utils/copy-text';

import { getWorkbenchTools } from './workbench-tools';

const props = withDefaults(
  defineProps<{ embedded?: boolean; initialCreate?: boolean }>(),
  { embedded: false, initialCreate: false },
);
const router = useRouter();
const route = useRoute();
const platformStore = usePlatformStore();
const userStore = useUserStore();
const keyword = ref('');
const sortValue = ref('updatedAt-desc');
const createOpen = ref(props.initialCreate);
watch(
  () => route.fullPath,
  () => {
    if (
      route.name === 'PlatformProjectManagement' &&
      route.query.create === 'true'
    )
      createOpen.value = true;
  },
  { immediate: true },
);
const projectName = ref('');
const projectDescription = ref('');
const editOpen = ref(false);
const editName = ref('');
const editDescription = ref('');
const actionProject = ref<PlatformProject>();
const submitting = ref(false);
const removingMemberId = ref('');
const membersOpen = ref(false);
const membersLoading = ref(false);
const projectMembers = ref<ProjectMember[]>([]);
const memberKeyword = ref('');
const memberPopoverProjectId = ref('');
const memberPreviewLoading = ref(false);
const memberPreviewKeyword = ref('');
const memberPreviewMembers = ref<ProjectMember[]>([]);
const canInviteMembers = ref(false);
const inviteUserId = ref('');
const inviteRole = ref<'editor' | 'viewer'>('editor');
const viewMode = ref<'grid' | 'list'>('grid');
const currentPage = ref(1);
const pageSize = ref(12);
const sortOptions = [
  { label: '更新时间：最新优先', value: 'updatedAt-desc' },
  { label: '更新时间：最早优先', value: 'updatedAt-asc' },
  { label: '创建时间：最新优先', value: 'createdAt-desc' },
  { label: '创建时间：最早优先', value: 'createdAt-asc' },
  { label: '名称：A–Z', value: 'name-asc' },
  { label: '名称：Z–A', value: 'name-desc' },
];

const isPlatformAdmin = computed(() => userStore.userRoles.includes('admin'));
const workbenchTools = computed(() => getWorkbenchTools(isPlatformAdmin.value));

const filteredProjects = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return platformStore.projects.filter(
    (project) =>
      !query ||
      `${project.name}${project.code}${project.description}`
        .toLowerCase()
        .includes(query),
  );
});
const totalAssets = computed(() =>
  platformStore.projects.reduce(
    (total, project) => total + project.assetCount,
    0,
  ),
);
const totalActiveJobs = computed(() =>
  platformStore.projects.reduce(
    (total, project) => total + project.activeJobCount,
    0,
  ),
);
const totalJobs = computed(() =>
  platformStore.projects.reduce(
    (total, project) => total + project.jobCount,
    0,
  ),
);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredProjects.value.length / pageSize.value)),
);
const pagedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredProjects.value.slice(start, start + pageSize.value);
});
const filteredProjectMembers = computed(() => {
  const query = memberKeyword.value.trim().toLowerCase();
  if (!query) return projectMembers.value;
  return projectMembers.value.filter((member) =>
    `${member.name}${member.username}${member.publicId}${member.department}`
      .toLowerCase()
      .includes(query),
  );
});
const filteredMemberPreviews = computed(() => {
  const query = memberPreviewKeyword.value.trim().toLowerCase();
  if (!query) return memberPreviewMembers.value;
  return memberPreviewMembers.value.filter((member) =>
    `${member.name}${member.username}${member.publicId}`
      .toLowerCase()
      .includes(query),
  );
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatProjectDate(value: string) {
  return dateFormatter.format(new Date(value)).replaceAll('/', '-');
}

function hiddenMemberCount(project: PlatformProject) {
  return Math.max(0, project.members - 3);
}

async function openWorkbenchTool(path: string) {
  await router.push(path);
}

async function copyProjectCode(code: string) {
  const copied = await copyTextToClipboard(code);
  if (copied) {
    message.success('项目编号已复制');
    return;
  }
  message.error('复制失败，请检查浏览器剪贴板权限后重试');
}

async function enterProject(
  project: PlatformProject,
  path: '/assets' | '/design' | '/jobs',
  query?: Record<string, string>,
) {
  await platformStore.switchProject(project.id);
  await router.push({ path, query });
}

function syncProjectMemberPreviews(
  project: PlatformProject,
  members: ProjectMember[],
) {
  project.members = members.length;
  project.memberPreviews = members.slice(0, 3).map((member) => ({
    avatar: member.avatar,
    name: member.name,
    publicId: member.publicId,
  }));
}

async function createProject() {
  if (!projectName.value.trim()) return;
  submitting.value = true;
  try {
    const project = await platformStore.addProject(
      projectName.value.trim(),
      projectDescription.value.trim() || '新建轨道客室设计项目。',
    );
    createOpen.value = false;
    projectName.value = '';
    projectDescription.value = '';
    message.success(`项目“${project.name}”已创建`);
  } finally {
    submitting.value = false;
  }
}

function openEdit(project: PlatformProject) {
  actionProject.value = project;
  editName.value = project.name;
  editDescription.value = project.description;
  editOpen.value = true;
}

async function saveProject() {
  const project = actionProject.value;
  const name = editName.value.trim();
  if (!project || !name) return;
  submitting.value = true;
  try {
    await platformStore.updateProject(project.id, {
      description: editDescription.value.trim(),
      name,
    });
    editOpen.value = false;
    message.success('项目信息已更新');
  } finally {
    submitting.value = false;
  }
}

async function openMembers(project: PlatformProject) {
  actionProject.value = project;
  membersOpen.value = true;
  memberKeyword.value = '';
  inviteUserId.value = '';
  membersLoading.value = true;
  try {
    const result = await getProjectMembersApi(project.id);
    projectMembers.value = result.items;
    canInviteMembers.value = result.canInvite;
    syncProjectMemberPreviews(project, result.items);
  } finally {
    membersLoading.value = false;
  }
}

async function toggleMemberPopover(project: PlatformProject, open: boolean) {
  if (!open) {
    if (memberPopoverProjectId.value === project.id)
      memberPopoverProjectId.value = '';
    return;
  }
  memberPopoverProjectId.value = project.id;
  memberPreviewKeyword.value = '';
  memberPreviewMembers.value = [];
  memberPreviewLoading.value = true;
  try {
    const result = await getProjectMembersApi(project.id);
    if (memberPopoverProjectId.value !== project.id) return;
    memberPreviewMembers.value = result.items;
    syncProjectMemberPreviews(project, result.items);
  } finally {
    if (memberPopoverProjectId.value === project.id)
      memberPreviewLoading.value = false;
  }
}

async function inviteMember() {
  const project = actionProject.value;
  const userPublicId = inviteUserId.value.trim().toUpperCase();
  if (!project || !userPublicId) return;
  submitting.value = true;
  try {
    await inviteProjectMemberApi(project.id, {
      projectRole: inviteRole.value,
      userPublicId,
    });
    const result = await getProjectMembersApi(project.id);
    projectMembers.value = result.items;
    canInviteMembers.value = result.canInvite;
    syncProjectMemberPreviews(project, result.items);
    inviteUserId.value = '';
    message.success('成员已加入项目');
  } finally {
    submitting.value = false;
  }
}

function confirmRemoveMember(member: ProjectMember) {
  const project = actionProject.value;
  if (!project || member.projectRole === 'owner') return;
  Modal.confirm({
    cancelText: '取消',
    content:
      '移除后，该用户将无法继续访问本项目；其已经创建的资产、任务、设计会话和审计记录仍会完整保留。',
    okButtonProps: { danger: true },
    okText: '移除成员',
    async onOk() {
      removingMemberId.value = member.userId;
      try {
        await removeProjectMemberApi(project.id, member.publicId);
        const result = await getProjectMembersApi(project.id);
        projectMembers.value = result.items;
        canInviteMembers.value = result.canInvite;
        syncProjectMemberPreviews(project, result.items);
        message.success(`已将“${member.name}”移出项目`);
      } finally {
        removingMemberId.value = '';
      }
    },
    title: `移除成员“${member.name}”？`,
  });
}

async function togglePinned(project: PlatformProject) {
  await platformStore.setProjectPinned(project.id, !project.isPinned);
  const [sortBy, sortOrder] = sortValue.value.split('-') as [
    'createdAt' | 'name' | 'updatedAt',
    'asc' | 'desc',
  ];
  await platformStore.refreshProjects({ sortBy, sortOrder });
  message.success(project.isPinned ? '项目已置顶' : '已取消置顶');
}

watch(sortValue, async (value) => {
  const [sortBy, sortOrder] = value.split('-') as [
    'createdAt' | 'name' | 'updatedAt',
    'asc' | 'desc',
  ];
  await platformStore.refreshProjects({ sortBy, sortOrder });
  currentPage.value = 1;
});

watch(keyword, () => {
  currentPage.value = 1;
});

watch(pageSize, () => {
  currentPage.value = 1;
});

watch(totalPages, (value) => {
  if (currentPage.value > value) currentPage.value = value;
});

function confirmDeleteProject(project: PlatformProject) {
  Modal.confirm({
    cancelText: '取消',
    content:
      '项目会从所有成员的项目列表中隐藏，但资产、任务、设计会话和审计记录会完整保留。',
    okButtonProps: { danger: true },
    okText: '删除项目',
    async onOk() {
      await platformStore.deleteProject(project.id);
      message.success(`项目“${project.name}”已删除`);
    },
    title: `删除项目“${project.name}”？`,
  });
}
</script>

<template>
  <main
    class="platform-page projects-overview-page"
    :class="{ 'projects-overview--embedded': embedded }"
  >
    <PageHeading
      v-if="!embedded"
      :description="`集中管理当前账号可访问的 ${platformStore.projects.length} 个项目、协作关系与平台记录，共 ${totalAssets} 项资产，${totalActiveJobs} 个任务正在运行。`"
      title="项目管理"
    >
      <template #extra>
        <Button
          :disabled="submitting"
          type="primary"
          @click="createOpen = true"
        >
          <IconifyIcon icon="lucide:plus" />
          新建项目
        </Button>
      </template>
    </PageHeading>

    <div v-if="embedded" class="embedded-project-actions">
      <Button type="primary" :disabled="submitting" @click="createOpen = true">
        新建项目
      </Button>
    </div>
    <div class="platform-content project-overview-content">
      <section v-if="!embedded" class="project-summary" aria-label="项目汇总">
        <article class="project-summary-card project-summary-card--projects">
          <span class="project-summary-card__icon">
            <IconifyIcon :icon="platformSemanticIcons.projects" />
          </span>
          <div>
            <span>项目总数</span>
            <div class="project-summary-card__value">
              <strong>{{ platformStore.projects.length }}</strong>
              <small>个项目</small>
            </div>
          </div>
        </article>
        <article class="project-summary-card project-summary-card--assets">
          <span class="project-summary-card__icon">
            <IconifyIcon :icon="platformSemanticIcons.assets" />
          </span>
          <div>
            <span>项目资产</span>
            <div class="project-summary-card__value">
              <strong>{{ totalAssets }}</strong>
              <small>项资产</small>
            </div>
          </div>
        </article>
        <article class="project-summary-card project-summary-card--jobs">
          <span class="project-summary-card__icon">
            <IconifyIcon :icon="platformSemanticIcons.jobs" />
          </span>
          <div>
            <span>累计任务</span>
            <div class="project-summary-card__value">
              <strong>{{ totalJobs }}</strong>
              <small>项任务</small>
            </div>
          </div>
        </article>
        <article
          :class="{ 'has-active-jobs': totalActiveJobs > 0 }"
          class="project-summary-card project-summary-card--active"
        >
          <span class="project-summary-card__icon">
            <IconifyIcon :icon="platformSemanticIcons.runningJobs" />
          </span>
          <div>
            <span>运行任务</span>
            <div class="project-summary-card__value">
              <strong>{{ totalActiveJobs }}</strong>
              <small>个任务正在运行</small>
            </div>
          </div>
        </article>
      </section>

      <section
        v-if="!embedded"
        :class="{ 'has-single-tool': workbenchTools.length === 1 }"
        class="platform-panel workbench-tools"
        aria-label="设计工作台管理入口"
      >
        <header class="workbench-tools__header">
          <div>
            <strong>平台管理与记录</strong>
            <span>
              {{
                isPlatformAdmin
                  ? '集中进入用户权限、工作流配置和全平台操作日志。'
                  : '查看当前账号自己的平台操作记录。'
              }}
            </span>
          </div>
          <span v-if="isPlatformAdmin" class="workbench-tools__badge">
            管理员工具
          </span>
        </header>
        <div class="workbench-tools__grid">
          <button
            v-for="tool in workbenchTools"
            :key="tool.key"
            :data-workbench-tool="tool.key"
            type="button"
            @click="openWorkbenchTool(tool.path)"
          >
            <span class="workbench-tools__icon">
              <IconifyIcon :icon="tool.icon" />
            </span>
            <span class="workbench-tools__copy">
              <strong>{{ tool.title }}</strong>
              <small>{{ tool.description }}</small>
            </span>
            <IconifyIcon
              class="workbench-tools__arrow"
              icon="lucide:arrow-right"
            />
          </button>
        </div>
      </section>

      <section class="platform-panel project-list-shell">
        <header class="project-overview-toolbar">
          <div class="project-list-title">
            <strong>我的项目</strong>
            <span>
              {{ filteredProjects.length }} /
              {{ platformStore.projects.length }}
            </span>
          </div>
          <div class="project-toolbar-controls">
            <label class="project-sort-label">
              <span>排序：</span>
              <Select
                v-model:value="sortValue"
                aria-label="项目排序"
                :options="sortOptions"
                class="project-sort"
              />
            </label>
            <Input
              v-model:value="keyword"
              allow-clear
              class="project-search"
              placeholder="搜索项目名称或编号"
            >
              <template #prefix><IconifyIcon icon="lucide:search" /></template>
            </Input>
            <div class="project-view-switch" aria-label="项目视图">
              <button
                aria-label="网格视图"
                :class="{ active: viewMode === 'grid' }"
                type="button"
                @click="viewMode = 'grid'"
              >
                <IconifyIcon icon="lucide:grid-2x2" />
              </button>
              <button
                aria-label="列表视图"
                :class="{ active: viewMode === 'list' }"
                type="button"
                @click="viewMode = 'list'"
              >
                <IconifyIcon icon="lucide:list" />
              </button>
            </div>
          </div>
        </header>

        <div
          v-if="pagedProjects.length"
          class="project-card-grid"
          :class="{ 'project-card-grid--list': viewMode === 'list' }"
        >
          <section
            v-for="project in pagedProjects"
            :key="project.id"
            :data-project-id="project.id"
            class="project-dashboard"
            role="link"
            tabindex="0"
            @click="enterProject(project, '/design')"
            @keydown.enter="enterProject(project, '/design')"
            @keydown.space.prevent="enterProject(project, '/design')"
          >
            <div class="project-dashboard__hero">
              <span class="project-dashboard__folder" aria-hidden="true">
                <IconifyIcon icon="lucide:folder" />
              </span>
              <div class="project-dashboard__copy">
                <h2>{{ project.name }}</h2>
                <div class="project-dashboard__code">
                  <code>{{ project.code }}</code>
                  <Tooltip title="复制项目编号">
                    <button
                      :aria-label="`复制项目编号 ${project.code}`"
                      type="button"
                      @click.stop="copyProjectCode(project.code)"
                    >
                      <IconifyIcon icon="lucide:copy" />
                    </button>
                  </Tooltip>
                </div>
                <p>{{ project.description || '暂无项目说明' }}</p>
              </div>
              <div class="project-dashboard__actions">
                <Tooltip :title="project.isPinned ? '取消置顶' : '置顶项目'">
                  <button
                    :aria-label="project.isPinned ? '取消置顶项目' : '置顶项目'"
                    :class="{ active: project.isPinned }"
                    type="button"
                    @click.stop="togglePinned(project)"
                  >
                    <IconifyIcon icon="lucide:pin" />
                  </button>
                </Tooltip>
                <Tooltip title="修改项目名称与说明">
                  <button
                    aria-label="修改项目信息"
                    type="button"
                    @click.stop="openEdit(project)"
                  >
                    <IconifyIcon icon="lucide:pencil" />
                  </button>
                </Tooltip>
                <Tooltip v-if="project.canDelete" title="删除项目">
                  <button
                    aria-label="删除项目"
                    class="danger"
                    type="button"
                    @click.stop="confirmDeleteProject(project)"
                  >
                    <IconifyIcon icon="lucide:trash-2" />
                  </button>
                </Tooltip>
              </div>
              <div class="project-dashboard__members" @click.stop>
                <span
                  v-for="member in project.memberPreviews"
                  :key="member.publicId"
                  class="project-member-avatar"
                  :title="member.name"
                >
                  <img
                    v-if="member.avatar"
                    :alt="member.name"
                    :src="member.avatar"
                  />
                  <span v-else aria-hidden="true">
                    {{ member.name.slice(0, 1) }}
                  </span>
                </span>
                <Popover
                  v-if="hiddenMemberCount(project) > 0"
                  :open="memberPopoverProjectId === project.id"
                  overlay-class-name="project-member-popover-overlay"
                  placement="bottomRight"
                  trigger="click"
                  @open-change="(open) => toggleMemberPopover(project, open)"
                >
                  <button
                    :aria-label="`查看${project.name}全部${project.members}名成员`"
                    class="project-member-overflow"
                    type="button"
                    @click.stop
                  >
                    +{{ hiddenMemberCount(project) }}
                  </button>
                  <template #content>
                    <section class="member-preview-popover" @click.stop>
                      <header>
                        <strong>
                          <IconifyIcon icon="lucide:users" />
                          {{ project.members }} 名项目成员
                        </strong>
                      </header>
                      <Input
                        v-model:value="memberPreviewKeyword"
                        allow-clear
                        placeholder="筛选成员"
                      >
                        <template #prefix>
                          <IconifyIcon icon="lucide:search" />
                        </template>
                      </Input>
                      <div
                        v-if="memberPreviewLoading"
                        class="member-preview-state"
                      >
                        正在读取成员…
                      </div>
                      <div v-else class="member-preview-list">
                        <article
                          v-for="member in filteredMemberPreviews"
                          :key="member.userId"
                        >
                          <span class="member-preview-avatar">
                            <img
                              v-if="member.avatar"
                              :alt="member.name"
                              :src="member.avatar"
                            />
                            <span v-else>{{ member.name.slice(0, 1) }}</span>
                          </span>
                          <strong>{{ member.name }}</strong>
                          <span>· {{ member.username }}</span>
                        </article>
                        <div
                          v-if="!filteredMemberPreviews.length"
                          class="member-preview-state"
                        >
                          没有匹配的成员
                        </div>
                      </div>
                    </section>
                  </template>
                </Popover>
              </div>
              <small class="project-dashboard__updated">
                <IconifyIcon icon="lucide:clock-3" />
                更新于 {{ formatProjectDate(project.updatedAt) }}
              </small>
            </div>

            <div class="project-dashboard__metrics">
              <button
                type="button"
                @click.stop="enterProject(project, '/assets')"
              >
                <span>项目资产</span>
                <strong>{{ project.assetCount }}</strong>
                <small>统一登记与版本追踪</small>
              </button>
              <button
                type="button"
                @click.stop="enterProject(project, '/jobs')"
              >
                <span>累计任务</span>
                <strong>{{ project.jobCount }}</strong>
                <small>保留完整设计台账</small>
              </button>
              <button
                type="button"
                @click.stop="
                  enterProject(project, '/jobs', { status: 'active' })
                "
              >
                <span>运行任务</span>
                <strong :class="{ active: project.activeJobCount > 0 }">
                  {{ project.activeJobCount }}
                </strong>
                <small>不同会话可并行执行</small>
              </button>
              <button type="button" @click.stop="openMembers(project)">
                <span>项目成员</span>
                <strong>{{ project.members }}</strong>
                <small>查看成员与贡献数据</small>
              </button>
            </div>

            <footer class="project-dashboard__footer">
              <Button
                type="primary"
                @click.stop="enterProject(project, '/design')"
              >
                <IconifyIcon icon="lucide:message-square" />
                开始设计
              </Button>
            </footer>
          </section>
        </div>

        <section v-else class="project-empty">
          <IconifyIcon icon="lucide:folder-search-2" />
          <h2>{{ keyword ? '没有匹配的项目' : '还没有项目' }}</h2>
          <p>
            {{
              keyword
                ? '请调整搜索关键词。'
                : '创建项目后即可组织资产和设计会话。'
            }}
          </p>
          <Button v-if="!keyword" type="primary" @click="createOpen = true">
            <IconifyIcon icon="lucide:plus" />
            创建第一个项目
          </Button>
        </section>

        <footer class="project-list-pagination">
          <div class="project-pagination-controls">
            <button
              aria-label="上一页"
              :disabled="currentPage <= 1"
              type="button"
              @click="currentPage -= 1"
            >
              <IconifyIcon icon="lucide:chevron-left" />
            </button>
            <button class="active" type="button">{{ currentPage }}</button>
            <button
              aria-label="下一页"
              :disabled="currentPage >= totalPages"
              type="button"
              @click="currentPage += 1"
            >
              <IconifyIcon icon="lucide:chevron-right" />
            </button>
            <span>共 {{ totalPages }} 页</span>
          </div>
          <label class="project-page-size">
            <span>每页显示</span>
            <Select
              v-model:value="pageSize"
              aria-label="每页显示数量"
              :options="[
                { label: '12 条', value: 12 },
                { label: '24 条', value: 24 },
                { label: '48 条', value: 48 },
              ]"
            />
          </label>
        </footer>
      </section>
    </div>

    <Modal
      v-model:open="createOpen"
      :confirm-loading="submitting"
      :ok-button-props="{ disabled: !projectName.trim() }"
      ok-text="创建项目"
      title="新建项目"
      @ok="createProject"
    >
      <div class="project-form">
        <label>
          <span>项目名称</span>
          <Input
            v-model:value="projectName"
            :maxlength="160"
            placeholder="例如：城际客室概念方案"
          />
        </label>
        <label>
          <span>项目说明</span>
          <Textarea
            v-model:value="projectDescription"
            :rows="4"
            placeholder="说明项目目标与范围"
          />
        </label>
      </div>
    </Modal>

    <Modal
      v-model:open="editOpen"
      :confirm-loading="submitting"
      :ok-button-props="{ disabled: !editName.trim() }"
      ok-text="保存"
      title="修改项目信息"
      @ok="saveProject"
    >
      <div class="project-form">
        <label>
          <span>项目名称</span>
          <Input
            v-model:value="editName"
            :maxlength="160"
            @press-enter="saveProject"
          />
        </label>
        <label class="project-description-field">
          <span>项目说明</span>
          <Textarea
            v-model:value="editDescription"
            :maxlength="2000"
            :rows="4"
          />
          <small class="project-description-count">
            {{ editDescription.length }} / 2000
          </small>
        </label>
      </div>
    </Modal>

    <Modal
      v-model:open="membersOpen"
      :footer="null"
      :title="`${actionProject?.name ?? ''} · 项目成员`"
      width="760px"
    >
      <div v-if="canInviteMembers" class="member-invite">
        <Input
          v-model:value="inviteUserId"
          :maxlength="10"
          placeholder="输入用户 ID，例如 USR-000002"
          @press-enter="inviteMember"
        />
        <Select
          v-model:value="inviteRole"
          :options="[
            { label: '编辑成员', value: 'editor' },
            { label: '只读成员', value: 'viewer' },
          ]"
        />
        <Button :loading="submitting" type="primary" @click="inviteMember">
          邀请成员
        </Button>
      </div>
      <p v-else class="member-notice">
        只有项目创建者或平台管理员可以通过用户 ID 邀请成员。
      </p>
      <div class="member-list-toolbar">
        <strong>
          <IconifyIcon icon="lucide:users" />
          {{ projectMembers.length }} 名项目成员
        </strong>
        <Input
          v-model:value="memberKeyword"
          allow-clear
          placeholder="按姓名、用户名或用户 ID 筛选"
        >
          <template #prefix><IconifyIcon icon="lucide:search" /></template>
        </Input>
      </div>
      <div v-if="membersLoading" class="member-loading">正在读取项目成员…</div>
      <div v-else class="member-list">
        <article
          v-for="member in filteredProjectMembers"
          :key="member.userId"
          :data-member-id="member.publicId"
        >
          <div class="member-avatar">
            <img v-if="member.avatar" :alt="member.name" :src="member.avatar" />
            <span v-else>{{ member.name.slice(0, 1) }}</span>
          </div>
          <div class="member-identity">
            <strong>{{ member.name }}</strong>
            <span>{{ member.publicId }} · {{ member.username }}</span>
            <small>{{ member.department || '未设置部门' }}</small>
          </div>
          <div class="member-contribution">
            <span>{{ member.assetCount }} 项资产</span>
            <span>{{ member.jobCount }} 个任务</span>
          </div>
          <div class="member-actions">
            <span class="member-role">
              {{
                member.projectRole === 'owner'
                  ? '创建者'
                  : member.projectRole === 'editor'
                    ? '编辑成员'
                    : '只读成员'
              }}
            </span>
            <button
              :aria-label="`移除 ${member.name}`"
              class="member-remove"
              :class="{
                'member-remove--disabled':
                  !canInviteMembers || member.projectRole === 'owner',
              }"
              :disabled="!canInviteMembers || member.projectRole === 'owner'"
              type="button"
              @click="confirmRemoveMember(member)"
            >
              {{ removingMemberId === member.userId ? '移除中…' : '移除' }}
            </button>
          </div>
        </article>
        <div v-if="!filteredProjectMembers.length" class="member-empty">
          没有匹配的项目成员
        </div>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.projects-overview--embedded {
  padding: 0;
}

.embedded-project-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.project-form {
  display: grid;
  gap: 16px;
}

.project-form label {
  display: grid;
  gap: 7px;
}

.project-description-field {
  align-content: start;
}

.project-description-count {
  min-height: 17px;
  padding-right: 2px;
  font-size: 12px;
  line-height: 17px;
  color: var(--rail-steel);
  text-align: right;
}

.member-invite {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 130px auto;
  gap: 10px;
  padding: 14px;
  margin-bottom: 14px;
  background: var(--rail-theme-surface, #f7f8f9);
  border: 1px solid var(--rail-line);
  border-radius: 10px;
}

.member-notice,
.member-loading {
  color: var(--rail-steel);
}

.member-list-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
}

.member-list-toolbar strong {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--rail-theme-text, #273244);
  white-space: nowrap;
}

.member-list-toolbar :deep(.ant-input-affix-wrapper) {
  width: min(320px, 100%);
}

.member-list {
  display: grid;
  gap: 8px;
  max-height: 480px;
  overflow-y: auto;
}

.member-list article {
  display: grid;
  grid-template-columns: 42px minmax(180px, 1fr) auto 164px;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--rail-line);
  border-radius: 10px;
}

.member-empty {
  padding: 36px 16px;
  color: var(--rail-steel);
  text-align: center;
}

.member-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  overflow: hidden;
  font-weight: 700;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 50%;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-identity,
.member-contribution {
  display: flex;
  flex-direction: column;
}

.member-identity span,
.member-identity small,
.member-contribution {
  font-size: 12px;
  color: var(--rail-steel);
}

.member-role {
  color: var(--rail-red);
}

.member-actions {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) 48px;
  gap: 12px;
  place-items: center end;
  min-width: 164px;
  font-size: 13px;
  line-height: 28px;
  white-space: nowrap;
}

.member-remove {
  min-width: 48px;
  height: 28px;
  padding: 0;
  font: inherit;
  color: var(--rail-red);
  text-align: right;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.member-remove:hover:not(:disabled) {
  color: var(--rail-theme-accent, #991229);
  text-decoration: underline;
}

.member-remove--disabled,
.member-remove:disabled {
  color: var(--rail-theme-muted, #aeb5ba);
  cursor: not-allowed;
}

@media (max-width: 1050px) {
  .project-dashboard__metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 680px) {
  .member-list-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .member-list-toolbar :deep(.ant-input-affix-wrapper) {
    width: 100%;
  }

  .project-overview-toolbar {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }

  .project-search {
    width: 100%;
  }

  .project-toolbar-controls {
    align-items: stretch;
  }

  .project-sort {
    width: 100%;
  }

  .project-dashboard__metrics {
    grid-template-columns: 1fr;
  }
}

/* 设计工作台：项目汇总、管理工具、双列项目卡与统一列表容器。 */
.projects-overview-page {
  --workbench-accent: #c71938;
  --workbench-accent-soft: #fff1f3;
  --workbench-border: var(--rail-theme-border, #e4e7ec);
  --workbench-running: #f07800;
  --workbench-running-soft: #fff5e9;

  background: var(--rail-theme-surface, #f7f8fa);
}

.projects-overview-page :deep(.platform-page-heading) {
  margin-bottom: 20px;
}

.projects-overview-page :deep(.platform-page-heading h1) {
  font-size: var(--rail-font-page-title);
  letter-spacing: -0.025em;
}

.projects-overview-page :deep(.platform-page-heading p) {
  margin-top: 6px;
  color: var(--rail-theme-secondary, #758194);
}

.projects-overview-page :deep(.platform-page-heading__extra .ant-btn) {
  height: 42px;
  padding-inline: 20px;
  font-weight: 650;
  color: #fff;
  background: var(--workbench-accent);
  border-color: var(--workbench-accent);
  border-radius: 7px;
  box-shadow: 0 6px 16px rgb(199 25 56 / 18%);
}

.projects-overview-page
  :deep(.platform-page-heading__extra .ant-btn:not(:disabled):hover) {
  color: #fff;
  background: var(--workbench-accent);
  border-color: var(--workbench-accent);
  filter: brightness(0.94);
}

.project-overview-content {
  display: grid;
  gap: 22px;
}

.project-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.project-summary-card {
  --summary-color: var(--workbench-accent);
  --summary-soft: var(--workbench-accent-soft);

  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  min-height: 98px;
  padding: 18px;
  overflow: hidden;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--workbench-border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgb(21 32 45 / 3%);
}

.project-summary-card__icon {
  display: grid;
  flex: 0 0 58px;
  place-items: center;
  width: 58px;
  height: 58px;
  font-size: var(--rail-icon-lg);
  color: var(--summary-color);
  background: var(--summary-soft);
  border-radius: 12px;
}

.project-summary-card > div {
  display: grid;
  gap: 7px;
  align-content: center;
  min-width: 0;
}

.project-summary-card > div > span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--rail-theme-secondary, #697589);
}

.project-summary-card__value {
  display: flex;
  gap: 7px;
  align-items: baseline;
}

.project-summary-card strong {
  font-size: 28px;
  font-weight: 760;
  line-height: 1;
  color: var(--rail-theme-text, #111827);
}

.project-summary-card small {
  font-size: 12px;
  line-height: 1.3;
  color: var(--rail-theme-secondary, #778398);
  white-space: nowrap;
}

.project-summary-card--active {
  --summary-color: #667085;
  --summary-soft: #f2f4f7;
}

.project-summary-card--active.has-active-jobs {
  --summary-color: var(--workbench-running);
  --summary-soft: var(--workbench-running-soft);
}

.workbench-tools {
  padding: 16px;
  border-color: var(--workbench-border);
  border-radius: 11px;
  box-shadow: 0 2px 7px rgb(21 32 45 / 4%);
}

.workbench-tools__header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 13px;
}

.workbench-tools__header > div {
  display: grid;
  gap: 3px;
}

.workbench-tools__header strong {
  font-size: var(--rail-font-section-title);
  color: var(--rail-theme-text, #222a35);
}

.workbench-tools__header span:not(.workbench-tools__badge) {
  font-size: 12px;
  color: var(--rail-theme-secondary, #778398);
}

.workbench-tools__badge {
  flex: 0 0 auto;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 650;
  color: var(--workbench-accent);
  background: var(--workbench-accent-soft);
  border-radius: 999px;
}

.workbench-tools__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.workbench-tools.has-single-tool .workbench-tools__grid {
  grid-template-columns: minmax(260px, 420px);
}

.workbench-tools__grid > button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 18px;
  gap: 11px;
  align-items: center;
  min-height: 72px;
  padding: 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: var(--rail-theme-surface, #fafbfc);
  border: 1px solid var(--workbench-border);
  border-radius: 9px;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.workbench-tools__grid > button:hover,
.workbench-tools__grid > button:focus-visible {
  outline: 0;
  background: var(--rail-theme-surface, #fff8fa);
  border-color: var(--rail-theme-border, #e4b5bf);
  box-shadow: 0 5px 14px rgb(21 32 45 / 6%);
}

.workbench-tools__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  font-size: var(--rail-icon-md);
  color: var(--workbench-accent);
  background: var(--workbench-accent-soft);
  border-radius: 9px;
}

.workbench-tools__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.workbench-tools__copy strong {
  font-size: 13px;
  color: var(--rail-theme-text, #253043);
}

.workbench-tools__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--rail-theme-secondary, #7a8595);
  white-space: nowrap;
}

.workbench-tools__arrow {
  color: var(--rail-theme-muted, #9aa3af);
  transition: transform 160ms ease;
}

.workbench-tools__grid > button:hover .workbench-tools__arrow,
.workbench-tools__grid > button:focus-visible .workbench-tools__arrow {
  color: var(--workbench-accent);
  transform: translateX(2px);
}

.project-list-shell {
  overflow: hidden;
  border-color: var(--workbench-border);
  border-radius: 11px;
  box-shadow: 0 2px 7px rgb(21 32 45 / 4%);
}

.project-overview-toolbar,
.project-list-title,
.project-toolbar-controls,
.project-sort-label,
.project-view-switch,
.project-list-pagination,
.project-pagination-controls,
.project-page-size {
  display: flex;
  align-items: center;
}

.project-overview-toolbar {
  min-height: 56px;
  padding: 10px 16px 0;
  border-bottom: 1px solid var(--rail-theme-border, #e5e8ec);
  border-radius: 0;
}

.project-list-title {
  gap: 10px;
  align-self: stretch;
  padding: 0 2px 10px;
  border-bottom: 3px solid var(--workbench-accent);
}

.project-list-title strong {
  font-size: var(--rail-font-section-title);
  color: var(--rail-theme-text, #222a35);
}

.project-list-title span {
  font-size: 12px;
  color: var(--rail-theme-secondary, #566276);
}

.project-toolbar-controls {
  gap: 12px;
  justify-content: flex-end;
  padding-bottom: 10px;
  margin-left: auto;
}

.project-sort-label {
  flex-shrink: 0;
  gap: 8px;
}

.project-sort-label > span {
  font-size: 13px;
  color: var(--rail-theme-secondary, #6f7a8d);
}

.project-sort {
  width: 212px;
}

.project-search {
  width: min(340px, 32vw);
}

.project-sort :deep(.ant-select-selector),
.project-search :deep(.ant-input-affix-wrapper) {
  border-radius: 7px;
}

.project-view-switch {
  flex-shrink: 0;
  padding: 2px;
  background: var(--rail-theme-surface, #f1f3f6);
  border: 1px solid var(--rail-theme-border, #e0e4e9);
  border-radius: 7px;
}

.project-view-switch button,
.project-pagination-controls button {
  display: grid;
  place-items: center;
  color: var(--rail-theme-text, #475569);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 5px;
}

.project-view-switch button {
  width: 37px;
  height: 31px;
  font-size: 18px;
}

.project-view-switch button.active {
  color: #fff;
  background: var(--workbench-accent);
  box-shadow: 0 3px 8px rgb(199 25 56 / 17%);
}

.project-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 16px;
  background: var(--rail-theme-surface, #fff);
}

.project-card-grid--list {
  grid-template-columns: 1fr;
}

.project-dashboard {
  --project-accent: var(--workbench-accent);
  --project-soft: var(--workbench-accent-soft);

  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--workbench-border);
  border-radius: 10px;
  box-shadow: 0 2px 7px rgb(21 32 45 / 6%);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.project-dashboard:hover,
.project-dashboard:focus-visible {
  outline: 0;
  border-color: var(--rail-theme-border, #cdd3da);
  box-shadow: 0 10px 24px rgb(21 32 45 / 10%);
  transform: translateY(-2px);
}

.project-dashboard__hero {
  position: relative;
  min-height: 152px;
  color: var(--rail-theme-text, #17202d);
  background: var(--rail-theme-surface, #fff);
  border: 0;
}

.project-dashboard__folder {
  position: absolute;
  top: 18px;
  left: 18px;
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  font-size: 37px;
  color: var(--project-accent);
  background: var(--project-soft);
  border-radius: 12px;
}

.project-dashboard__copy {
  display: block;
  min-height: 0;
  padding: 18px 190px 44px 108px;
}

.project-dashboard h2 {
  max-width: 100%;
  margin: 0 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 20px;
  font-weight: 720;
  line-height: 1.35;
  color: var(--rail-theme-text, #17202d);
  white-space: nowrap;
}

.project-dashboard__code {
  display: flex;
  gap: 5px;
  align-items: center;
  color: var(--rail-theme-secondary, #778398);
}

.project-dashboard__code code {
  font-family: inherit;
  font-size: 12px;
  color: var(--rail-theme-secondary, #778398);
}

.project-dashboard__code svg {
  font-size: 12px;
}

.project-dashboard__code button {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 5px;
}

.project-dashboard__code button:hover,
.project-dashboard__code button:focus-visible {
  color: var(--workbench-accent);
  outline: 0;
  background: var(--workbench-accent-soft);
}

.project-dashboard__copy p {
  margin: 14px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--rail-theme-secondary, #4f5b6d);
  white-space: nowrap;
}

.project-dashboard__actions {
  position: absolute;
  top: 15px;
  right: 15px;
  display: flex;
  gap: 3px;
  align-items: center;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  opacity: 1;
  backdrop-filter: none;
}

.project-dashboard__actions button {
  position: relative;
  display: grid;
  place-items: center;
  width: 33px;
  height: 33px;
  font-size: var(--rail-icon-sm);
  color: var(--rail-theme-secondary, #667386);
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.project-dashboard__actions button:focus-visible {
  outline: 2px solid rgb(197 28 55 / 28%);
  outline-offset: 1px;
}

.project-dashboard__actions button:hover,
.project-dashboard__actions button.active {
  color: var(--workbench-accent);
  background: var(--workbench-accent-soft);
}

.project-dashboard__actions button.danger::before {
  position: absolute;
  width: 1px;
  height: 20px;
  margin-left: -17px;
  content: '';
  background: var(--rail-theme-surface, #e3e6ea);
}

.project-dashboard__actions button.danger:hover {
  color: var(--workbench-accent);
  background: var(--workbench-accent-soft);
}

.project-dashboard__members {
  position: absolute;
  right: 18px;
  bottom: 13px;
  display: flex;
  align-items: center;
}

.project-member-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-left: -8px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 650;
  color: var(--project-accent);
  background: var(--project-soft);
  border: 2px solid var(--rail-theme-border, #fff);
  border-radius: 50%;
}

.project-member-avatar:first-child {
  margin-left: 0;
  color: var(--project-accent);
  background: var(--project-soft);
}

.project-member-overflow {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-left: -8px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  color: var(--rail-theme-secondary, #556276);
  cursor: pointer;
  background: var(--rail-theme-surface, #fff);
  border: 2px solid var(--rail-theme-border, #d0d5dd);
  border-radius: 50%;
  box-shadow: 0 0 0 2px #fff;
}

.project-member-overflow:hover,
.project-member-overflow:focus-visible {
  z-index: 2;
  color: var(--workbench-accent);
  outline: 0;
  background: var(--workbench-accent-soft);
  border-color: #d98a99;
}

.member-preview-popover {
  display: grid;
  gap: 10px;
  width: 292px;
}

.member-preview-popover header {
  padding-bottom: 9px;
  border-bottom: 1px solid var(--rail-theme-border, #e7eaf0);
}

.member-preview-popover header strong {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 14px;
  color: var(--rail-theme-text, #263246);
}

.member-preview-list {
  display: grid;
  gap: 3px;
  max-height: 280px;
  overflow-y: auto;
}

.member-preview-list article {
  display: grid;
  grid-template-columns: 26px auto minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  min-height: 36px;
  padding: 4px 6px;
  border-radius: 7px;
}

.member-preview-list article:hover {
  background: var(--rail-theme-surface, #f5f7fa);
}

.member-preview-list article > strong,
.member-preview-list article > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-preview-list article > strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--rail-theme-text, #344054);
}

.member-preview-list article > span:last-child {
  font-size: 12px;
  color: var(--rail-theme-secondary, #8a94a5);
}

.member-preview-avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  overflow: hidden;
  font-size: 11px;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 50%;
}

.member-preview-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-preview-state {
  padding: 20px 8px;
  font-size: 12px;
  color: var(--rail-theme-secondary, #7b8798);
  text-align: center;
}

.project-member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-dashboard__updated {
  position: absolute;
  bottom: 12px;
  left: 18px;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: var(--rail-theme-secondary, #778398);
}

.project-dashboard__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 0 16px 10px;
  border-top: 1px solid var(--rail-theme-border, #edf0f2);
}

.project-dashboard__metrics > button {
  display: grid;
  gap: 3px;
  min-width: 0;
  min-height: 74px;
  padding: 11px 12px 9px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--rail-theme-border, #edf0f2);
  border-radius: 0;
}

.project-dashboard__metrics > button:last-child {
  border-right: 0;
}

.project-dashboard__metrics > button:hover {
  background: var(--rail-theme-surface, #fff9fa);
  box-shadow: inset 0 -2px var(--workbench-accent);
}

.project-dashboard__metrics span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--rail-theme-secondary, #6f7a8c);
  white-space: nowrap;
}

.project-dashboard__metrics strong {
  font-size: 20px;
  font-weight: 760;
  line-height: 1.15;
  color: var(--rail-theme-text, #17202d);
}

.project-dashboard__metrics strong.active {
  color: var(--workbench-running);
}

.project-dashboard__metrics small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--rail-font-caption);
  color: var(--rail-theme-secondary, #8a94a3);
  white-space: nowrap;
}

.project-dashboard__footer {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  min-height: 55px;
  padding: 8px 16px 13px;
  background: var(--rail-theme-surface, #fff);
  border: 0;
}

.project-dashboard__footer .ant-btn {
  height: 34px;
  padding-inline: 14px;
  font-weight: 600;
  color: var(--workbench-accent);
  background: var(--rail-theme-surface, #fff);
  border-color: var(--rail-theme-border, #e4b5bf);
  border-radius: 5px;
  box-shadow: none;
}

.project-dashboard__footer .ant-btn:hover,
.project-dashboard__footer .ant-btn:focus-visible {
  color: var(--workbench-accent);
  background: var(--workbench-accent-soft);
  border-color: var(--workbench-accent);
}

.project-empty {
  display: grid;
  justify-items: center;
  min-height: 360px;
  padding: 80px 24px;
  margin: 16px;
  text-align: center;
  border: 1px dashed var(--rail-theme-border, #d8dde1);
  border-radius: 10px;
  box-shadow: none;
}

.project-empty > svg {
  padding: 18px;
  font-size: 72px;
  color: var(--rail-theme-muted, #98a2a9);
  background: var(--rail-theme-surface, #f4f6f7);
  border-radius: 50%;
}

.project-empty h2 {
  margin: 18px 0 0;
  font-size: 22px;
  color: var(--rail-theme-text, #253039);
}

.project-empty p {
  margin: 0 0 18px;
  color: var(--rail-theme-secondary, #7a858d);
}

.project-list-pagination {
  position: relative;
  justify-content: center;
  min-height: 51px;
  padding: 8px 16px;
  border-top: 1px solid var(--rail-theme-border, #e5e8ec);
}

.project-pagination-controls {
  gap: 7px;
}

.project-pagination-controls button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--rail-theme-border, #e0e4e8);
}

.project-pagination-controls button.active {
  color: #fff;
  background: var(--workbench-accent);
  border-color: var(--workbench-accent);
}

.project-pagination-controls button:disabled {
  color: var(--rail-theme-muted, #b1b8c1);
  cursor: not-allowed;
  background: var(--rail-theme-surface, #fafbfc);
}

.project-pagination-controls span,
.project-page-size > span {
  margin-left: 10px;
  font-size: 12px;
  color: var(--rail-theme-secondary, #647085);
}

.project-page-size {
  position: absolute;
  right: 16px;
  gap: 10px;
}

.project-page-size :deep(.ant-select) {
  width: 88px;
}

@media (max-width: 1280px) {
  .project-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-card-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .workbench-tools__grid {
    grid-template-columns: 1fr;
  }

  .workbench-tools.has-single-tool .workbench-tools__grid {
    grid-template-columns: 1fr;
  }

  .project-overview-toolbar {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    padding-top: 12px;
  }

  .project-list-title {
    min-height: 34px;
  }

  .project-toolbar-controls {
    justify-content: flex-start;
    margin-left: 0;
  }

  .project-search {
    flex: 1;
    width: auto;
  }
}

@media (max-width: 680px) {
  .projects-overview-page {
    padding: 16px 12px;
  }

  .project-summary {
    grid-template-columns: 1fr;
  }

  .workbench-tools__header {
    align-items: flex-start;
  }

  .workbench-tools__badge {
    display: none;
  }

  .project-toolbar-controls {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .project-sort-label,
  .project-search {
    grid-column: 1 / -1;
    width: 100%;
  }

  .project-sort {
    flex: 1;
    width: auto;
  }

  .project-view-switch {
    grid-column: 2;
  }

  .project-card-grid {
    padding: 10px;
  }

  .project-dashboard__hero {
    min-height: 180px;
  }

  .project-dashboard__copy {
    padding: 18px 18px 70px 96px;
  }

  .project-dashboard__actions {
    top: 96px;
  }

  .project-dashboard__members {
    right: 14px;
    bottom: 28px;
  }

  .project-dashboard__updated {
    bottom: 14px;
  }

  .project-dashboard__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-list-pagination {
    justify-content: flex-start;
  }

  .project-page-size {
    right: 10px;
  }
}
</style>
