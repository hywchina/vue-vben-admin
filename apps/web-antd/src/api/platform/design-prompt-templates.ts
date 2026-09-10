import type {
  DesignPromptTemplateCatalog,
  DesignPromptTemplateCategory,
  DesignPromptTemplateMode,
  PromptTemplateContext,
  PromptTemplateMaintenance,
  PromptTemplatePreview,
} from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getDesignPromptTemplateCatalogApi(
  designMode: DesignPromptTemplateMode,
) {
  return requestClient.get<DesignPromptTemplateCatalog>(
    `/design-prompt-templates/${designMode}`,
  );
}

export function updateDesignPromptTemplateCatalogApi(
  designMode: DesignPromptTemplateMode,
  categories: DesignPromptTemplateCategory[],
  expectedRevision: number,
  reason: 'restore-defaults' | 'restore-version' | 'save' = 'save',
) {
  return requestClient.put<DesignPromptTemplateCatalog>(
    `/design-prompt-templates/${designMode}`,
    { categories, expectedRevision, reason },
  );
}

export function previewDesignPromptTemplateApi(
  mode: DesignPromptTemplateMode,
  context: PromptTemplateContext,
  selected: string[],
  categories?: DesignPromptTemplateCategory[],
) {
  return requestClient.post<PromptTemplatePreview>(
    `/design-prompt-templates/${mode}/preview`,
    { ...context, selected, ...(categories ? { categories } : {}) },
  );
}
export function getDesignPromptTemplateMaintenanceApi(
  mode: DesignPromptTemplateMode,
) {
  return requestClient.get<PromptTemplateMaintenance>(
    `/design-prompt-templates/${mode}/maintenance`,
  );
}
