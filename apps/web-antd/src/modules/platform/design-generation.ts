import type { PlatformApplication } from './types';

import { platformUiIcons } from '#/modules/platform/ui-icons';

import { isLocalEditWorkflow, localImageEditKey } from './local-image-edit';

export type DesignGenerationCategory = 'image' | 'text';

export const retiredBaseEditKey = 'image-edit-base';
export const retiredLoraTextKey = 'text-to-image-lora';
export const referenceImageEditKey = 'reference-image-edit';
export const referenceImageWorkflows = [
  'single-image-edit',
  'image-edit-kv',
  'multi-image-edit',
] as const;

export function isReferenceImageWorkflow(appKey: string) {
  return referenceImageWorkflows.some((key) => key === appKey);
}
export const baseEditReplacements = [
  { key: 'single-image-edit', label: '用单图继续编辑' },
  { key: 'image-edit-kv', label: '用双图继续编辑' },
] as const;

export const designGenerationCategories = [
  { icon: platformUiIcons.imagePlus, key: 'text', label: '文生图' },
  { icon: platformUiIcons.images, key: 'image', label: '图生图' },
] as const;

export function isDesignGenerationApplication(appKey: string) {
  return ![
    retiredBaseEditKey,
    retiredLoraTextKey,
    'screen-capture-edit',
    'text-chat',
  ].includes(appKey);
}

// 分类是输入器分组，不改变既有工作流的输入、输出或执行契约。
export function designGenerationCategory(
  appKey: string,
): DesignGenerationCategory {
  return ['text-to-image', 'text-to-image-lora'].includes(appKey)
    ? 'text'
    : 'image';
}

export function generationApplications(
  applications: readonly PlatformApplication[],
  category: DesignGenerationCategory,
) {
  const unified = applications.some(
    (app) =>
      app.key === referenceImageEditKey && app.visible && app.capabilityCode,
  );
  const localEdit = applications.some(
    (app) => app.key === localImageEditKey && app.visible && app.capabilityCode,
  );
  return applications.filter(
    (application) =>
      application.visible &&
      application.key !== 'region-edit' &&
      application.capabilityCode &&
      isDesignGenerationApplication(application.key) &&
      !(unified && isReferenceImageWorkflow(application.key)) &&
      !(localEdit && isLocalEditWorkflow(application.key)) &&
      designGenerationCategory(application.key) === category,
  );
}

export function defaultGenerationApplicationKey(
  applications: readonly PlatformApplication[],
  category: DesignGenerationCategory,
  mode?: 'cabin' | 'cmf' | 'component' | 'report',
) {
  if (
    category === 'image' &&
    mode &&
    mode !== 'report' &&
    applications.some((app) => app.designModes)
  )
    return generationApplications(applications, category).find(
      (app) => app.designModes?.[mode]?.defaultImage,
    )?.key;
  const imageDefault = applications.some((app) => app.key === localImageEditKey)
    ? localImageEditKey
    : 'inpaint-single';
  const key = category === 'text' ? 'text-to-image' : imageDefault;
  return generationApplications(applications, category).find(
    (application) => application.key === key,
  )?.key;
}
