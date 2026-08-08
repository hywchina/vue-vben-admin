import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKFLOW_CATALOG } from './catalog';
import { parseWorkflowVersion, publicParameterSchema } from './schema';

describe('comfyUI workflow catalog', () => {
  it('registers all 18 API workflows with valid controlled mappings', async () => {
    expect(WORKFLOW_CATALOG).toHaveLength(18);
    expect(
      new Set(WORKFLOW_CATALOG.map((entry) => entry.application.key)).size,
    ).toBe(18);

    for (const entry of WORKFLOW_CATALOG) {
      const apiJson = JSON.parse(
        await readFile(
          resolve(process.cwd(), 'workflows/comfyui', entry.fileName),
          'utf8',
        ),
      ) as unknown;
      const parsed = parseWorkflowVersion({ apiJson, ...entry.version });
      expect(Object.keys(parsed.apiJson).length).toBeGreaterThan(0);
      expect(parsed.outputSchema.length).toBeGreaterThan(0);
      for (const field of publicParameterSchema(parsed.parameterSchema)) {
        expect(field).not.toHaveProperty('nodeId');
        expect(field).not.toHaveProperty('targets');
      }
    }
  });

  it('uses explicit current-node wiring for EasyMark region outputs', async () => {
    const loadWorkflow = async (fileName: string) =>
      JSON.parse(
        await readFile(
          resolve(process.cwd(), 'workflows/comfyui', fileName),
          'utf8',
        ),
      ) as Record<
        string,
        { class_type: string; inputs: Record<string, unknown> }
      >;
    const region = await loadWorkflow('region-edit-v1.json');
    const marker = await loadWorkflow('region-marker-edit-v1.json');

    expect(region['291']?.inputs.context).toEqual(['277', 0]);
    expect(marker['363']?.inputs.context).toEqual(['277', 0]);
    expect(marker['366']?.inputs.images).toEqual(['359', 1]);
    expect(Object.values(region)).not.toContainEqual(
      expect.objectContaining({ class_type: 'Anything Everywhere' }),
    );
    expect(Object.values(marker)).not.toContainEqual(
      expect.objectContaining({ class_type: 'Anything Everywhere' }),
    );
  });
});
