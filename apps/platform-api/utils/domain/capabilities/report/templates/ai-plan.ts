import type { RenderReportInput } from '../renderer';
import type { TemplateSnapshot } from './repository';

import { z } from 'zod';

import { ReportAiAdapterError } from '../ai-adapter';
import { requireTemplateValue } from './required';
const planSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            id: z.number().int().min(0).max(7),
            body: z.string().max(10_000),
            image_ids: z.array(z.string()).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export async function planTemplateReport(
  input: RenderReportInput,
  snapshot: TemplateSnapshot,
  config: {
    apiUrl: string;
    fetchImplementation?: typeof fetch;
    timeoutMs: number;
  },
): Promise<RenderReportInput> {
  const previews: Array<{
    assetId: string;
    id: string;
  }> = [];
  let previewBytes = 0;
  for (const [sectionIndex, section] of input.parameters.sections.entries())
    for (const [imageIndex, image] of section.images.entries()) {
      const asset = input.assets.get(image.assetId);
      if (
        !asset ||
        previews.some((item) => item.assetId === image.assetId) ||
        previews.length >= 8 ||
        previews.filter((item) => item.id.startsWith(`${sectionIndex}:`))
          .length >= 4 ||
        asset.bytes.byteLength > 20 * 1024 * 1024 ||
        previewBytes + asset.bytes.byteLength > 48 * 1024 * 1024
      )
        continue;
      previewBytes += asset.bytes.byteLength;
      previews.push({
        id: `${sectionIndex}:${imageIndex}`,
        assetId: image.assetId,
      });
    }
  const form = new FormData();
  form.set(
    'source',
    JSON.stringify({
      title: input.parameters.title,
      summary: input.parameters.summary,
      project_name: input.projectName,
      template_rules: JSON.stringify({
        format: snapshot.format,
        fonts: snapshot.manifest.fonts,
        fields: [
          ...new Set(
            snapshot.configuration.bindings.map((binding) => binding.role),
          ),
        ],
        repeatSections: snapshot.configuration.repeatSections,
      }),
      sections: input.parameters.sections.map((section, id) => ({
        id,
        title: section.title,
        body: section.body,
        images: section.images.map((image, index) => ({
          id: `${id}:${index}`,
          caption: image.caption,
          name: input.assets.get(image.assetId)?.name ?? '',
        })),
      })),
      preview_ids: previews.map((item) => item.id),
    }),
  );
  for (const preview of previews) {
    const asset = requireTemplateValue(input.assets.get(preview.assetId));
    form.append(
      'images',
      new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.mimeType }),
      asset.filename,
    );
  }
  const url = `${config.apiUrl.replace(/\/+$/u, '')}/template-plan`;
  let response: Response;
  try {
    response = await (config.fetchImplementation ?? fetch)(url, {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw new ReportAiAdapterError(
      'REPORT_AI_REQUEST_FAILED',
      'AI 模板内容规划服务请求失败',
    );
  }
  if (!response.ok)
    throw new ReportAiAdapterError(
      'REPORT_AI_REQUEST_FAILED',
      `AI 模板内容规划服务返回 HTTP ${response.status}`,
    );
  // A content-only plan is bounded independently of the generated file limit.
  const reader = response.body?.getReader();
  if (!reader)
    throw new ReportAiAdapterError(
      'REPORT_AI_RESPONSE_INVALID',
      'AI 内容规划为空',
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 512 * 1024) {
        await reader.cancel();
        throw new Error('too large');
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const plan = planSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (plan.sections.length !== input.parameters.sections.length)
      throw new Error('chapter count');
    const sections = input.parameters.sections.map((section, index) => {
      const generated = requireTemplateValue(plan.sections[index]);
      const expectedIds = section.images
        .map((_, imageIndex) => `${index}:${imageIndex}`)
        .toSorted();
      if (
        generated.id !== index ||
        JSON.stringify([...generated.image_ids].toSorted()) !==
          JSON.stringify(expectedIds) ||
        (section.body.trim() && !generated.body.trim())
      )
        throw new Error('chapter content');
      // Numeric constraints are facts, including qualified values. Missing source
      // numbers are a hard failure, never silently accepted as a polished report.
      const outputNumbers = new Set(generated.body.match(/\d+(?:\.\d+)?/gu));
      for (const number of section.body.match(/\d+(?:\.\d+)?/gu) ?? [])
        if (!outputNumbers.has(number))
          throw new Error('source number omitted');
      return {
        ...section,
        body: generated.body,
        images: generated.image_ids.map((id) =>
          requireTemplateValue(section.images[Number(id.split(':')[1])]),
        ),
      };
    });
    return { ...input, parameters: { ...input.parameters, sections } };
  } catch {
    throw new ReportAiAdapterError(
      'REPORT_AI_RESPONSE_INVALID',
      'AI 内容规划不满足章节、图片或事实保留约束，请检查原始内容后重试',
    );
  } finally {
    reader.releaseLock();
  }
}
