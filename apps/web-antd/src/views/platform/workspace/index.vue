<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  message,
  Progress,
  Tag,
  Textarea,
} from 'ant-design-vue';

import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

const route = useRoute();
const router = useRouter();
const platformStore = usePlatformStore();
const selectedAssetIds = ref<string[]>([]);
const submitting = ref(false);
const prompt = ref(
  '以现代、克制的设计语言优化客室空间，保持结构关系清晰，并沿用当前项目的暖灰 CMF 方向。',
);

const application = computed(() =>
  platformStore.applications.find((item) => item.key === route.params.appKey),
);

const availableAssets = computed(() => {
  if (!application.value) return [];
  return platformStore.currentAssets.filter((asset) =>
    application.value?.acceptedAssetTypes.includes(asset.type),
  );
});

const activeJob = computed(() =>
  platformStore.currentJobs.find(
    (job) =>
      job.appKey === application.value?.key &&
      ['queued', 'running'].includes(job.status),
  ),
);

const latestOutput = computed(() =>
  platformStore.currentAssets.find(
    (asset) => asset.sourceAppKey === application.value?.key,
  ),
);

const typeLabels: Record<string, string> = {
  audio: '音频',
  image: '图片',
  lora: 'LoRA',
  mask: '遮罩',
  material: '材质',
  model3d: '3D 模型',
  report: '报告',
  text: '文本',
  video: '视频',
};

function toggleAsset(assetId: string) {
  selectedAssetIds.value = selectedAssetIds.value.includes(assetId)
    ? selectedAssetIds.value.filter((id) => id !== assetId)
    : [...selectedAssetIds.value, assetId];
}

async function runFrameworkTest() {
  if (!application.value || !platformStore.currentProjectId) return;
  submitting.value = true;
  try {
    await platformStore.runApplication(
      application.value.key,
      selectedAssetIds.value,
      { prompt: prompt.value },
    );
    message.success('平台任务已登记；执行状态由独立能力适配器回传');
  } finally {
    submitting.value = false;
  }
}

watch(
  () => route.params.appKey,
  () => {
    selectedAssetIds.value = [];
  },
);
</script>

