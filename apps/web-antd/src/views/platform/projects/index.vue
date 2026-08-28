<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Modal, Textarea } from 'ant-design-vue';

import PageHeading from '#/components/platform/page-heading.vue';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();
const keyword = ref('');
const createOpen = ref(false);
const projectName = ref('');
const projectDescription = ref('');

const stageLabels = {
  archived: '已归档',
  concept: '概念阶段',
  delivery: '交付阶段',
  design: '方案深化',
};

const filteredProjects = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  if (!normalized) return platformStore.projects;
  return platformStore.projects.filter((project) =>
    `${project.name}${project.code}${project.description}`
      .toLowerCase()
      .includes(normalized),
  );
});

async function enterProject(projectId: string) {
  await platformStore.switchProject(projectId);
  await router.push('/design');
  message.success('已切换项目上下文');
}

async function createProject() {
  if (!projectName.value.trim()) {
    message.warning('请输入项目名称');
    return;
  }
  await platformStore.addProject(
    projectName.value.trim(),
    projectDescription.value.trim() || '新建轨道客室设计项目。',
  );
  createOpen.value = false;
  projectName.value = '';
  projectDescription.value = '';
  message.success('项目已创建');
}
</script>

<template>
  <main class="platform-page projects-page">
    <PageHeading
      description="项目是成员、资产、应用权限和任务记录的共同边界。"
      eyebrow="Project spaces"
      title="项目空间"
    >
      <template #extra>
        <Button type="primary" @click="createOpen = true">
          <IconifyIcon class="mr-1" icon="lucide:plus" />
          新建项目
        </Button>
      </template>
    </PageHeading>

    <div class="platform-content">
      <section class="platform-panel">
        <div class="rail-toolbar">
          <div>
            <strong>全部项目</strong>
            <span class="project-count">
              {{ filteredProjects.length }} 个项目空间
            </span>
          </div>
          <Input
            v-model:value="keyword"
            allow-clear
            class="project-search"
            placeholder="搜索项目名称或编号"
          >
            <template #prefix><IconifyIcon icon="lucide:search" /></template>
          </Input>
        </div>

        <div class="project-grid">
          <article
            v-for="(project, index) in filteredProjects"
            :key="project.id"
            :class="{
              'project-card--active':
                project.id === platformStore.currentProjectId,
            }"
            class="project-card"
          >
            <div class="project-card__index">
              P{{ String(index + 1).padStart(2, '0') }}
            </div>
            <div class="project-card__top">
              <span class="project-stage">
                {{ stageLabels[project.stage] }}
              </span>
              <span
                v-if="project.id === platformStore.currentProjectId"
                class="current-badge"
              >
                当前项目
              </span>
            </div>
            <h2>{{ project.name }}</h2>
            <div class="project-code">{{ project.code }}</div>
            <p>{{ project.description }}</p>
            <div class="project-card__stats">
              <span>
                <IconifyIcon icon="lucide:users" />
                {{ project.members }} 位成员
              </span>
              <span>
                <IconifyIcon :icon="platformSemanticIcons.assets" />
                {{ project.assetCount }} 项资产
              </span>
            </div>
            <div class="project-card__footer">
              <span>更新于 {{ project.updatedAt }}</span>
              <Button type="link" @click="enterProject(project.id)">
                {{
                  project.id === platformStore.currentProjectId
                    ? '返回工作台'
                    : '进入项目'
                }}
                <IconifyIcon icon="lucide:arrow-right" />
              </Button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <Modal
      v-model:open="createOpen"
      ok-text="创建项目"
      title="新建项目空间"
      @ok="createProject"
    >
      <div class="create-project-form">
        <label>
          <span>项目名称</span>
          <Input
            v-model:value="projectName"
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
  </main>
</template>

<style scoped>
.project-count {
  margin-left: 10px;
  font-size: 12px;
  color: var(--rail-steel);
}

.project-search {
  width: min(340px, 100%);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
}

.project-card {
  position: relative;
  min-height: 286px;
  padding: 20px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--rail-line);
  border-radius: 12px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.project-card:hover {
  border-color: #cbb7ba;
  box-shadow: var(--rail-shadow);
  transform: translateY(-2px);
}

.project-card--active {
  border-color: #d69ba5;
  box-shadow: inset 3px 0 var(--rail-red);
}

.project-card__index {
  position: absolute;
  top: -16px;
  right: 8px;
  font-family: 'DIN Alternate', 'Arial Narrow', sans-serif;
  font-size: 76px;
  font-weight: 800;
  line-height: 1;
  color: #f0f2f4;
  letter-spacing: -0.08em;
  pointer-events: none;
}

.project-card__top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.project-stage,
.current-badge {
  padding: 4px 8px;
  font-size: var(--rail-font-caption);
  font-weight: 650;
  border-radius: 999px;
}

.project-stage {
  color: #55616d;
  background: #f0f2f4;
}

.current-badge {
  color: var(--rail-red);
  background: var(--rail-red-soft);
}

.project-card h2 {
  position: relative;
  margin: 22px 0 3px;
  font-size: 19px;
  font-weight: 680;
}

.project-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 650;
  color: var(--rail-red);
}

.project-card p {
  min-height: 48px;
  margin: 16px 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--rail-steel);
}

.project-card__stats {
  display: flex;
  gap: 18px;
  padding: 14px 0;
  font-size: 11px;
  color: #535e68;
  border-top: 1px solid var(--rail-line);
}

.project-card__stats span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.project-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--rail-font-caption);
  color: #8a939c;
}

.project-card__footer :deep(.ant-btn) {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding-right: 0;
}

.create-project-form {
  display: grid;
  gap: 18px;
  padding: 10px 0;
}

.create-project-form label {
  display: grid;
  gap: 7px;
}

.create-project-form label > span {
  font-size: 12px;
  font-weight: 650;
}

@media (max-width: 1100px) {
  .project-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 680px) {
  .project-grid {
    grid-template-columns: 1fr;
  }

  .rail-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .project-search {
    width: 100%;
  }
}
</style>
