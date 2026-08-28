<script lang="ts" setup>
import type {
  ReportFormat,
  ReportGenerationMode,
  ReportStatus,
  ReportType,
} from '#/api/platform/reports';
import type { PlatformAsset } from '#/modules/platform/types';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Input,
  message,
  Progress,
  Select,
  Spin,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  createReportApi,
  getAssetApi,
  getAssetDownloadApi,
  getAssetPreviewApi,
  getReportStatusApi,
} from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { usePlatformStore } from '#/store';

import AssetPickerModal from '../workspace/asset-picker-modal.vue';

interface ReportImageItem {
  assetId: string;
  caption: string;
}

interface ReportSection {
  body: string;
  clientId: string;
  images: ReportImageItem[];
  title: string;
}

const platformStore = usePlatformStore();
const loading = ref(true);
const submitting = ref(false);
const uploading = ref(false);
const pickerOpen = ref(false);
const activeSectionId = ref('');
const imageSourceMenuSectionId = ref('');
const fileInput = ref<HTMLInputElement>();
const status = ref<ReportStatus>();
const previews = reactive(new Map<string, string>());
const form = reactive({
  format: 'docx' as ReportFormat,
  generationMode: 'template' as ReportGenerationMode,
  reportType: 'design-proposal' as ReportType,
  summary: '',
  title: '',
});
const sections = ref<ReportSection[]>([createSection('设计背景与目标')]);
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const currentProjectName = computed(
  () => platformStore.currentProject?.name ?? '尚未选择项目',
);
const reportJobs = computed(() =>
  platformStore.currentJobs
    .filter((job) => job.appKey === 'report-generator')
    .slice(0, 8),
);
const imageCount = computed(() =>
  sections.value.reduce((count, section) => count + section.images.length, 0),
);
const canSubmit = computed(
  () =>
    Boolean(
      platformStore.currentProjectId &&
      status.value?.configured &&
      status.value.generationModes.find(
        (mode) => mode.key === form.generationMode,
      )?.configured &&
      form.title.trim() &&
      sections.value.length > 0 &&
      sections.value.every(
        (section) =>
          section.title.trim() &&
          (section.body.trim() || section.images.length > 0),
      ),
    ) && !submitting.value,
);
const activeSection = computed(() =>
  sections.value.find((section) => section.clientId === activeSectionId.value),
);

function createSection(title = ''): ReportSection {
  return {
    body: '',
    clientId: crypto.randomUUID(),
    images: [],
    title,
  };
}

function addSection() {
  if (sections.value.length >= (status.value?.limits.sections ?? 8)) return;
  sections.value.push(createSection(`章节 ${sections.value.length + 1}`));
}

function removeSection(sectionId: string) {
  if (sections.value.length === 1) {
    message.warning('报告至少保留一个章节');
    return;
  }
  sections.value = sections.value.filter(
    (section) => section.clientId !== sectionId,
  );
}

function moveSection(index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= sections.value.length) return;
  const next = [...sections.value];
  const currentSection = next[index];
  const targetSection = next[target];
  if (!currentSection || !targetSection) return;
  next[index] = targetSection;
  next[target] = currentSection;
  sections.value = next;
}

function openAssetPicker(sectionId: string) {
  activeSectionId.value = sectionId;
  pickerOpen.value = true;
}

function openLocalUpload(sectionId: string) {
  activeSectionId.value = sectionId;
  fileInput.value?.click();
}

function selectImageSource(source: 'asset' | 'local', sectionId: string) {
  imageSourceMenuSectionId.value = '';
  if (source === 'asset') openAssetPicker(sectionId);
  else openLocalUpload(sectionId);
}

function setImageSourceMenuOpen(open: boolean, sectionId: string) {
  imageSourceMenuSectionId.value = open ? sectionId : '';
}

function isSupportedImage(asset: PlatformAsset) {
  return Boolean(
    asset.mimeType &&
    status.value?.supportedImageMimeTypes.includes(asset.mimeType),
  );
}

async function loadPreview(asset: PlatformAsset) {
  if (previews.has(asset.id)) return;
  const preview = await getAssetPreviewApi(asset.id);
  if (preview.mode === 'url') previews.set(asset.id, preview.url);
}