<template>
  <main v-if="application" class="application-workspace">
    <header class="workspace-header">
      <div class="workspace-header__identity">
        <Button
          aria-label="返回应用中心"
          shape="circle"
          @click="router.push('/applications')"
        >
          <IconifyIcon icon="lucide:arrow-left" />
        </Button>
        <div
          class="workspace-header__icon"
          :style="{
            backgroundColor: `${application.color}14`,
            color: application.color,
          }"
        >
          <IconifyIcon :icon="application.icon" />
        </div>
        <div>
          <div class="workspace-header__eyebrow">
            应用工作区 · {{ platformStore.currentProject?.code }}
          </div>
          <h1>{{ application.name }}</h1>
        </div>
      </div>
      <div class="workspace-header__actions">
        <StatusPill :status="application.status" />
        <Button @click="router.push('/jobs')">任务记录</Button>
        <Button
          :disabled="Boolean(activeJob) || !platformStore.currentProjectId"
          :loading="submitting"
          type="primary"
          @click="runFrameworkTest"
        >
          <IconifyIcon class="mr-1" icon="lucide:play" />
          {{ activeJob ? '任务运行中' : '提交任务' }}
        </Button>
      </div>
    </header>

    <div class="workspace-grid">
      <aside class="workspace-panel workspace-inputs">
        <div class="workspace-panel__head">
          <div>
            <span>01</span>
            <h2>任务输入</h2>
          </div>
          <small>仅使用业务语义参数</small>
        </div>
        <div class="workspace-panel__scroll">
          <label class="workspace-field">
            <span>任务名称</span>
            <Input
              :value="`${application.shortName}方案 · ${platformStore.currentProject?.name}`"
            />
          </label>
          <label class="workspace-field">
            <span>设计要求</span>
            <Textarea v-model:value="prompt" :rows="7" />
            <small>能力适配器接入后由后端 Schema 决定参数内容。</small>
          </label>

          <div class="workspace-field">
            <span>允许的输入资产</span>
            <div class="input-contract-tags">
              <Tag v-for="type in application.acceptedAssetTypes" :key="type">
                {{ typeLabels[type] }}
              </Tag>
            </div>
          </div>

          <div class="workspace-settings">
            <div>
              <span>结果归属</span>
              <strong>{{ platformStore.currentProject?.name }}</strong>
            </div>
            <div>
              <span>输出类型</span>
              <strong>
                {{
                  application.outputAssetTypes
                    .map((type) => typeLabels[type])
                    .join('、')
                }}
              </strong>
            </div>
            <div>
              <span>服务适配器</span>
              <strong>尚未配置</strong>
            </div>
          </div>
        </div>
      </aside>

      <section class="workspace-stage">
        <div class="stage-toolbar">
          <div>
            <span class="stage-toolbar__dot"></span>
            平台任务模式
          </div>
          <span>输出将登记为项目资产</span>
        </div>

        <div class="stage-canvas">
          <div v-if="activeJob" class="stage-running">
            <div class="stage-running__signal">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="rail-section-label">Platform job</div>
            <h2>{{ activeJob.name }}</h2>
            <p>{{ activeJob.stage }}</p>
            <Progress
              :percent="activeJob.progress"
              :show-info="false"
              stroke-color="#b91c32"
            />
            <small>
              本次使用 {{ activeJob.inputAssetIds.length }} 项输入资产
            </small>
          </div>

          <div v-else-if="latestOutput" class="stage-output">
            <div
              class="stage-output__preview"
              :style="{ '--output-color': application.color }"
            >
              <IconifyIcon :icon="application.icon" />
              <span>{{ latestOutput.format }}</span>
            </div>
            <div class="stage-output__copy">
              <StatusPill status="succeeded" />
              <h2>{{ latestOutput.name }}</h2>
              <p>{{ latestOutput.description }}</p>
              <div>
                <Button @click="router.push('/assets')">在资产中心查看</Button>
                <Button type="primary" @click="runFrameworkTest">
                  再次联调
                </Button>
              </div>
            </div>
          </div>

          <div v-else class="stage-empty">
            <div class="stage-empty__diagram">
              <span><IconifyIcon icon="lucide:library" /></span>
              <i></i>
              <span class="stage-empty__core">
                <IconifyIcon :icon="application.icon" />
              </span>
              <i></i>
              <span><IconifyIcon icon="lucide:archive" /></span>
            </div>
            <h2>应用工作区已就绪</h2>
            <p>
              从右侧选择项目资产并提交任务。当前平台会真实保存任务记录；第三方服务由独立适配器接入。
            </p>
            <Button type="primary" @click="runFrameworkTest">
              提交平台任务
            </Button>
          </div>
        </div>

        <div class="adapter-boundary">
          <IconifyIcon icon="lucide:shield-check" />
          <div>
            <strong>外部能力边界</strong>
            <p>
              浏览器只提交 assetId、projectId
              和业务参数；地址、密钥和底层工作流由后端适配器管理。
            </p>
          </div>
        </div>
      </section>

      <aside class="workspace-panel workspace-assets">
        <div class="workspace-panel__head">
          <div>
            <span>02</span>
            <h2>项目资产</h2>
          </div>
          <small>{{ selectedAssetIds.length }} 项已选</small>
        </div>
        <div class="workspace-panel__scroll">
          <button
            v-for="asset in availableAssets"
            :key="asset.id"
            :class="{
              'workspace-asset--selected': selectedAssetIds.includes(asset.id),
            }"
            class="workspace-asset"
            type="button"
            @click="toggleAsset(asset.id)"
          >
            <div
              class="workspace-asset__preview"
              :style="{ '--asset-color': asset.accent }"
            >
              <IconifyIcon icon="lucide:layers-3" />
            </div>
            <div>
              <strong>{{ asset.name }}</strong>
              <small>
                {{ typeLabels[asset.type] }} · V{{ asset.version }} ·
                {{ asset.owner }}
              </small>
            </div>
            <IconifyIcon
              class="workspace-asset__check"
              :icon="
                selectedAssetIds.includes(asset.id)
                  ? 'lucide:circle-check'
                  : 'lucide:circle'
              "
            />
          </button>

          <div v-if="!availableAssets.length" class="rail-empty">
            <div>
              <IconifyIcon class="text-3xl" icon="lucide:package-open" />
              <p>当前项目没有兼容资产</p>
              <Button type="link" @click="router.push('/assets')">
                前往资产中心
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <main v-else class="platform-page">
    <div class="rail-empty">
      <div>
        <h2>应用不存在或已下线</h2>
        <Button type="primary" @click="router.push('/applications')">
          返回应用中心
        </Button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.application-workspace {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--rail-ink);
  background: #eef1f4;
}

