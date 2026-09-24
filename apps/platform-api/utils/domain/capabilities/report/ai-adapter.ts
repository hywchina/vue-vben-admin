import type { ReportArtifact, ReportImageAsset } from './renderer';
import type { CreateReportInput } from './schema';

import { Buffer } from 'node:buffer';

import { reportMimeType, reportTypeLabels, safeReportFilename } from './schema';

export class ReportAiAdapterError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReportAiAdapterError';
  }
}

interface GenerateAiReportInput {
  apiUrl: string;
  assets: ReadonlyMap<string, ReportImageAsset>;
  createdAt: Date;
  fetchImplementation?: typeof fetch;
  maxOutputBytes: number;
  parameters: CreateReportInput;
  projectName: string;
  requestedBy?: string;
  template: string;
  timeoutMs: number;
}

export function buildAiReportPrompt(input: {
  assets: ReadonlyMap<string, ReportImageAsset>;
  createdAt?: Date;
  parameters: CreateReportInput;
  projectName: string;
  requestedBy?: string;
}) {
  const { parameters } = input;
  const lines = [
    '请根据以下真实项目资料生成一份结构完整、表达专业的中文轨道客室设计报告。',
    '严格保留给定的标题、摘要、章节顺序、限定条件和待确认事项，不得改变其事实状态。',
    '不得虚构未提供的项目数据、尺寸、性能、试验结论、法规符合性、量化指标、收益、能力或实施结果。',
    '用户给出的建议、目标或待验证内容必须保持为建议、目标或待验证状态，不得写成已经完成的成果。',
    '图片只能作为可见设计特征的证据，不得由图片推断尺寸、材料性能或合规结论。',
    '每张附件图片最多使用一次；避免重复段落、空泛口号、装饰性库存图片和无依据的时间戳。',
    `报告类型：${reportTypeLabels[parameters.reportType]}`,
    `项目名称：${input.projectName}`,
    `报告标题：${parameters.title}`,
    `交付格式：${parameters.format === 'md' ? 'Markdown（.md）' : parameters.format.toUpperCase()}`,
  ];
  if (input.requestedBy) lines.push(`编制人：${input.requestedBy}`);
  if (input.createdAt) {
    lines.push(`生成日期：${input.createdAt.toLocaleDateString('zh-CN')}`);
  }
  if (parameters.summary) lines.push(`报告摘要：${parameters.summary}`);

  parameters.sections.forEach((section, sectionIndex) => {
    lines.push('', `第 ${sectionIndex + 1} 章：${section.title}`);
    if (section.body) lines.push(section.body);
    section.images.forEach((image, imageIndex) => {
      const asset = input.assets.get(image.assetId);
      if (!asset) {
        throw new ReportAiAdapterError(
          'REPORT_IMAGE_ASSET_MISSING',
          `AI 报告图片资产不存在：${image.assetId}`,
        );
      }
      lines.push(
        `配图 ${sectionIndex + 1}-${imageIndex + 1}：${image.caption || asset.name}（附件：${asset.filename}）`,
      );
    });
  });
  return lines.join('\n');
}

function orderedImageAssets(input: GenerateAiReportInput) {
  const result: ReportImageAsset[] = [];
  const seen = new Set<string>();
  for (const section of input.parameters.sections) {
    for (const image of section.images) {
      if (seen.has(image.assetId)) continue;
      const asset = input.assets.get(image.assetId);
      if (!asset) {
        throw new ReportAiAdapterError(
          'REPORT_IMAGE_ASSET_MISSING',
          `AI 报告图片资产不存在：${image.assetId}`,
        );
      }
      seen.add(image.assetId);
      result.push(asset);
    }
  }
  return result;
}

function containsZipEntry(bytes: Uint8Array, entry: string) {
  return Buffer.from(bytes).includes(Buffer.from(entry, 'utf8'));
}

