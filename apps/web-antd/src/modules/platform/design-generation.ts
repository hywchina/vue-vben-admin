import type { PlatformApplication } from './types';

import { platformUiIcons } from '#/modules/platform/ui-icons';

export type DesignGenerationCategory = 'image' | 'text';

export const designGenerationCategories = [
  { icon: platformUiIcons.imagePlus, key: 'text', label: '文生图' },
  { icon: platformUiIcons.images, key: 'image', label: '图生图' },
] as const;

export function isDesignGenerationApplication(appKey: string) {
  return appKey !== 'text-chat';
}

// 分类是输入器分组，不改变既有工作流的输入、输出或执行契约。
export function designGenerationCategory(
  appKey: string,
): DesignGenerationCategory {
  return appKey === 'text-to-image' ? 'text' : 'image';
}

export function generationApplications(
  applications: readonly PlatformApplication[],
  category: DesignGenerationCategory,
) {
  return applications.filter(
    (application) =>
      application.visible &&
      application.capabilityCode &&
      isDesignGenerationApplication(application.key) &&
      designGenerationCategory(application.key) === category,
  );
}

export function defaultGenerationApplicationKey(
  applications: readonly PlatformApplication[],
  category: DesignGenerationCategory,
) {
  const key = category === 'text' ? 'text-to-image' : 'inpaint-single';
  return generationApplications(applications, category).find(
    (application) => application.key === key,
  )?.key;
}