async function attachAsset(asset: PlatformAsset) {
  const section = activeSection.value;
  if (!section) return;
  if (!isSupportedImage(asset)) {
    message.error('报告当前仅支持 PNG 和 JPEG 图片');
    return;
  }
  if (section.images.some((item) => item.assetId === asset.id)) {
    message.info('该图片已在当前章节中');
    return;
  }
  if (section.images.length >= (status.value?.limits.imagesPerSection ?? 8)) {
    message.warning('单个章节最多使用 8 张图片');
    return;
  }
  if (imageCount.value >= (status.value?.limits.totalImages ?? 24)) {
    message.warning('单个报告最多使用 24 张图片');
    return;
  }
  section.images.push({ assetId: asset.id, caption: asset.name });
  await loadPreview(asset).catch(() => undefined);
}

async function handleAssetSelected(assetId: string) {
  try {
    await attachAsset(await getAssetApi(assetId));
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取图片资产失败');
  }
}

async function handleAssetsSelected(assetIds: string[]) {
  for (const assetId of assetIds) {
    if (
      activeSection.value?.images.some((image) => image.assetId === assetId)
    ) {
      continue;
    }
    if (
      !activeSection.value ||
      activeSection.value.images.length >=
        (status.value?.limits.imagesPerSection ?? 8) ||
      imageCount.value >= (status.value?.limits.totalImages ?? 24)
    ) {
      message.warning('已达到当前章节或报告的图片数量上限');
      break;
    }
    await handleAssetSelected(assetId);
  }
}

async function handleLocalFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length === 0) return;
  uploading.value = true;
  let uploadedCount = 0;
  try {
    for (const file of files) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        message.warning(`${file.name} 不是 PNG 或 JPEG，已跳过`);
        continue;
      }
      if (
        !activeSection.value ||
        activeSection.value.images.length >=
          (status.value?.limits.imagesPerSection ?? 8) ||
        imageCount.value >= (status.value?.limits.totalImages ?? 24)
      ) {
        message.warning('已达到当前章节或报告的图片数量上限');
        break;
      }
      const asset = await platformStore.uploadAsset({
        description: '用于项目设计报告编排的图片素材',
        file,
        name: file.name.replace(/\.[^.]+$/u, ''),
        tags: ['report-source'],
        type: 'image',
      });
      await attachAsset(asset);
      uploadedCount += 1;
    }
    if (uploadedCount) {
      message.success(`${uploadedCount} 张图片已上传并加入当前章节`);
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '图片上传失败');
  } finally {
    uploading.value = false;
  }
}

function removeImage(section: ReportSection, assetId: string) {
  section.images = section.images.filter((item) => item.assetId !== assetId);
}

function moveImage(section: ReportSection, index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= section.images.length) return;
  const next = [...section.images];
  const currentImage = next[index];
  const targetImage = next[target];
  if (!currentImage || !targetImage) return;
  next[index] = targetImage;
  next[target] = currentImage;
  section.images = next;
}

async function submitReport() {
  const projectId = platformStore.currentProjectId;
  if (!projectId || !canSubmit.value) return;
  submitting.value = true;
  try {
    await createReportApi({
      format: form.format,
      generationMode: form.generationMode,
      name: `${form.title.trim()} · ${form.format.toUpperCase()}`,
      projectId,
      reportType: form.reportType,
      sections: sections.value.map((section) => ({
        body: section.body.trim(),
        images: section.images.map((image) => ({
          assetId: image.assetId,
          caption: image.caption.trim(),
        })),
        title: section.title.trim(),
      })),
      summary: form.summary.trim(),
      templateKey: 'rail-design-standard-v1',
      title: form.title.trim(),
    });
    await platformStore.refreshCurrentProjectJobs();
    message.success('报告生成任务已提交');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '报告任务提交失败');
  } finally {
    submitting.value = false;
  }
}