function isExpectedOoxml(bytes: Uint8Array, format: 'docx' | 'pptx') {
  return (
    bytes[0] === 80 &&
    bytes[1] === 75 &&
    containsZipEntry(bytes, '[Content_Types].xml') &&
    containsZipEntry(
      bytes,
      format === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml',
    )
  );
}

function isExpectedMarkdown(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try {
    return Boolean(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim(),
    );
  } catch {
    return false;
  }
}

function aiReportType(format: CreateReportInput['format']) {
  if (format === 'docx') return 'word';
  if (format === 'pptx') return 'ppt';
  return 'md';
}

export async function generateAiReportArtifact(
  input: GenerateAiReportInput,
): Promise<ReportArtifact> {
  const form = new FormData();
  form.set('text', buildAiReportPrompt(input));
  form.set('type', aiReportType(input.parameters.format));
  form.set(
    'filename',
    safeReportFilename(input.parameters.title, input.parameters.format).replace(
      /\.(?:docx|md|pptx)$/u,
      '',
    ),
  );
  form.set('language', 'Chinese');
  form.set('project_name', input.projectName);
  form.set('report_type', reportTypeLabels[input.parameters.reportType]);
  form.set('generated_date', input.createdAt.toLocaleDateString('zh-CN'));
  if (input.requestedBy) form.set('requested_by', input.requestedBy);
  form.set(
    'n_slides',
    String(Math.min(12, Math.max(2, input.parameters.sections.length + 1))),
  );
  form.set('template', input.template);
  orderedImageAssets(input).forEach((asset, index) => {
    const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
    form.append(
      'images',
      new Blob([Uint8Array.from(asset.bytes).buffer], {
        type: asset.mimeType,
      }),
      `report-image-${String(index + 1).padStart(2, '0')}.${extension}`,
    );
  });

  let response: Response;
  try {
    response = await (input.fetchImplementation ?? fetch)(input.apiUrl, {
      body: form,
      headers: { Accept: reportMimeType(input.parameters.format) },
      method: 'POST',
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (error) {
    throw new ReportAiAdapterError(
      'REPORT_AI_REQUEST_FAILED',
      `AI 报告服务请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new ReportAiAdapterError(
      'REPORT_AI_REQUEST_FAILED',
      `AI 报告服务返回 HTTP ${response.status}`,
    );
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > input.maxOutputBytes) {
    throw new ReportAiAdapterError(
      'REPORT_AI_OUTPUT_TOO_LARGE',
      'AI 报告服务返回的文件超过平台大小限制',
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) {
    throw new ReportAiAdapterError(
      'REPORT_AI_RESPONSE_INVALID',
      'AI 报告服务返回了空文件',
    );
  }
  if (bytes.byteLength > input.maxOutputBytes) {
    throw new ReportAiAdapterError(
      'REPORT_AI_OUTPUT_TOO_LARGE',
      'AI 报告服务返回的文件超过平台大小限制',
    );
  }
  const expectedType = input.parameters.format;
  if (
    expectedType === 'md'
      ? !isExpectedMarkdown(bytes)
      : !isExpectedOoxml(bytes, expectedType)
  ) {
    throw new ReportAiAdapterError(
      'REPORT_AI_RESPONSE_INVALID',
      expectedType === 'md'
        ? 'AI 报告服务没有返回有效的 UTF-8 Markdown 文档'
        : 'AI 报告服务没有返回有效的 Office 文档',
    );
  }

  const generatedType = response.headers.get('x-generated-file-type');
  const generatedTypeMatches =
    !generatedType ||
    generatedType === expectedType ||
    (expectedType === 'md' && generatedType === 'markdown');
  if (!generatedTypeMatches) {
    throw new ReportAiAdapterError(
      'REPORT_AI_RESPONSE_INVALID',
      `AI 报告服务返回了不匹配的文件类型：${generatedType}`,
    );
  }
  return {
    bytes,
    filename: safeReportFilename(input.parameters.title, expectedType),
    mimeType: reportMimeType(expectedType),
  };
}
