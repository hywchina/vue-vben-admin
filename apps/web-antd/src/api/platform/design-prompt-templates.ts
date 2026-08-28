import type {
  DesignPromptTemplateCatalog,
  DesignPromptTemplateCategory,
  DesignPromptTemplateMode,
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
) {
  return requestClient.put<DesignPromptTemplateCatalog>(
    `/design-prompt-templates/${designMode}`,
    { categories },
  );
}
