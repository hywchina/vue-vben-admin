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

import { createUserApi, resetUserPasswordApi } from '#/api';
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
const createUserOpen = ref(false);
const userCreating = ref(false);
const resetPasswordOpen = ref(false);
const passwordResetting = ref(false);
const passwordResetUser = ref<null | PlatformUser>(null);
const resetPassword = ref('');
const createUserForm = ref({
  department: '',
  email: '',
  password: '',
  realName: '',
  role: 'user' as 'admin' | 'user',
  username: '',
});

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

function roleScopeLabel(scope: string) {
  if (scope === 'all') return '全部项目';
  if (scope === 'project') return '参与的项目';
  return scope;
}

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

function openCreateUser() {
  createUserForm.value = {
    department: '',
    email: '',
    password: '',
    realName: '',
    role: 'user',
    username: '',
  };
  createUserOpen.value = true;
}

function hasValidPassword(value: string) {
  return (
    value.length >= 8 &&
    value.length <= 128 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    /[^\dA-Za-z]/.test(value)
  );
}

const canCreateUser = computed(() => {
  const input = createUserForm.value;
  return Boolean(
    /^[\w.-]{3,32}$/.test(input.username.trim()) &&
    input.realName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) &&
    hasValidPassword(input.password),
  );
});

async function createUser() {
  if (!canCreateUser.value || userCreating.value) return;
  userCreating.value = true;
  try {
    const created = await createUserApi({
      ...createUserForm.value,
      department: createUserForm.value.department.trim(),
      email: createUserForm.value.email.trim(),
      realName: createUserForm.value.realName.trim(),
      username: createUserForm.value.username.trim(),
    });
    await platformStore.loadAdministration();
    createUserOpen.value = false;
    message.success(`账号已创建：${created.publicId}`);
  } finally {
    userCreating.value = false;
  }
}

function openResetPassword(user: PlatformUser) {
  if (!canEditRoles(user)) return;
  passwordResetUser.value = user;
  resetPassword.value = '';
  resetPasswordOpen.value = true;
}

async function confirmResetPassword() {
  const user = passwordResetUser.value;
  if (
    !user ||
    !hasValidPassword(resetPassword.value) ||
    passwordResetting.value
  )
    return;
  passwordResetting.value = true;
  try {
    await resetUserPasswordApi(user.id, resetPassword.value);
    resetPasswordOpen.value = false;
    passwordResetUser.value = null;
    resetPassword.value = '';
    message.success(`已重置“${user.name}”的密码并撤销其刷新会话`);
  } finally {
    passwordResetting.value = false;
  }
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
        <Button type="primary" @click="openCreateUser">
          <IconifyIcon class="mr-1" icon="lucide:user-plus" />
          新增用户
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
                  <Button
                    :disabled="!canEditRoles(user)"
                    type="link"
                    @click="openResetPassword(user)"
                  >
                    重置密码
                  </Button>
                </div>
              </div>
            </div>
          </TabPane>
          <TabPane key="roles" tab="角色权限">
            <div class="role-overview-note">
              <IconifyIcon icon="lucide:info" />
              <p>
                平台角色决定账号可使用的菜单和管理操作；项目内的负责人、编辑和只读角色进一步限制具体项目的数据范围。系统角色由平台统一维护，不在此处逐项修改权限。
              </p>
            </div>
            <div class="role-grid">
              <article
                v-for="role in platformStore.roles"
                :key="role.id"
                class="role-card"
              >
                <div class="role-card__head">
                  <span class="role-card__icon">
                    <IconifyIcon icon="lucide:shield" />
                  </span>
                  <Tag class="role-card__type">系统角色</Tag>
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
                  <strong>{{ roleScopeLabel(role.scope) }}</strong>
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

    <Modal
      v-model:open="createUserOpen"
      :confirm-loading="userCreating"
      :ok-button-props="{ disabled: !canCreateUser }"
      ok-text="创建账号"
      title="新增平台用户"
      @ok="createUser"
    >
      <div class="user-form">
        <label>
          <span>登录用户名</span>
          <Input
            v-model:value="createUserForm.username"
            :maxlength="32"
            autocomplete="off"
            placeholder="3–32 位字母、数字、点、横线或下划线"
          />
        </label>
        <label>
          <span>姓名</span>
          <Input v-model:value="createUserForm.realName" :maxlength="100" />
        </label>
        <label>
          <span>企业邮箱</span>
          <Input
            v-model:value="createUserForm.email"
            :maxlength="254"
            autocomplete="off"
          />
        </label>
        <label>
          <span>所属部门</span>
          <Input v-model:value="createUserForm.department" :maxlength="100" />
        </label>
        <label>
          <span>平台角色</span>
          <Select
            v-model:value="createUserForm.role"
            :options="roleOptions"
            class="w-full"
          />
        </label>
        <label>
          <span>初始密码</span>
          <Input
            v-model:value="createUserForm.password"
            :maxlength="128"
            autocomplete="new-password"
            placeholder="至少 8 位，包含字母、数字和符号"
            type="password"
            @press-enter="createUser"
          />
        </label>
        <p class="form-hint">
          密码不会显示在用户列表或审计日志中，请通过安全渠道告知用户。
        </p>
      </div>
    </Modal>

    <Modal
      v-model:open="resetPasswordOpen"
      :confirm-loading="passwordResetting"
      :ok-button-props="{ disabled: !hasValidPassword(resetPassword) }"
      ok-text="确认重置"
      title="重置用户密码"
      @ok="confirmResetPassword"
    >
      <div class="user-form">
        <p>
          将重置“{{
            passwordResetUser?.name
          }}”的登录密码，并撤销该账号全部刷新会话。
        </p>
        <label>
          <span>新密码</span>
          <Input
            v-model:value="resetPassword"
            :maxlength="128"
            autocomplete="new-password"
            placeholder="至少 8 位，包含字母、数字和符号"
            type="password"
            @press-enter="confirmResetPassword"
          />
        </label>
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
    70px 100px 70px 170px;
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
  background: var(--rail-theme-surface, #fafbfc);
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
  background: var(--rail-theme-surface, #37414b);
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
  color: var(--rail-theme-secondary, #7c858d);
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
  flex-wrap: wrap;
  justify-content: flex-end;
}

.user-actions :deep(.ant-btn) {
  padding-inline: 5px;
  font-size: var(--rail-font-caption);
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 18px;
}

.role-overview-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px 18px;
  margin: 18px 18px 0;
  color: var(--rail-theme-text, #273244);
  background: var(--rail-mist);
  border-radius: 10px;
}

.role-overview-note > svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--rail-red);
}

.role-overview-note p {
  margin: 0;
  font-size: var(--rail-font-label);
  line-height: 1.6;
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

.role-card__icon {
  display: grid;
  flex: 0 0 40px;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: var(--rail-icon-md);
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 10px;
}

.role-card__head :deep(.role-card__type) {
  flex: 0 0 auto;
  margin: 0;
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

.user-form {
  display: grid;
  gap: 14px;
  padding-top: 8px;
}

.user-form label {
  display: grid;
  gap: 7px;
}

.user-form label > span {
  font-size: var(--rail-font-label);
  font-weight: 650;
  color: var(--rail-ink);
}

.user-form p {
  margin: 0;
  line-height: 1.65;
  color: var(--rail-steel);
}

.user-form .form-hint {
  padding: 10px 12px;
  font-size: var(--rail-font-caption);
  background: var(--rail-mist);
  border-radius: 8px;
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
