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
  parameters: CreateReportInput;
  projectName: string;
  requestedBy?: string;
}) {
  const { parameters } = input;
  const lines = [
    '请根据以下真实项目资料生成一份结构完整、表达专业的中文轨道客室设计报告。',
    '不得虚构未提供的项目数据、试验结论、法规符合性或量化指标。',
    `报告类型：${reportTypeLabels[parameters.reportType]}`,
    `项目名称：${input.projectName}`,
    `报告标题：${parameters.title}`,
    `交付格式：${parameters.format === 'md' ? 'Markdown（.md）' : parameters.format.toUpperCase()}`,
  ];
  if (input.requestedBy) lines.push(`编制人：${input.requestedBy}`);
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
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
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
  form.set(
    'n_slides',
    String(Math.min(20, Math.max(1, input.parameters.sections.length + 2))),
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
