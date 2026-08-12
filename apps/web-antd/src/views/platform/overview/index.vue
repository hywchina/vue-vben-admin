<script lang="ts" setup>
import type { PlatformProject, ProjectMember } from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  message,
  Modal,
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
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();
const keyword = ref('');
const sortValue = ref('updatedAt-desc');
const createOpen = ref(false);
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
const canInviteMembers = ref(false);
const inviteUserId = ref('');
const inviteRole = ref<'editor' | 'viewer'>('editor');
const sortOptions = [
  { label: '更新时间：最新优先', value: 'updatedAt-desc' },
  { label: '更新时间：最早优先', value: 'updatedAt-asc' },
  { label: '创建时间：最新优先', value: 'createdAt-desc' },
  { label: '创建时间：最早优先', value: 'createdAt-asc' },
  { label: '名称：A–Z', value: 'name-asc' },
  { label: '名称：Z–A', value: 'name-desc' },
];

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

async function enterProject(
  project: PlatformProject,
  path: '/assets' | '/design' | '/jobs',
  query?: Record<string, string>,
) {
  await platformStore.switchProject(project.id);
  await router.push({ path, query });
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
  inviteUserId.value = '';
  membersLoading.value = true;
  try {
    const result = await getProjectMembersApi(project.id);
    projectMembers.value = result.items;
    canInviteMembers.value = result.canInvite;
  } finally {
    membersLoading.value = false;
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
    project.members = result.items.length;
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
        project.members = result.items.length;
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
  <main class="platform-page projects-overview-page">
    <PageHeading
      :description="`当前账号可访问 ${platformStore.projects.length} 个项目，共 ${totalAssets} 项资产，${totalActiveJobs} 个任务正在运行。`"
      eyebrow="Project design operations"
      title="项目空间"
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

    <div class="platform-content project-overview-content">
      <section class="platform-panel project-overview-toolbar">
        <div>
          <strong>我的项目</strong>
          <span>
            {{ filteredProjects.length }} / {{ platformStore.projects.length }}
          </span>
        </div>
        <div class="project-toolbar-controls">
          <Select
            v-model:value="sortValue"
            aria-label="项目排序"
            :options="sortOptions"
            class="project-sort"
          />
          <Input
            v-model:value="keyword"
            allow-clear
            class="project-search"
            placeholder="搜索项目"
          >
            <template #prefix><IconifyIcon icon="lucide:search" /></template>
          </Input>
        </div>
      </section>

      <section
        v-for="project in filteredProjects"
        :key="project.id"
        :data-project-id="project.id"
        class="project-dashboard platform-panel"
        role="link"
        tabindex="0"
        @click="enterProject(project, '/design')"
        @keydown.enter="enterProject(project, '/design')"
        @keydown.space.prevent="enterProject(project, '/design')"
      >
        <div class="project-dashboard__hero">
          <div class="project-dashboard__copy">
            <div class="project-dashboard__eyebrow">
              <span v-if="project.isPinned">置顶项目</span>
              <span v-else>项目</span>
              <code>{{ project.code }}</code>
            </div>
            <h2>{{ project.name }}</h2>
            <p>{{ project.description || '暂无项目说明' }}</p>
            <small>
              {{ project.members }} 位成员 · 更新于
              {{ formatProjectDate(project.updatedAt) }}
            </small>
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
        </div>

        <div class="project-dashboard__metrics">
          <button type="button" @click.stop="enterProject(project, '/assets')">
            <span>项目资产</span>
            <strong>{{ project.assetCount }}</strong>
            <small>统一登记与版本追踪</small>
          </button>
          <button type="button" @click.stop="enterProject(project, '/jobs')">
            <span>累计任务</span>
            <strong>{{ project.jobCount }}</strong>
            <small>保留完整设计台账</small>
          </button>
          <button
            type="button"
            @click.stop="enterProject(project, '/jobs', { status: 'active' })"
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
          <Button type="primary" @click.stop="enterProject(project, '/design')">
            <IconifyIcon icon="lucide:message-square-more" />
            开始设计
          </Button>
        </footer>
      </section>

      <section
        v-if="!filteredProjects.length"
        class="platform-panel project-empty"
      >
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
      <div v-if="membersLoading" class="member-loading">正在读取项目成员…</div>
      <div v-else class="member-list">
        <article
          v-for="member in projectMembers"
          :key="member.userId"
          :data-member-id="member.publicId"
        >
          <div class="member-avatar">{{ member.name.slice(0, 1) }}</div>
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
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.project-overview-content {
  display: grid;
  gap: 16px;
}

.project-overview-toolbar,
.project-overview-toolbar > div,
.project-toolbar-controls,
.project-dashboard__eyebrow,
.project-dashboard__footer,
.project-dashboard__actions {
  display: flex;
  align-items: center;
}

.project-overview-toolbar {
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 12px;
}

.project-overview-toolbar > div {
  gap: 10px;
}

.project-toolbar-controls {
  justify-content: flex-end;
}

.project-overview-toolbar span {
  font-size: 12px;
  color: var(--rail-steel);
}

.project-search {
  width: min(380px, 45vw);
}

.project-sort {
  width: 190px;
}

.project-dashboard {
  overflow: hidden;
  cursor: pointer;
  border-color: #e5e8eb;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgb(25 34 41 / 3%);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.project-dashboard:hover,
.project-dashboard:focus-visible {
  outline: 0;
  border-color: #d5d9de;
  box-shadow: 0 12px 28px rgb(25 34 41 / 9%);
  transform: translateY(-2px);
}

.project-dashboard__hero {
  position: relative;
  min-height: 200px;
  color: #182128;
  background:
    radial-gradient(circle at 88% 20%, rgb(185 28 50 / 7%), transparent 24%),
    linear-gradient(135deg, #fff 0%, #fafbfc 100%);
  background-color: #fff;
  border-bottom: 1px solid var(--rail-line);
}

.project-dashboard__copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 200px;
  padding: 30px 150px 30px 38px;
}

.project-dashboard__eyebrow {
  gap: 10px;
  color: #69757e;
}

.project-dashboard__eyebrow span {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.project-dashboard__eyebrow code {
  font-size: 12px;
  color: #7b858d;
}

.project-dashboard h2 {
  margin: 14px 0 8px;
  font-size: clamp(26px, 2.4vw, 38px);
  font-weight: 700;
  color: #172027;
  overflow-wrap: anywhere;
}

.project-dashboard__copy p {
  margin: 0;
  color: #53616b;
  overflow-wrap: anywhere;
}

.project-dashboard__copy small {
  margin-top: 24px;
  font-size: 12px;
  color: #8a949b;
}

.project-dashboard__actions {
  position: absolute;
  top: 16px;
  right: 16px;
  gap: 6px;
  padding: 5px;
  background: rgb(255 255 255 / 82%);
  border: 1px solid rgb(222 226 229 / 85%);
  border-radius: 10px;
  box-shadow: 0 6px 18px rgb(30 38 44 / 7%);
  opacity: 0.74;
  backdrop-filter: blur(8px);
  transition: opacity 160ms ease;
}

.project-dashboard:hover .project-dashboard__actions,
.project-dashboard:focus-within .project-dashboard__actions {
  opacity: 1;
}

.project-dashboard__actions button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #59636c;
  cursor: pointer;
  background: #f4f5f6;
  border: 1px solid transparent;
  border-radius: 8px;
}

.project-dashboard__actions button:hover,
.project-dashboard__actions button.active {
  color: #fff;
  background: var(--rail-red);
}

.project-dashboard__actions button:focus-visible {
  outline: 2px solid rgb(197 28 55 / 38%);
  outline-offset: 2px;
}

.project-dashboard__actions button:disabled {
  color: #b6bdc2;
  cursor: not-allowed;
  background: #f1f2f3;
  opacity: 0.55;
}

.project-dashboard__actions button.danger:hover {
  color: #fff;
  background: #d9363e;
}

.project-dashboard__metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}

.project-dashboard__metrics > button {
  display: grid;
  gap: 6px;
  padding: 20px 24px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 0;
  border-right: 1px solid #edf0f2;
  transition:
    background 160ms ease,
    box-shadow 160ms ease;
}

.project-dashboard__metrics > button:hover {
  background: #fbf7f8;
  box-shadow: inset 0 -3px var(--rail-red);
}

.project-dashboard__metrics > button:last-child {
  border-right: 0;
}

.project-dashboard__metrics span,
.project-dashboard__metrics small {
  font-size: 12px;
  color: #78838b;
}

.project-dashboard__metrics strong {
  font-size: 30px;
  font-weight: 800;
  line-height: 1.18;
  color: #172027;
}

.project-dashboard__metrics strong.active {
  color: var(--rail-red);
}

.project-dashboard__metrics small {
  color: #9aa2a8;
}

.project-dashboard__footer {
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 20px;
  background: #fafbfb;
  border-top: 1px solid #edf0f2;
}

.project-empty {
  display: grid;
  justify-items: center;
  min-height: 360px;
  padding: 80px 24px;
  text-align: center;
  border: 1px dashed #d8dde1;
  border-radius: 14px;
  box-shadow: none;
}

.project-empty > svg {
  padding: 18px;
  font-size: 72px;
  color: #98a2a9;
  background: #f4f6f7;
  border-radius: 50%;
}

.project-empty h2 {
  margin: 18px 0 0;
  font-size: 22px;
  color: #253039;
}

.project-empty p {
  margin: 0 0 18px;
  color: #7a858d;
}

.projects-overview-page :deep(.platform-page-heading__eyebrow) {
  font-size: 10px;
  font-weight: 700;
  color: #8a949b;
  letter-spacing: 0.12em;
}

.projects-overview-page :deep(.ant-btn:disabled),
.projects-overview-page :deep(.ant-btn[disabled]) {
  color: #aeb5ba;
  cursor: not-allowed;
  background: #eef0f2;
  border-color: #e0e4e7;
  box-shadow: none;
  opacity: 0.72;
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
  background: #f7f8f9;
  border: 1px solid var(--rail-line);
  border-radius: 10px;
}

.member-notice,
.member-loading {
  color: var(--rail-steel);
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

.member-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  font-weight: 700;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 50%;
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
  color: #991229;
  text-decoration: underline;
}

.member-remove--disabled,
.member-remove:disabled {
  color: #aeb5ba;
  cursor: not-allowed;
}

@media (max-width: 1050px) {
  .project-dashboard__metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 680px) {
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
</style>
