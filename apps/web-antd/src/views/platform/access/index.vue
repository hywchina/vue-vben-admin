<script lang="ts" setup>
import type { PlatformUser } from '#/modules/platform/types';

import { computed, onMounted, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Input,
  message,
  Modal,
  Select,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

const platformStore = usePlatformStore();
const userStore = useUserStore();
const keyword = ref('');
const roleEditorOpen = ref(false);
const roleEditingUser = ref<null | PlatformUser>(null);
const selectedRoleCode = ref('');
const roleSaving = ref(false);

onMounted(() => {
  void platformStore.loadAdministration();
});

const filteredUsers = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  if (!normalized) return platformStore.users;
  return platformStore.users.filter((user) =>
    `${user.name}${user.publicId}${user.username}${user.email}${user.department}${user.roles.join('')}`
      .toLowerCase()
      .includes(normalized),
  );
});

const roleOptions = computed(() =>
  platformStore.roles.map((role) => ({
    label: role.name,
    value: role.code,
  })),
);

function canEditRoles(user: PlatformUser) {
  return user.id !== userStore.userInfo?.id;
}

function openRoleEditor(user: PlatformUser) {
  if (!canEditRoles(user)) return;
  roleEditingUser.value = user;
  selectedRoleCode.value = user.roleCodes[0] ?? 'user';
  roleEditorOpen.value = true;
}

function closeRoleEditor() {
  roleEditorOpen.value = false;
  roleEditingUser.value = null;
  selectedRoleCode.value = '';
}

async function saveUserRoles() {
  const user = roleEditingUser.value;
  if (!user) return;
  if (!selectedRoleCode.value) {
    message.warning('请选择用户类型');
    return;
  }
  roleSaving.value = true;
  try {
    await platformStore.updateUserRoles(user.id, [selectedRoleCode.value]);
    closeRoleEditor();
    message.success('用户角色已更新');
  } finally {
    roleSaving.value = false;
  }
}

async function toggleStatus(user: PlatformUser) {
  if (!canEditRoles(user)) return;
  await platformStore.toggleUserStatus(user.id);
  message.success('用户状态已更新');
}
</script>

<template>
  <main class="platform-page access-page">
    <PageHeading
      description="平台角色控制菜单与操作权限，项目成员关系进一步限制数据范围。"
      eyebrow="Identity & access"
      title="用户与权限"
    >
      <template #extra>
        <Button type="primary">
          <IconifyIcon class="mr-1" icon="lucide:user-plus" />
          邀请用户
        </Button>
      </template>
    </PageHeading>

    <div class="platform-content">
      <section class="platform-panel access-shell">
        <Tabs default-active-key="users">
          <TabPane key="users" tab="用户管理">
            <div class="rail-toolbar">
              <div>
                <strong>平台用户</strong>
                <span class="access-count">{{ filteredUsers.length }} 人</span>
              </div>
              <Input
                v-model:value="keyword"
                allow-clear
                class="user-search"
                placeholder="搜索用户 ID、姓名、部门或角色"
              >
                <template #prefix>
                  <IconifyIcon icon="lucide:search" />
                </template>
              </Input>
            </div>
            <div class="access-table-head">
              <span>用户</span>
              <span>部门</span>
              <span>角色</span>
              <span>项目</span>
              <span>最后活跃</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            <div class="user-list">
              <div
                v-for="user in filteredUsers"
                :key="user.id"
                class="user-row"
              >
                <div class="user-identity">
                  <span class="user-avatar">{{ user.name.slice(0, 1) }}</span>
                  <div>
                    <strong>
                      <b>姓名</b>
                      {{ user.name }}
                    </strong>
                    <small>
                      <b>用户 ID</b>
                      {{ user.publicId }}
                    </small>
                    <small>
                      <b>用户名</b>
                      {{ user.username }}
                    </small>
                    <small>
                      <b>邮箱</b>
                      {{ user.email || '未登记' }}
                    </small>
                  </div>
                </div>
                <span>{{ user.department }}</span>
                <div class="user-roles">
                  <Tag v-for="role in user.roles" :key="role">{{ role }}</Tag>
                </div>
                <span>{{ user.projectCount }} 个</span>
                <span>{{ user.lastActive }}</span>
                <StatusPill :status="user.status" />
                <div class="user-actions">
                  <Button
                    :disabled="!canEditRoles(user)"
                    type="link"
                    @click="openRoleEditor(user)"
                  >
                    角色
                  </Button>
                  <Button
                    :disabled="!canEditRoles(user)"
                    type="link"
                    @click="toggleStatus(user)"
                  >
                    {{ user.status === 'enabled' ? '停用' : '启用' }}
                  </Button>
                </div>
              </div>
            </div>
          </TabPane>
          <TabPane key="roles" tab="角色权限">
            <div class="role-grid">
              <article
                v-for="role in platformStore.roles"
                :key="role.id"
                class="role-card"
              >
                <div class="role-card__head">
                  <span><IconifyIcon icon="lucide:shield" /></span>
                  <Tag>系统角色</Tag>
                </div>
                <h2>{{ role.name }}</h2>
                <p>{{ role.description }}</p>
                <div class="role-card__metrics">
                  <div>
                    <strong>{{ role.userCount }}</strong>
                    <span>用户</span>
                  </div>
                  <div>
                    <strong>{{ role.permissionCount }}</strong>
                    <span>权限项</span>
                  </div>
                </div>
                <div class="role-card__scope">
                  <span>数据范围</span>
                  <strong>{{ role.scope }}</strong>
                </div>
              </article>
            </div>
          </TabPane>
        </Tabs>
      </section>
    </div>

    <Modal
      v-model:open="roleEditorOpen"
      :confirm-loading="roleSaving"
      ok-text="保存角色"
      title="调整用户角色"
      @cancel="closeRoleEditor"
      @ok="saveUserRoles"
    >
      <div v-if="roleEditingUser" class="role-editor">
        <div class="role-editor__identity">
          <span>{{ roleEditingUser.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ roleEditingUser.name }}</strong>
            <small>@{{ roleEditingUser.username }}</small>
          </div>
        </div>
        <label>
          <span>平台角色</span>
          <Select
            v-model:value="selectedRoleCode"
            :options="roleOptions"
            class="w-full"
            placeholder="选择用户类型"
          />
        </label>
        <p>
          系统只有管理员和普通用户两种类型。管理员可以管理其他账号，但不能修改自身类型或停用自身账号。
        </p>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.access-shell :deep(.ant-tabs-nav) {
  padding: 0 18px;
  margin: 0;
}