.workspace-header {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  min-height: 78px;
  padding: 13px 20px;
  background: #fff;
  border-bottom: 1px solid var(--rail-line);
}

.workspace-header__identity,
.workspace-header__actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.workspace-header__icon {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  margin-left: 4px;
  font-size: 22px;
  border-radius: 11px;
}

.workspace-header__eyebrow {
  font-size: 9px;
  font-weight: 700;
  color: var(--rail-steel);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.workspace-header h1 {
  margin: 3px 0 0;
  font-size: 18px;
  font-weight: 680;
}

.workspace-grid {
  display: grid;
  flex: 1;
  grid-template-columns: 296px minmax(420px, 1fr) 322px;
  gap: 1px;
  min-height: calc(100vh - 166px);
  background: var(--rail-line);
}

.workspace-panel,
.workspace-stage {
  min-width: 0;
  background: #fff;
}

.workspace-panel {
  display: flex;
  flex-direction: column;
}

.workspace-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 62px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--rail-line);
}

.workspace-panel__head > div {
  display: flex;
  gap: 9px;
  align-items: center;
}

.workspace-panel__head span {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  color: var(--rail-red);
}

.workspace-panel__head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 680;
}

.workspace-panel__head small {
  font-size: 9px;
  color: var(--rail-steel);
}

.workspace-panel__scroll {
  flex: 1;
  padding: 16px;
  overflow: auto;
}

.workspace-field {
  display: grid;
  gap: 7px;
  margin-bottom: 18px;
}

.workspace-field > span {
  font-size: 11px;
  font-weight: 650;
}

.workspace-field > small {
  font-size: 9px;
  line-height: 1.5;
  color: var(--rail-steel);
}

.input-contract-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.input-contract-tags :deep(.ant-tag) {
  margin: 0;
  font-size: 9px;
}

.workspace-settings {
  border: 1px solid var(--rail-line);
  border-radius: 10px;
}

.workspace-settings > div {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 11px 12px;
  border-bottom: 1px solid var(--rail-line);
}

.workspace-settings > div:last-child {
  border-bottom: 0;
}

.workspace-settings span {
  font-size: 9px;
  color: var(--rail-steel);
}

.workspace-settings strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 9px;
  text-align: right;
  white-space: nowrap;
}

.workspace-stage {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: #f6f7f8;
}

.stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 9px;
  color: var(--rail-steel);
}

.stage-toolbar div {
  display: flex;
  gap: 6px;
  align-items: center;
}

.stage-toolbar__dot {
  width: 7px;
  height: 7px;
  background: var(--rail-warning);
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgb(165 101 22 / 12%);
}

.stage-canvas {
  display: grid;
  flex: 1;
  place-items: center;
  min-height: 480px;
  overflow: hidden;
  background-color: #fff;
  background-image:
    linear-gradient(#eef0f2 1px, transparent 1px),
    linear-gradient(90deg, #eef0f2 1px, transparent 1px);
  background-size: 28px 28px;
  border: 1px solid #d8dde2;
  border-radius: 12px;
}

.stage-empty,
.stage-running {
  width: min(480px, 86%);
  text-align: center;
}

.stage-empty__diagram {
  display: grid;
  grid-template-columns: 52px 60px 68px 60px 52px;
  align-items: center;
  justify-content: center;
  margin-bottom: 28px;
}

.stage-empty__diagram span {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  font-size: 20px;
  color: #69747f;
  background: #fff;
  border: 1px solid #cbd1d7;
  border-radius: 50%;
}

.stage-empty__diagram .stage-empty__core {
  width: 68px;
  height: 68px;
  color: #fff;
  background: var(--rail-red);
  border-color: #d79da6;
  box-shadow: 0 0 0 8px rgb(185 28 50 / 7%);
}

.stage-empty__diagram i {
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    #aab1b9 0 5px,
    transparent 5px 9px
  );
}

.stage-empty h2,
.stage-running h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.stage-empty p,
.stage-running p {
  margin: 0 auto 20px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--rail-steel);
}