async function downloadAsset(assetId: string) {
  try {
    const result = await getAssetDownloadApi(assetId);
    if (result.mode === 'url') {
      window.open(result.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const blob = new Blob([result.content], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '下载报告失败');
  }
}

async function cancelJob(jobId: string) {
  try {
    await platformStore.cancelJob(jobId);
    message.success('已请求取消报告任务');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '取消任务失败');
  }
}

function jobStatusLabel(value: string) {
  return (
    {
      cancelled: '已取消',
      cancelling: '取消中',
      failed: '失败',
      queued: '排队中',
      running: '生成中',
      succeeded: '已完成',
    }[value] ?? value
  );
}

function jobTagColor(value: string) {
  return (
    {
      cancelled: 'default',
      cancelling: 'orange',
      failed: 'error',
      queued: 'blue',
      running: 'processing',
      succeeded: 'success',
    }[value] ?? 'default'
  );
}

async function initialize() {
  loading.value = true;
  try {
    status.value = await getReportStatusApi();
    await platformStore.refreshCurrentProjectJobs();
    if (!form.title && platformStore.currentProject) {
      form.title = `${platformStore.currentProject.name}客室设计报告`;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载报告模块失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => platformStore.currentProjectId,
  () => void initialize(),
);

onMounted(() => {
  void initialize();
  refreshTimer = setInterval(() => {
    if (
      reportJobs.value.some((job) =>
        ['cancelling', 'queued', 'running'].includes(job.status),
      )
    ) {
      void platformStore.refreshCurrentProjectJobs();
    }
  }, 3000);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <main class="platform-page report-page">
    <PageHeading
      :description="`当前项目：${currentProjectName}。将项目文字与图片资产编排为可编辑、可追溯的交付文档。`"
      eyebrow="Project delivery report"
      title="报告生成"
    />

    <div class="platform-content report-content">
      <Alert
        v-if="!platformStore.currentProjectId"
        message="请先在顶部选择一个项目，再配置报告内容。"
        show-icon
        type="warning"
      />
      <Spin :spinning="loading">
        <section
          class="report-workbench platform-panel"
          data-testid="report-layout"
        >
          <header class="report-section-heading">
            <b>1</b>
            <div>
              <h2>报告基本信息</h2>
              <span>选择报告类型与交付格式，填写标题和内容摘要</span>
            </div>
          </header>

          <div class="report-fields report-fields--two">
            <label>
              <span>报告类型</span>
              <Select
                v-model:value="form.reportType"
                :options="
                  status?.reportTypes.map((item) => ({
                    label: item.label,
                    value: item.key,
                  }))
                "
                placeholder="请选择报告类型"
              />
            </label>
            <label>
              <span>交付格式</span>
              <Select
                v-model:value="form.format"
                :options="
                  status?.formats.map((item) => ({
                    label: item.label,
                    value: item.key,
                  }))
                "
                placeholder="请选择交付格式"
              />
            </label>
          </div>
          <label class="report-field">
            <span>报告标题</span>
            <Input v-model:value="form.title" :maxlength="160" show-count />
          </label>
          <label class="report-field">
            <span>报告摘要</span>
            <Textarea
              v-model:value="form.summary"
              :auto-size="{ minRows: 3, maxRows: 6 }"
              :maxlength="2000"
              placeholder="概述项目背景、核心设计结论和本次报告用途"
              show-count
            />
          </label>

          <section class="report-sections" aria-label="报告章节">
            <header class="report-section-heading">
              <b>2</b>
              <div>
                <h3>报告章节</h3>
                <span>
                  已配置 {{ sections.length }}/{{
                    status?.limits.sections ?? 8
                  }}
                  章 · {{ imageCount }}/{{ status?.limits.totalImages ?? 24 }}
                  张图片
                </span>
              </div>
            </header>

            <article
              v-for="(section, sectionIndex) in sections"
              :key="section.clientId"
              class="report-section"
            >
              <header class="report-section__header">
                <span class="report-section__number">
                  {{ String(sectionIndex + 1).padStart(2, '0') }}
                </span>
                <Input
                  v-model:value="section.title"
                  :maxlength="120"
                  placeholder="章节标题"
                />
                <div class="report-section__tools">
                  <Tooltip title="上移">
                    <Button
                      :disabled="sectionIndex === 0"
                      size="small"
                      type="text"
                      @click="moveSection(sectionIndex, -1)"
                    >
                      <IconifyIcon icon="lucide:arrow-up" />
                    </Button>
                  </Tooltip>
                  <Tooltip title="下移">
                    <Button
                      :disabled="sectionIndex === sections.length - 1"
                      size="small"
                      type="text"
                      @click="moveSection(sectionIndex, 1)"
                    >
                      <IconifyIcon icon="lucide:arrow-down" />
                    </Button>
                  </Tooltip>
                  <Tooltip title="删除章节">
                    <Button
                      danger
                      size="small"
                      type="text"
                      @click="removeSection(section.clientId)"
                    >
                      <IconifyIcon icon="lucide:trash-2" />
                    </Button>
                  </Tooltip>
                </div>
              </header>
              <Textarea
                v-model:value="section.body"
                :auto-size="{ minRows: 4, maxRows: 10 }"
                :maxlength="10000"
                placeholder="填写本章设计说明。使用空行分隔段落，Word、PPT 与 Markdown 会自动编排。"
              />

              <div class="report-images">
                <div
                  v-for="(image, imageIndex) in section.images"
                  :key="image.assetId"
                  class="report-image"
                >
                  <div class="report-image__preview">
                    <img
                      v-if="previews.get(image.assetId)"
                      :alt="image.caption"
                      :src="previews.get(image.assetId)"
                    />
                    <IconifyIcon v-else icon="lucide:image" />
                  </div>
                  <Input
                    v-model:value="image.caption"
                    :maxlength="300"
                    placeholder="图片说明"
                  />
                  <div class="report-image__tools">
                    <Button
                      :disabled="imageIndex === 0"
                      size="small"
                      type="text"
                      @click="moveImage(section, imageIndex, -1)"
                    >
                      <IconifyIcon icon="lucide:chevron-left" />
                    </Button>
                    <Button
                      :disabled="imageIndex === section.images.length - 1"
                      size="small"
                      type="text"
                      @click="moveImage(section, imageIndex, 1)"
                    >
                      <IconifyIcon icon="lucide:chevron-right" />
                    </Button>
                    <Button
                      danger
                      size="small"
                      type="text"
                      @click="removeImage(section, image.assetId)"
                    >
                      移除
                    </Button>
                  </div>
                </div>
                <Dropdown
                  v-if="
                    section.images.length <
                    (status?.limits.imagesPerSection ?? 8)
                  "
                  :open="imageSourceMenuSectionId === section.clientId"
                  :trigger="['click']"
                  @open-change="
                    (open) => setImageSourceMenuOpen(open, section.clientId)
                  "
                >
                  <Button
                    class="report-image-add-button"
                    :disabled="uploading"
                    size="small"
                  >
                    <IconifyIcon icon="lucide:image-plus" />
                    {{ uploading ? '正在上传…' : '添加图片' }}
                    <IconifyIcon icon="lucide:chevron-down" />
                  </Button>
                  <template #overlay>
                    <div
                      class="report-image-source-menu"
                      role="menu"
                      aria-label="选择图片来源"
                    >
                      <Tooltip placement="top" title="从项目资产选择">
                        <Button
                          aria-label="从项目资产选择"
                          class="report-image-source-button"
                          type="text"
                          @click="selectImageSource('asset', section.clientId)"
                        >
                          <IconifyIcon icon="lucide:folder" />
                        </Button>
                      </Tooltip>
                      <Tooltip placement="top" title="上传本地图片">
                        <Button
                          aria-label="上传本地图片"
                          class="report-image-source-button"
                          type="text"
                          @click="selectImageSource('local', section.clientId)"
                        >
                          <IconifyIcon icon="lucide:upload" />
                        </Button>
                      </Tooltip>
                    </div>
                  </template>
                </Dropdown>
              </div>
            </article>
            <Button
              block
              class="report-add-section"
              :disabled="sections.length >= (status?.limits.sections ?? 8)"
              @click="addSection"
            >
              <IconifyIcon icon="lucide:plus" />
              添加章节
            </Button>
          </section>

          <footer class="report-submit">
            <div>
              <strong>输出会自动加入当前项目资产</strong>
              <span>支持后续下载、复用、审计和任务血缘追踪。</span>
            </div>
            <div class="report-submit__actions">
              <label class="report-generation-mode">
                <span>生成方式</span>
                <Select
                  v-model:value="form.generationMode"
                  :options="
                    status?.generationModes.map((mode) => ({
                      disabled: !mode.configured,
                      label: mode.configured
                        ? mode.label
                        : `${mode.label}（未配置）`,
                      value: mode.key,
                    }))
                  "
                />
              </label>
              <Button
                :disabled="!canSubmit"
                :loading="submitting"
                type="primary"
                @click="submitReport"
              >
                <IconifyIcon icon="lucide:file-output" />
                生成 {{ form.format.toUpperCase() }} 报告
              </Button>
            </div>
          </footer>
        </section>
      </Spin>

      <section class="report-jobs platform-panel">
        <header class="report-section-heading">
          <b>3</b>
          <div>
            <h2>最近报告任务</h2>
            <span>显示最近 8 项任务，更多内容可在列表内滚动查看</span>
          </div>
          <Button
            size="small"
            @click="platformStore.refreshCurrentProjectJobs()"
          >
            <IconifyIcon icon="lucide:refresh-cw" />
            刷新
          </Button>
        </header>
        <Empty v-if="!reportJobs.length" description="当前项目还没有报告任务" />
        <div v-else class="report-job-list">
          <article v-for="job in reportJobs" :key="job.id" class="report-job">
            <div class="report-job__icon">
              <IconifyIcon :icon="platformSemanticIcons.report" />
            </div>
            <div class="report-job__content">
              <div class="report-job__title">
                <strong>{{ job.name }}</strong>
                <Tag
                  :color="
                    job.parameters.generationMode === 'ai' ? 'purple' : 'blue'
                  "
                >
                  {{
                    job.parameters.generationMode === 'ai'
                      ? 'AI 生成'
                      : '模板生成'
                  }}
                </Tag>
                <Tag :color="jobTagColor(job.status)">
                  {{ jobStatusLabel(job.status) }}
                </Tag>
              </div>
              <span>
                {{ job.publicId }} ·
                {{ new Date(job.createdAt).toLocaleString('zh-CN') }}
              </span>
              <Progress
                v-if="['queued', 'running', 'cancelling'].includes(job.status)"
                :percent="job.progress"
                size="small"
              />
              <p>{{ job.error?.message ?? job.stage }}</p>
            </div>
            <div class="report-job__actions">
              <Button
                v-if="job.outputAssetId"
                type="primary"
                @click="downloadAsset(job.outputAssetId)"
              >
                <IconifyIcon icon="lucide:download" />
                下载报告
              </Button>
              <Button
                v-if="
                  ['queued', 'running'].includes(job.status) &&
                  job.ownedByCurrentUser
                "
                danger
                @click="cancelJob(job.id)"
              >
                取消
              </Button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <input
      ref="fileInput"
      accept="image/png,image/jpeg"
      hidden
      multiple
      type="file"
      @change="handleLocalFiles"
    />
    <AssetPickerModal
      v-model:open="pickerOpen"
      :accepted-kinds="['image']"
      :assets="platformStore.currentAssets"
      multiple
      :project-id="platformStore.currentProjectId"
      @select-multiple="handleAssetsSelected"
    />
  </main>
</template>

<style scoped>
.report-page {
  min-height: 100%;
}

.report-content {
  display: grid;
  gap: 18px;
}

.report-workbench,
.report-jobs {
  width: 100%;
  min-width: 0;
  padding: 20px;
}

.report-workbench {
  display: grid;
  gap: 20px;
}

.report-section-heading,
.report-submit {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.report-section-heading > b {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  font-size: 12px;
  color: #fff;
  background: var(--rail-red);
  border-radius: 50%;
}

.report-section-heading > div {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}

.report-section-heading h2,
.report-section-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  color: #20272c;
}

.report-section-heading span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 1.5;
  color: #7a848c;
  white-space: nowrap;
}

.report-fields {
  display: grid;
  gap: 16px;
}

.report-fields--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.report-field,
.report-fields label {
  display: grid;
  gap: 8px;
}

.report-field > span,
.report-fields label > span {
  font-size: 13px;
  font-weight: 650;
  color: #4f5961;
}

.report-workbench :deep(.ant-input),
.report-workbench :deep(.ant-select),
.report-workbench :deep(.ant-select-selection-item),
.report-workbench :deep(textarea) {
  font-size: 14px;
  font-weight: 400;
}

.report-fields :deep(.ant-select),
.report-generation-mode :deep(.ant-select) {
  width: 100%;
}

.report-sections {
  display: grid;
  gap: 14px;
}

.report-section {
  display: grid;
  gap: 14px;
  padding: 18px;
  background: #fafafa;
  border: 1px solid #e6e9eb;
  border-radius: 14px;
}

.report-section__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
}

.report-section__number {
  font-size: 16px;
  font-weight: 800;
  color: var(--rail-red);
}

.report-section__tools,
.report-image__tools {
  display: flex;
  gap: 2px;
  align-items: center;
}

.report-images {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.report-image {
  display: grid;
  gap: 9px;
  padding: 10px;
  background: white;
  border: 1px solid #e2e5e7;
  border-radius: 12px;
}

.report-image__preview {
  display: grid;
  place-items: center;
  height: 145px;
  overflow: hidden;
  color: #8a949a;
  background: #f2f4f5;
  border-radius: 8px;
}

.report-image__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.report-image__preview:has(img) {
  background: #fff;
}

.report-image__preview svg {
  width: 28px;
  height: 28px;
}

.report-image__tools {
  justify-content: flex-end;
}

.report-image-add-button {
  place-self: start;
  color: var(--rail-red);
  border-style: dashed;
}

.report-image-source-menu {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(2, 34px);
  gap: 4px;
  width: max-content;
  min-width: 0;
  padding: 6px;
  background: #fff;
  border: 1px solid #e5e8ea;
  border-radius: 9px;
  box-shadow: 0 7px 22px rgb(28 37 43 / 12%);
}

.report-image-source-button {
  display: grid;
  place-items: center;
  width: 34px;
  min-width: 34px;
  max-width: 34px;
  height: 34px;
  padding: 0;
  font-size: 17px;
  color: #59666e;
}

.report-image-source-button:hover,
.report-image-source-button:focus-visible {
  color: var(--rail-red);
  background: var(--rail-red-soft);
}

.report-add-section {
  color: #59666e;
  border-style: dashed;
}

.report-submit {
  align-items: center;
  padding-top: 18px;
  border-top: 1px solid #e5e8ea;
}

.report-submit > div {
  display: grid;
  gap: 3px;
}

.report-submit span {
  font-size: 12px;
  line-height: 1.5;
  color: #748087;
}

.report-submit strong,
.report-generation-mode > span {
  font-size: 13px;
}

.report-submit__actions {
  display: flex !important;
  grid-template-columns: none;
  gap: 10px !important;
  align-items: flex-end;
  font-size: 14px;
}

.report-generation-mode {
  display: grid;
  gap: 5px;
  min-width: 150px;
}

.report-generation-mode > span {
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  color: #4f5961;
}

.report-submit__actions :deep(.ant-select),
.report-submit__actions :deep(.ant-select-selection-item),
.report-submit__actions :deep(.ant-btn) {
  font-size: 14px;
  font-weight: 500;
}

.report-jobs {
  display: grid;
  gap: 18px;
}

.report-job-list {
  display: grid;
  gap: 0;
  width: 100%;
  max-height: 420px;
  padding-right: 6px;
  overflow: auto;
  scrollbar-gutter: stable;
}

.report-job {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  min-width: 720px;
  padding: 14px 0;
  border-top: 1px solid #eceeef;
}

.report-job:first-child {
  border-top: 0;
}

.report-job__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 10px;
}

.report-job__content {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.report-job__title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.report-job__title strong {
  font-size: 14px;
  line-height: 1.5;
  color: #20272c;
}

.report-job__title :deep(.ant-tag) {
  margin-inline-end: 0;
  font-size: 12px;
  line-height: 20px;
}

.report-job__content > span,
.report-job__content > p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #768188;
}

.report-job__actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 820px) {
  .report-fields--two,
  .report-images {
    grid-template-columns: 1fr;
  }

  .report-submit {
    flex-direction: column;
  }

  .report-submit__actions {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .report-workbench,
  .report-jobs {
    padding: 16px;
  }
}
</style>
