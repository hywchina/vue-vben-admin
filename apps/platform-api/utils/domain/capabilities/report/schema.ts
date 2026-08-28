import { z } from 'zod';

export const REPORT_APPLICATION_KEY = 'report-generator';
export const REPORT_TEMPLATE_KEY = 'rail-design-standard-v1';
export const REPORT_SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
] as const;

export const reportFormatSchema = z.enum(['docx', 'md', 'pptx']);
export const reportGenerationModeSchema = z.enum(['template', 'ai']);
export const reportTypeSchema = z.enum([
  'cmf-design',
  'component-design',
  'design-proposal',
  'project-summary',
]);

const reportImageSchema = z.object({
  assetId: z.string().uuid(),
  caption: z.string().trim().max(300).default(''),
});

const reportSectionSchema = z
  .object({
    body: z.string().trim().max(10_000).default(''),
    images: z.array(reportImageSchema).max(8).default([]),
    title: z.string().trim().min(1).max(120),
  })
  .refine(
    (section) => Boolean(section.body || section.images.length > 0),
    '每个章节至少需要正文或一张图片',
  );

export const createReportSchema = z
  .object({
    format: reportFormatSchema,
    generationMode: reportGenerationModeSchema.default('template'),
    name: z.string().trim().min(1).max(200),
    projectId: z.string().uuid(),
    reportType: reportTypeSchema,
    sections: z.array(reportSectionSchema).min(1).max(8),
    summary: z.string().trim().max(2000).default(''),
    templateKey: z.literal(REPORT_TEMPLATE_KEY).default(REPORT_TEMPLATE_KEY),
    title: z.string().trim().min(1).max(160),
  })
  .superRefine((input, context) => {
    const imageCount = input.sections.reduce(
      (count, section) => count + section.images.length,
      0,
    );
    if (imageCount > 24) {
      context.addIssue({
        code: 'custom',
        message: '单个报告最多使用 24 张图片',
        path: ['sections'],
      });
    }
  });

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ReportFormat = z.infer<typeof reportFormatSchema>;
export type ReportGenerationMode = z.infer<typeof reportGenerationModeSchema>;
export type ReportType = z.infer<typeof reportTypeSchema>;

export const reportTypeLabels: Record<ReportType, string> = {
  'cmf-design': 'CMF 设计报告',
  'component-design': '客室零部件设计报告',
  'design-proposal': '客室设计方案报告',
  'project-summary': '项目设计总结报告',
};

export function orderedReportAssetIds(input: CreateReportInput) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const section of input.sections) {
    for (const image of section.images) {
      if (seen.has(image.assetId)) continue;
      seen.add(image.assetId);
      ids.push(image.assetId);
    }
  }
  return ids;
}

export function reportMimeType(format: ReportFormat) {
  if (format === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (format === 'pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return 'text/markdown';
}

export function safeReportFilename(title: string, format: ReportFormat) {
  const stem = [...title.normalize('NFKC')]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 32)
    .join('')
    .replaceAll(/[\\/:*?"<>|]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${stem || '项目设计报告'}.${format}`;
}
