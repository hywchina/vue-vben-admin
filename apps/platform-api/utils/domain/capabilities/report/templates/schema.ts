import { z } from 'zod';

export const templateRoleSchema = z.enum([
  'fixed',
  'title',
  'summary',
  'section-title',
  'section-body',
  'images',
  'image-caption',
  'value',
]);
export type TemplateRole = z.infer<typeof templateRoleSchema>;
export const templateBindingSchema = z.object({
  id: z.string().min(1).max(240),
  role: templateRoleSchema,
  sectionIndex: z.number().int().min(0).max(7).default(0),
  fieldName: z.string().trim().max(80).default(''),
});
export const templateConfigurationSchema = z
  .object({
    bindings: z.array(templateBindingSchema).min(1).max(500),
    repeatSections: z.boolean().default(true),
  })
  .superRefine((input, ctx) => {
    if (
      new Set(input.bindings.map((item) => item.id)).size !==
      input.bindings.length
    )
      ctx.addIssue({ code: 'custom', message: '同一个模板位置不能重复配置' });
    if (input.bindings.every((item) => item.role === 'fixed'))
      ctx.addIssue({
        code: 'custom',
        message: '请至少指定一个需要填入内容的位置',
      });
    if (input.bindings.some((item) => item.role === 'value' && !item.fieldName))
      ctx.addIssue({ code: 'custom', message: '自定义字段必须填写名称' });
  });
export type TemplateBinding = z.infer<typeof templateBindingSchema>;
export type TemplateConfiguration = z.infer<typeof templateConfigurationSchema>;
export interface TemplateElement {
  id: string;
  part: string;
  pageNumber?: number;
  index: number;
  kind: 'image' | 'text';
  text: string;
  role: TemplateRole;
  fieldName: string;
  fontSize?: number;
  fontFamily?: string;
  unsupportedReason?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  maxChars: number;
}
export interface TemplateManifest {
  format: 'docx' | 'pptx';
  elements: TemplateElement[];
  fonts: string[];
  pageCount: number;
  warnings: string[];
}
export interface ReportTemplateView {
  id: string;
  projectId: string;
  name: string;
  format: 'docx' | 'pptx';
  revision: number;
  status: 'draft' | 'ready';
  manifest: TemplateManifest;
  configuration: null | TemplateConfiguration;
  sha256: string;
  createdAt: string;
}