.stage-running__signal {
  display: flex;
  gap: 7px;
  justify-content: center;
  margin-bottom: 22px;
}

.stage-running__signal span {
  width: 9px;
  height: 34px;
  background: var(--rail-red);
  border-radius: 9px;
  animation: signal 1s ease-in-out infinite alternate;
}

.stage-running__signal span:nth-child(2) {
  animation-delay: 0.18s;
}

.stage-running__signal span:nth-child(3) {
  animation-delay: 0.36s;
}

.stage-running small {
  display: block;
  margin-top: 12px;
  font-size: 9px;
  color: var(--rail-steel);
}

.stage-output {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 26px;
  align-items: center;
  width: min(660px, 88%);
}

.stage-output__preview {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  font-size: 66px;
  color: #fff;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 38%), transparent 48%),
    var(--output-color);
  border-radius: 12px;
  box-shadow: 0 20px 44px rgb(30 36 42 / 16%);
}

.stage-output__preview span {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 9px;
  font-weight: 700;
}

.stage-output__copy h2 {
  margin: 12px 0 6px;
  font-size: 21px;
}

.stage-output__copy p {
  font-size: 11px;
  line-height: 1.65;
  color: var(--rail-steel);
}

.stage-output__copy > div {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.adapter-boundary {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  padding: 12px 14px;
  margin-top: 12px;
  color: var(--rail-steel);
  background: #fff;
  border: 1px solid #dce2e6;
  border-radius: 10px;
}

.adapter-boundary > svg {
  flex: 0 0 auto;
  margin-top: 2px;
  font-size: 18px;
  color: var(--rail-success);
}

.adapter-boundary strong {
  font-size: 10px;
  color: var(--rail-ink);
}

.adapter-boundary p {
  margin: 3px 0 0;
  font-size: 9px;
  line-height: 1.55;
}

.workspace-asset {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 18px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 8px;
  margin-bottom: 9px;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--rail-line);
  border-radius: 9px;
}

.workspace-asset:hover {
  border-color: #caa7ad;
}

.workspace-asset--selected {
  background: var(--rail-red-soft);
  border-color: #cf8995;
  box-shadow: inset 3px 0 var(--rail-red);
}

.workspace-asset__preview {
  display: grid;
  place-items: center;
  width: 54px;
  height: 48px;
  color: #fff;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 30%), transparent),
    var(--asset-color);
  border-radius: 7px;
}

.workspace-asset > div:nth-child(2) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.workspace-asset strong,
.workspace-asset small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-asset strong {
  font-size: 10px;
}

.workspace-asset small {
  margin-top: 4px;
  font-size: 8px;
  color: var(--rail-steel);
}

.workspace-asset__check {
  color: var(--rail-red);
}

@keyframes signal {
  to {
    height: 14px;
    opacity: 0.5;
  }
}

@media (max-width: 1150px) {
  .workspace-grid {
    grid-template-columns: 260px minmax(390px, 1fr);
  }

  .workspace-assets {
    display: none;
  }
}

@media (max-width: 760px) {
  .workspace-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .workspace-header__actions {
    flex-wrap: wrap;
    width: 100%;
  }

  .workspace-grid {
    display: flex;
    flex-direction: column;
  }

  .workspace-inputs {
    min-height: auto;
  }

  .workspace-panel__scroll {
    max-height: none;
  }

  .stage-canvas {
    min-height: 450px;
  }

  .stage-output {
    grid-template-columns: 1fr;
    padding: 24px 0;
  }
}
</style>