.access-count {
  margin-left: 8px;
  font-size: 11px;
  color: var(--rail-steel);
}

.user-search {
  width: 300px;
}

.access-table-head,
.user-row {
  display: grid;
  grid-template-columns:
    minmax(240px, 1.35fr) minmax(110px, 0.65fr) minmax(120px, 0.7fr)
    70px 100px 70px 110px;
  gap: 14px;
  align-items: center;
  padding: 0 18px;
}

.access-table-head {
  min-height: 38px;
  font-size: var(--rail-font-caption);
  font-weight: 700;
  color: var(--rail-steel);
  text-transform: uppercase;
  background: #fafbfc;
}

.user-row {
  min-height: 96px;
  font-size: 12px;
  border-top: 1px solid var(--rail-line);
}

.user-identity {
  display: flex;
  gap: 10px;
  align-items: center;
}

.user-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #37414b;
  border-radius: 9px;
}

.user-identity > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.user-identity strong {
  font-size: 13px;
}

.user-identity small {
  display: flex;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--rail-steel);
  white-space: nowrap;
}

.user-identity b {
  flex: 0 0 48px;
  font-size: var(--rail-font-caption);
  font-weight: 650;
  color: #7c858d;
}

.user-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.user-roles :deep(.ant-tag) {
  margin: 0;
  font-size: var(--rail-font-caption);
}

.user-actions {
  display: flex;
  justify-content: flex-end;
}

.user-actions :deep(.ant-btn) {
  padding-inline: 5px;
  font-size: var(--rail-font-caption);
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  padding: 18px;
}

.role-card {
  min-width: 0;
  padding: 18px;
  overflow: hidden;
  border: 1px solid var(--rail-line);
  border-radius: 12px;
}

.role-card__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.role-card__head > span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: var(--rail-icon-md);
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 10px;
}

.role-card__head :deep(.ant-tag) {
  flex: 0 0 auto;
  max-width: calc(100% - 50px);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--rail-font-caption);
  color: var(--rail-steel);
  white-space: nowrap;
}

.role-editor {
  display: grid;
  gap: 20px;
  padding-top: 8px;
}

.role-editor__identity {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  background: var(--rail-mist);
  border-radius: 10px;
}

.role-editor__identity > span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  font-weight: 700;
  color: #fff;
  background: var(--rail-ink);
  border-radius: 10px;
}

.role-editor__identity > div {
  display: grid;
  gap: 2px;
}

.role-editor__identity small,
.role-editor p {
  font-size: 11px;
  line-height: 1.55;
  color: var(--rail-steel);
}

.role-editor label {
  display: grid;
  gap: 8px;
}

.role-editor label > span {
  font-size: 12px;
  font-weight: 650;
}

.role-editor p {
  padding: 12px;
  margin: 0;
  background: var(--rail-red-soft);
  border-left: 3px solid var(--rail-red);
  border-radius: 6px;
}

.role-card h2 {
  margin: 16px 0 6px;
  font-size: 16px;
}

.role-card p {
  min-height: 52px;
  font-size: var(--rail-font-label);
  line-height: 1.6;
  color: var(--rail-steel);
}

.role-card__metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin-top: 14px;
  overflow: hidden;
  background: var(--rail-line);
  border-radius: 8px;
}

.role-card__metrics div {
  display: flex;
  gap: 5px;
  align-items: baseline;
  padding: 11px;
  background: var(--rail-mist);
}

.role-card__metrics strong {
  font-size: 17px;
}

.role-card__metrics span {
  font-size: var(--rail-font-caption);
  color: var(--rail-steel);
}

.role-card__scope {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding-top: 12px;
  margin-top: 14px;
  font-size: var(--rail-font-caption);
  border-top: 1px solid var(--rail-line);
}

.role-card__scope strong {
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.role-card__scope span {
  color: var(--rail-steel);
}

@media (max-width: 1180px) {
  .access-table-head {
    display: none;
  }

  .user-row {
    grid-template-columns: 1.2fr 1fr 1fr;
    padding: 12px 18px;
  }

  .role-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 680px) {
  .user-row,
  .role-grid {
    grid-template-columns: 1fr;
  }

  .user-search {
    width: 100%;
  }
}
</style>
