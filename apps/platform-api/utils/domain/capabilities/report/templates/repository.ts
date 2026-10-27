import type { CurrentIdentity } from '../../../../identity';
import type {
  ReportTemplateView,
  TemplateConfiguration,
  TemplateManifest,
} from './schema';

import { z } from 'zod';

import { useDatabase } from '../../../../database';
import { ApiError } from '../../../../response';
import { requireProjectAccess } from '../../../projects/access';
import { requireTemplateValue } from './required';
export interface TemplateSnapshot {
  id: string;
  projectId: string;
  name: string;
  format: 'docx' | 'pptx';
  revision: number;
  objectKey: string;
  sha256: string;
  manifest: TemplateManifest;
  configuration: TemplateConfiguration;
}
export interface TemplateRow extends Omit<
  ReportTemplateView,
  'createdAt' | 'status'
> {
  status: 'draft' | 'pending' | 'ready';
  objectKey: string;
  filename: string;
  sizeBytes: number;
  createdAt: Date;
}
export async function requireReportTemplate(
  identity: CurrentIdentity,
  id: string,
  mode: 'read' | 'write' = 'read',
) {
  const sql = useDatabase();
  const [row] = await sql<TemplateRow[]>`
    SELECT id, project_id AS "projectId", name, format, revision, status,
      manifest, configuration, sha256, object_key AS "objectKey", filename,
      size_bytes::int AS "sizeBytes", created_at AS "createdAt"
    FROM report_templates WHERE id = ${id} AND deleted_at IS NULL
  `;
  if (!row)
    throw new ApiError(404, 'REPORT_TEMPLATE_NOT_FOUND', '报告模板不存在');
  await requireProjectAccess(identity, row.projectId, mode);
  return row;
}
export function templateView(row: TemplateRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    format: row.format,
    revision: row.revision,
    status: row.status,
    manifest: row.manifest,
    configuration: row.configuration,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
  };
}
export async function snapshotReportTemplate(
  identity: CurrentIdentity,
  input: {
    format: string;
    projectId: string;
    reportTemplateId?: string;
    reportTemplateRevision?: number;
  },
): Promise<null | TemplateSnapshot> {
  if (!input.reportTemplateId) return null;
  const row = await requireReportTemplate(identity, input.reportTemplateId);
  if (row.projectId !== input.projectId || row.format !== input.format)
    throw new ApiError(
      400,
      'REPORT_TEMPLATE_MISMATCH',
      '模板必须属于当前项目，且与输出格式一致',
    );
  if (
    row.status !== 'ready' ||
    !row.configuration ||
    row.revision !== input.reportTemplateRevision
  )
    throw new ApiError(
      409,
      'REPORT_TEMPLATE_NOT_READY',
      '模板尚未确认或已更新，请重新选择',
    );
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    format: row.format,
    revision: row.revision,
    objectKey: row.objectKey,
    sha256: row.sha256,
    manifest: row.manifest,
    configuration: row.configuration,
  };
}
export function validateTemplateBindings(
  manifest: TemplateManifest,
  config: TemplateConfiguration,
) {
  const elements = new Map(manifest.elements.map((item) => [item.id, item]));
  const active = config.bindings.filter((item) => item.role !== 'fixed');
  if (config.repeatSections && manifest.format === 'pptx') {
    const parts = [
      ...new Set(
        active
          .filter((item) =>
            [
              'image-caption',
              'images',
              'section-body',
              'section-title',
            ].includes(item.role),
          )
          .map((item) => elements.get(item.id)?.part)
          .filter(Boolean),
      ),
    ];
    for (const part of parts)
      if (
        !active.some(
          (item) =>
            item.role === 'section-title' &&
            elements.get(item.id)?.part === part,
        )
      )
        throw new ApiError(
          400,
          'REPORT_TEMPLATE_BINDING_INVALID',
          '每张可扩展内容版式都需要章节标题位置',
        );
    const kinds = parts.map((part) => {
      const local = active.filter(
        (item) => elements.get(item.id)?.part === part,
      );
      const images = local.filter((item) => item.role === 'images').length;
      const body = local.some((item) => item.role === 'section-body');
      if (body) return images > 0 ? `mixed-${images}` : 'text';
      return `images-${images}`;
    });
    if (new Set(kinds).size !== kinds.length)
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        '自动扩展时，纯正文以及相同图槽数量的图文/图册版式各保留一张；请将重复版式中的内容位置改为保持原样',
      );
  }
  const imageGroups = new Map<number, number>();
  for (const binding of config.bindings) {
    const item = elements.get(binding.id);
    if (!item)
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        '模板包含不存在的内容位置',
      );
    if (binding.role !== 'fixed' && item.unsupportedReason)
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        item.unsupportedReason,
      );
    if (
      binding.role !== 'fixed' &&
      binding.role !== 'images' &&
      item.kind === 'image'
    )
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        '原图片位置只能设置为图片或保持原样',
      );
    if (binding.role === 'images' && manifest.format === 'docx') {
      const index = config.repeatSections ? 0 : binding.sectionIndex;
      imageGroups.set(index, (imageGroups.get(index) ?? 0) + 1);
      if (requireTemplateValue(imageGroups.get(index)) > 1)
        throw new ApiError(
          400,
          'REPORT_TEMPLATE_BINDING_INVALID',
          'Word 每个章节仅配置一个图片位置，该位置会按所选图片展开',
        );
    }
    if (
      binding.role === 'images' &&
      item.part !== 'word/document.xml' &&
      manifest.format === 'docx'
    )
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        '图片位置必须在正文中',
      );
    if (
      binding.role === 'images' &&
      manifest.format === 'pptx' &&
      (!item.width || !item.height)
    )
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        '图片位置必须具有明确的宽高',
      );
    if (
      config.repeatSections &&
      binding.role.startsWith('section-') &&
      manifest.format === 'docx' &&
      item.part !== 'word/document.xml'
    )
      throw new ApiError(
        400,
        'REPORT_TEMPLATE_BINDING_INVALID',
        '循环章节必须位于正文中',
      );
  }
}
export function parseReportTemplateId(value: unknown) {
  const result = z.string().uuid().safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'REPORT_TEMPLATE_ID_INVALID', '模板标识无效');
  return result.data;
}
