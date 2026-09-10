export type DesignPromptTemplateMode = 'cabin' | 'cmf' | 'component';

export interface DesignPromptTemplateOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  target?: string;
  editValue?: string;
  enabled?: boolean;
  workflows?: string[];
  requires?: string[];
  conflicts?: string[];
  includes?: string[];
  aspectRatio?: string;
  width?: number;
  height?: number;
}

export interface DesignPromptTemplateCategory {
  id: string;
  name: string;
  section?:
    | 'appearance'
    | 'camera'
    | 'constraints'
    | 'lighting'
    | 'parameters'
    | 'preset'
    | 'scene'
    | 'style'
    | 'subject';
  selection?: 'multiple' | 'single';
  options: DesignPromptTemplateOption[];
}

export interface DesignPromptTemplateCatalog {
  categories: DesignPromptTemplateCategory[];
  revision: number;
  designMode: DesignPromptTemplateMode;
  updatedAt: null | string;
  updatedBy: null | string;
}

export interface PromptTemplatePreview {
  size?: { aspectRatio?: string; height?: number; width?: number };
  text: string;
  errors: string[];
  length: number;
  revision: number;
  expanded: { id: string; label: string }[];
}
export interface PromptTemplateContext {
  defaultWidth?: number;
  defaultHeight?: number;
  widthLimit?: { max?: number; min?: number; step?: number };
  heightLimit?: { max?: number; min?: number; step?: number };
  workflowKey: string;
  editing: boolean;
  maxLength: number;
  width?: number;
  height?: number;
}
export interface PromptTemplateMaintenance {
  defaults: { categories: DesignPromptTemplateCategory[]; version: string };
  versions: {
    categories: DesignPromptTemplateCategory[];
    reason: string;
    revision: number;
    updatedAt: string;
  }[];
}
