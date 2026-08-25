<script lang="ts" setup>
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Select, Textarea } from 'ant-design-vue';

import PageHeading from '#/components/platform/page-heading.vue';
import { usePlatformStore } from '#/store';

const platformStore = usePlatformStore();
const currentProjectName = computed(
  () => platformStore.currentProject?.name ?? '尚未选择项目',
);
</script>

<template>
  <main class="platform-page capability-page">
    <PageHeading
      :description="`当前项目：${currentProjectName}。报告服务接入后，可基于项目成果配置交付报告。`"
      eyebrow="Project delivery report"
      title="报告生成"
    />

    <div class="platform-content capability-content">
      <div class="capability-notice">
        <IconifyIcon icon="lucide:circle-alert" />
        <span>
          报告执行服务和能力契约尚未接入，当前页面仅展示配置契约，不能提交生成。
        </span>
      </div>

      <section class="report-layout platform-panel" data-testid="report-layout">
        <div class="report-layout__grid">
          <label>
            <span>报告类型</span>
            <Select disabled placeholder="请选择报告类型" :value="undefined" />
          </label>
          <label>
            <span>交付格式</span>
            <Select disabled placeholder="Word / PPT" :value="undefined" />
          </label>
        </div>
        <label class="report-layout__field">
          <span>报告标题与说明</span>
          <Textarea
            disabled
            :auto-size="{ minRows: 3, maxRows: 5 }"
            placeholder="填写报告标题、章节重点和交付说明"
          />
        </label>
        <section class="report-layout__assets" aria-label="报告图片素材">
          <header>
            <span>报告图片素材</span>
            <small>从当前项目资产中选择</small>
          </header>
          <div>
            <button v-for="index in 3" :key="index" disabled type="button">
              <IconifyIcon icon="lucide:image-plus" />
              <span>添加图片 {{ index }}</span>
            </button>
          </div>
        </section>
        <label class="report-layout__field">
          <span>补充说明</span>
          <Textarea
            disabled
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="填写报告结论、备注或其他结构化内容"
          />
        </label>
        <div class="report-layout__actions">
          <Button disabled type="primary">开始生成报告</Button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.capability-page {
  min-height: 100%;
}

.capability-content {
  display: grid;
  gap: 18px;
}

.capability-notice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px 16px;
  color: #7e3b48;
  background: var(--rail-red-soft);
  border: 1px solid #e9bdc5;
  border-radius: 12px;
}

.capability-notice svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.report-layout {
  display: grid;
  gap: 20px;
  max-width: 1100px;
  padding: 24px;
}

.report-layout__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.report-layout label,
.report-layout__field,
.report-layout__assets {
  display: grid;
  gap: 8px;
}

.report-layout label > span,
.report-layout__assets header > span {
  font-size: 13px;
  font-weight: 700;
  color: #343b40;
}

.report-layout label :deep(.ant-select) {
  width: 100%;
}

.report-layout__assets header {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.report-layout__assets header small {
  font-size: 11px;
  color: #7a858d;
}

.report-layout__assets > div {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.report-layout__assets button {
  display: grid;
  place-items: center;
  min-height: 150px;
  color: #7d858b;
  background: var(--rail-mist);
  border: 1px dashed #c7cdd1;
  border-radius: 12px;
}

.report-layout__assets button svg {
  width: 26px;
  height: 26px;
  margin-bottom: -38px;
  color: var(--rail-red);
}

.report-layout__actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .report-layout__grid,
  .report-layout__assets > div {
    grid-template-columns: 1fr;
  }
}
</style>
