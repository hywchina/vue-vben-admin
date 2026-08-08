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
});
