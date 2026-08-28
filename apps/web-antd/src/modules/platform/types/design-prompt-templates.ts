export type DesignPromptTemplateMode = 'cabin' | 'cmf' | 'component';

export interface DesignPromptTemplateOption {
  id: string;
  label: string;
  value: string;
}

export interface DesignPromptTemplateCategory {
  id: string;
  name: string;
  options: DesignPromptTemplateOption[];
}

export interface DesignPromptTemplateCatalog {
  categories: DesignPromptTemplateCategory[];
  designMode: DesignPromptTemplateMode;
  updatedAt: null | string;
  updatedBy: null | string;
}
