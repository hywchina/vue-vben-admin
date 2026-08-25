<script lang="ts" setup>
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, InputNumber, Select, Textarea } from 'ant-design-vue';

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
      :description="`当前项目：${currentProjectName}。训练服务接入后，可在此配置项目专用 LoRA 模型。`"
      eyebrow="Project model training"
      title="模型训练"
    />

    <div class="platform-content capability-content">
      <div class="capability-notice">
        <IconifyIcon icon="lucide:circle-alert" />
        <span>
          LoRA
          训练服务和数据协议尚未接入，当前页面仅展示配置契约，不能开始训练。
        </span>
      </div>

      <div class="training-layout" data-testid="training-layout">
        <div class="training-layout__body">
          <section class="training-layout__parameters platform-panel">
            <header>
              <b>1</b>
              <strong>参数设置</strong>
            </header>
            <div class="training-layout__number-grid">
              <label>
                <span>单图次数 Repeat</span>
                <InputNumber disabled :value="20" />
              </label>
              <label>
                <span>循环轮次 Epoch</span>
                <InputNumber disabled :value="5" />
              </label>
            </div>
            <label>
              <span>触发词</span>
              <Input disabled placeholder="总步数 = 图片数 × Repeat × Epoch" />
            </label>
            <label>
              <span>模型效果预览提示词</span>
              <Textarea
                disabled
                :rows="5"
                placeholder="训练服务接入后填写用于验证模型效果的提示词"
              />
            </label>
          </section>

          <section class="training-layout__dataset platform-panel">
            <header>
              <b>2</b>
              <strong>图片打标与裁剪</strong>
            </header>
            <button disabled type="button">
              <IconifyIcon icon="lucide:images" />
              <strong>上传训练图片</strong>
              <small>支持格式、数量和大小以最终训练协议为准</small>
            </button>
          </section>
        </div>

        <section class="training-layout__options platform-panel">
          <label
            v-for="label in ['裁剪方式', '裁剪尺寸', '打标模型']"
            :key="label"
          >
            <span>{{ label }}</span>
            <Select disabled :placeholder="`选择${label}`" :value="undefined" />
          </label>
          <Button disabled type="primary">开始训练</Button>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.capability-page {
  min-height: 100%;
}

.capability-content,
.training-layout {
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

.training-layout__body {
  display: grid;
  grid-template-columns: minmax(320px, 0.85fr) minmax(420px, 1.15fr);
  gap: 18px;
}

.training-layout__parameters,
.training-layout__dataset,
.training-layout__options {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.training-layout header {
  display: flex;
  gap: 9px;
  align-items: center;
}

.training-layout header b {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  color: #fff;
  background: var(--rail-red);
  border-radius: 50%;
}

.training-layout label {
  display: grid;
  gap: 7px;
}

.training-layout label > span {
  font-size: 12px;
  font-weight: 650;
  color: #4f5961;
}

.training-layout__number-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.training-layout__number-grid :deep(.ant-input-number),
.training-layout__options :deep(.ant-select) {
  width: 100%;
}

.training-layout__dataset button {
  display: grid;
  place-items: center;
  min-height: 270px;
  padding: 28px;
  color: #717c84;
  background: var(--rail-mist);
  border: 1px dashed #c5ccd1;
  border-radius: 12px;
}

.training-layout__dataset button svg {
  width: 38px;
  height: 38px;
  color: var(--rail-red);
}

.training-layout__dataset button strong {
  margin-top: -48px;
}

.training-layout__dataset button small {
  margin-top: -64px;
  font-size: 11px;
}

.training-layout__options {
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  align-items: end;
}

@media (max-width: 900px) {
  .training-layout__body,
  .training-layout__options {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .training-layout__number-grid {
    grid-template-columns: 1fr;
  }
}
</style>
