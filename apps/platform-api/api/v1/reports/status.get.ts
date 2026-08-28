import {
  REPORT_SUPPORTED_IMAGE_MIME_TYPES,
  REPORT_TEMPLATE_KEY,
  reportTypeLabels,
} from '~/utils/domain/capabilities/report/schema';
import { requireIdentity } from '~/utils/identity';
import { getConfig } from '~/utils/infrastructure/config';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const config = getConfig();
  return {
    configured: true,
    formats: [
      { key: 'docx', label: 'Word 文档（.docx）' },
      { key: 'pptx', label: 'PowerPoint 演示文稿（.pptx）' },
      { key: 'md', label: 'Markdown 文档（.md）' },
    ],
    limits: { imagesPerSection: 8, sections: 8, totalImages: 24 },
    generationModes: [
      {
        configured: true,
        description: '按平台标准结构确定性编排 Word、PowerPoint 或 Markdown',
        key: 'template',
        label: '模板生成',
      },
      {
        configured: Boolean(config.reportAiApiUrl),
        description: config.reportAiApiUrl
          ? '调用本地 AI 报告服务生成 Word、PowerPoint 或 Markdown'
          : '平台 API 尚未配置 REPORT_AI_API_URL',
        key: 'ai',
        label: 'AI 生成',
      },
    ],
    reportTypes: Object.entries(reportTypeLabels).map(([key, label]) => ({
      key,
      label,
    })),
    supportedImageMimeTypes: REPORT_SUPPORTED_IMAGE_MIME_TYPES,
    template: {
      key: REPORT_TEMPLATE_KEY,
      label: '轨道客室标准设计报告',
      version: 1,
    },
  };
});
